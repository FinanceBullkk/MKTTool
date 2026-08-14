import { afterAll, beforeEach, describe, expect, it, vi } from "vitest";
import { AuthorizationError } from "@/lib/auth/require-actor";

vi.mock("next/cache", () => ({ revalidatePath: () => {} }));
process.env.TICKET_SIGNING_KEY = "11".repeat(32);
const ADMIN = { userId: "admin", email: "admin@example.com", role: "ADMIN" as const };
let role: "ADMIN" | "OPERATOR" = "ADMIN";
vi.mock("@/lib/auth/require-actor", async (original) => ({
  ...(await original<typeof import("@/lib/auth/require-actor")>()),
  requireAdmin: async () => {
    if (role !== "ADMIN") throw new AuthorizationError("ADMIN only.", false);
    return ADMIN;
  },
}));

const { prisma } = await import("@/lib/db/prisma-client");
const { generateRelayDeviceKeyPair } = await import("@/lib/tickets/relay-device-key");
const { mintBootstrapAuthorization, completeBootstrap } = await import("./bootstrap-actions");

beforeEach(async () => {
  role = "ADMIN";
  await prisma.relayDevice.deleteMany();
  await prisma.user.deleteMany();
  await prisma.user.create({ data: { id: ADMIN.userId, name: "Admin", email: ADMIN.email, updatedAt: new Date() } });
});
afterAll(() => prisma.$disconnect());

async function device() {
  const key = generateRelayDeviceKeyPair();
  return prisma.relayDevice.create({ data: { name: "First PC", userId: ADMIN.userId, publicKey: key.publicKeyHex } });
}

describe("ADMIN bootstrap", () => {
  it("does not mint bootstrap authorization after device retirement has started", async () => {
    const target = await device();
    await prisma.relayDevice.update({
      where: { id: target.id },
      data: { retirementId: "retirement-in-progress" },
    });
    const form = new FormData();
    form.set("deviceId", target.id);

    expect((await mintBootstrapAuthorization(null, form)).ok).toBe(false);
    const saved = await prisma.relayDevice.findUniqueOrThrow({ where: { id: target.id } });
    expect(saved.bootstrapAuthorization).toBeNull();
    expect(saved.operatorKeyGrantGeneration).toBe(0);
  });

  it("mints one five-minute authorization only for an ADMIN", async () => {
    const target = await device();
    const form = new FormData(); form.set("deviceId", target.id);
    expect((await mintBootstrapAuthorization(null, form)).ok).toBe(true);
    const saved = await prisma.relayDevice.findUniqueOrThrow({ where: { id: target.id } });
    expect(saved.bootstrapAuthorizationExpiresAt!.getTime() - Date.now()).toBeGreaterThan(290_000);
    const repeated = await mintBootstrapAuthorization(null, form);
    expect("authorization" in repeated ? repeated.authorization : null).toBe(saved.bootstrapAuthorization);
    expect((await prisma.relayDevice.findUniqueOrThrow({ where: { id: target.id } })).operatorKeyGrantGeneration).toBe(1);
    role = "OPERATOR";
    expect((await mintBootstrapAuthorization(null, form)).ok).toBe(false);
  });

  it("records readiness only after the recipient proof and is idempotent", async () => {
    const target = await device();
    await prisma.relayDevice.update({
      where: { id: target.id },
      data: {
        operatorKeyGrantGeneration: 1,
        operatorKeyCompletionHash: "c1cda26362828b69266512052b97cb3729e3b052e4ade47c0a1e3383defe73c7",
        bootstrapAuthorizationId: "bootstrap-1",
        bootstrapAuthorizationExpiresAt: new Date(Date.now() + 300_000),
      },
    });
    const form = new FormData();
    form.set("deviceId", target.id); form.set("grantId", "bootstrap-1"); form.set("generation", "1"); form.set("proof", "proof");
    expect((await completeBootstrap(null, form)).ok).toBe(true);
    expect((await completeBootstrap(null, form)).ok).toBe(true);
    form.set("generation", "2");
    expect((await completeBootstrap(null, form)).ok).toBe(false);
    expect((await prisma.relayDevice.findUniqueOrThrow({ where: { id: target.id } })).operatorKeyReadyAt).not.toBeNull();
  });

  it("permits only one active first-device bootstrap authorization", async () => {
    const first = await device();
    const secondKey = generateRelayDeviceKeyPair();
    const second = await prisma.relayDevice.create({
      data: { name: "Second PC", userId: ADMIN.userId, publicKey: secondKey.publicKeyHex },
    });
    const firstForm = new FormData(); firstForm.set("deviceId", first.id);
    const secondForm = new FormData(); secondForm.set("deviceId", second.id);
    expect((await mintBootstrapAuthorization(null, firstForm)).ok).toBe(true);
    expect((await mintBootstrapAuthorization(null, secondForm)).ok).toBe(false);
  });

  it("refuses completion when another PC becomes ready after authorization was minted", async () => {
    const target = await device();
    const otherKey = generateRelayDeviceKeyPair();
    await prisma.relayDevice.create({
      data: {
        name: "PC that finished first",
        userId: ADMIN.userId,
        publicKey: otherKey.publicKeyHex,
        operatorKeyReadyAt: new Date(),
      },
    });
    await prisma.relayDevice.update({
      where: { id: target.id },
      data: {
        operatorKeyGrantGeneration: 1,
        operatorKeyCompletionHash: "c1cda26362828b69266512052b97cb3729e3b052e4ade47c0a1e3383defe73c7",
        bootstrapAuthorizationId: "bootstrap-lost-race",
      },
    });
    const form = new FormData();
    form.set("deviceId", target.id);
    form.set("grantId", "bootstrap-lost-race");
    form.set("generation", "1");
    form.set("proof", "proof");

    await expect(completeBootstrap(null, form)).resolves.toMatchObject({
      ok: false,
      message: expect.stringContaining("another PC became ready"),
    });
    expect((await prisma.relayDevice.findUniqueOrThrow({ where: { id: target.id } })).operatorKeyReadyAt).toBeNull();
  });
});
