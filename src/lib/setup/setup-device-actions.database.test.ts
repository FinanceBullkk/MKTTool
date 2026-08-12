import { afterAll, beforeEach, describe, expect, it, vi } from "vitest";

const OWNER = { userId: "setup-owner", email: "owner@example.com", role: "OPERATOR" as const };
const OTHER = { userId: "setup-other", email: "other@example.com", role: "OPERATOR" as const };
let actor = OWNER;

vi.mock("@/lib/auth/require-actor", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/auth/require-actor")>()),
  requireActor: async () => actor,
}));

const { prisma } = await import("@/lib/db/prisma-client");
const { generateRelayDeviceKeyPair } = await import("@/lib/tickets/relay-device-key");
const { inspectSetupDevice } = await import("./setup-device-actions");

async function inspect(fields: { publicKey?: string; deviceId?: string }) {
  const form = new FormData();
  if (fields.publicKey) form.set("publicKey", fields.publicKey);
  if (fields.deviceId) form.set("deviceId", fields.deviceId);
  return inspectSetupDevice(null, form);
}

function deviceOf(result: Awaited<ReturnType<typeof inspect>>) {
  return "device" in result ? result.device : undefined;
}

beforeEach(async () => {
  actor = OWNER;
  await prisma.relayDevice.deleteMany();
  await prisma.user.deleteMany();
  await prisma.user.createMany({
    data: [
      { id: OWNER.userId, name: "Owner", email: OWNER.email, updatedAt: new Date() },
      { id: OTHER.userId, name: "Other", email: OTHER.email, updatedAt: new Date() },
    ],
  });
});

afterAll(async () => prisma.$disconnect());

describe("inspectSetupDevice", () => {
  it("classifies the signed-in owner's active device", async () => {
    const { publicKeyHex } = generateRelayDeviceKeyPair();
    await prisma.relayDevice.create({ data: { name: "PC", userId: OWNER.userId, publicKey: publicKeyHex } });

    const result = await inspect({ publicKey: publicKeyHex });

    expect(deviceOf(result)).toMatchObject({ status: "enrolled", ownerUserId: OWNER.userId });
  });

  it("fails closed for wrong user and revoked key", async () => {
    const wrong = generateRelayDeviceKeyPair().publicKeyHex;
    const revoked = generateRelayDeviceKeyPair().publicKeyHex;
    await prisma.relayDevice.createMany({
      data: [
        { name: "Other PC", userId: OTHER.userId, publicKey: wrong },
        { name: "Revoked PC", userId: OWNER.userId, publicKey: revoked, revokedAt: new Date() },
      ],
    });

    expect(deviceOf(await inspect({ publicKey: wrong }))?.conflict).toBe("wrong-signed-in-user");
    expect(deviceOf(await inspect({ publicKey: revoked }))?.conflict).toBe("revoked-key");
  });

  it("detects a device ID and public key that resolve to different rows", async () => {
    const first = generateRelayDeviceKeyPair().publicKeyHex;
    const second = generateRelayDeviceKeyPair().publicKeyHex;
    const rows = await Promise.all([
      prisma.relayDevice.create({ data: { name: "First", userId: OWNER.userId, publicKey: first } }),
      prisma.relayDevice.create({ data: { name: "Second", userId: OWNER.userId, publicKey: second } }),
    ]);

    const result = await inspect({ publicKey: first, deviceId: rows[1].id });

    expect(deviceOf(result)?.conflict).toBe("shared-windows-account");
  });

  it("fails closed when Relay reports an unknown device ID for a registered public key", async () => {
    const publicKey = generateRelayDeviceKeyPair().publicKeyHex;
    await prisma.relayDevice.create({
      data: { name: "Ready PC", userId: OWNER.userId, publicKey, operatorKeyReadyAt: new Date() },
    });

    const result = await inspect({ publicKey, deviceId: "missing-device-id" });

    expect(deviceOf(result)?.conflict).toBe("device-id-mismatch");
    expect(deviceOf(result)?.operatorKeyReady).not.toBe(true);
  });

  it("marks a legacy pending grant as requiring administrator reissue", async () => {
    const publicKey = generateRelayDeviceKeyPair().publicKeyHex;
    const device = await prisma.relayDevice.create({
      data: { name: "Legacy PC", userId: OWNER.userId, publicKey, operatorKeyGrant: "legacy-ciphertext" },
    });

    const result = await inspect({ publicKey, deviceId: device.id });

    expect(deviceOf(result)).toMatchObject({
      status: "enrolled",
      operatorKeyReady: false,
      operatorKeyGrantNeedsReissue: true,
    });
  });
});
