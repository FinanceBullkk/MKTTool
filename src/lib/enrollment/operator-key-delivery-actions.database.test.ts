import { afterAll, beforeEach, describe, expect, it, vi } from "vitest";
import { hashGrantCompletionProof, hashOperatorKeyGrant } from "@/lib/relay/enrollment/grant-digests";

vi.mock("next/cache", () => ({ revalidatePath: () => {} }));
process.env.TICKET_SIGNING_KEY = "11".repeat(32);
process.env.ALLOWED_EMAILS = "operator@example.com";
const ACTOR = { userId: "operator", email: "operator@example.com", role: "OPERATOR" as const };
let actor: { userId: string; email: string; role: "ADMIN" | "OPERATOR" } = ACTOR;
vi.mock("@/lib/auth/require-actor", async (original) => ({
  ...(await original<typeof import("@/lib/auth/require-actor")>()),
  requireActor: async () => actor,
}));

const { prisma } = await import("@/lib/db/prisma-client");
const { generateRelayDeviceKeyPair } = await import("@/lib/tickets/relay-device-key");
const { sealForDevice } = await import("@/lib/tickets/ticket-sealed-box");
const { readOperatorKeyDelivery, completeOperatorKeyDelivery } = await import("./operator-key-delivery-actions");

beforeEach(async () => {
  actor = ACTOR;
  await prisma.relayDevice.deleteMany();
  await prisma.user.deleteMany();
  await prisma.user.create({ data: { id: ACTOR.userId, name: "Operator", email: ACTOR.email, updatedAt: new Date() } });
  await prisma.user.create({ data: { id: "other", name: "Other", email: "other@example.com", updatedAt: new Date() } });
});
afterAll(() => prisma.$disconnect());

async function grantedDevice() {
  const key = generateRelayDeviceKeyPair();
  const grant = sealForDevice({ vaultKeyOperator: "c4".repeat(32) }, key.publicKeyHex);
  return prisma.relayDevice.create({
    data: {
      name: "Operator PC", userId: ACTOR.userId, publicKey: key.publicKeyHex,
      operatorKeyGrant: JSON.stringify(grant), operatorKeyGrantId: "grant-1",
      operatorKeyGrantGeneration: 1, operatorKeyGrantHash: hashOperatorKeyGrant(grant),
    },
  });
}

describe("operator key delivery actions", () => {
  it("mints a live 30-second authorization from the current owner and generation", async () => {
    const target = await grantedDevice();
    const form = new FormData(); form.set("deviceId", target.id);
    const result = await readOperatorKeyDelivery(null, form);
    expect(result.ok).toBe(true);
    expect("delivery" in result && result.delivery?.authorization).toBeTruthy();
    const saved = await prisma.relayDevice.findUniqueOrThrow({ where: { id: target.id } });
    expect(saved.operatorKeyDeliveryExpiresAt!.getTime() - Date.now()).toBeGreaterThan(20_000);
  });

  it("requires an administrator to replace a legacy pending grant", async () => {
    const key = generateRelayDeviceKeyPair();
    const target = await prisma.relayDevice.create({
      data: {
        name: "Legacy operator PC",
        userId: ACTOR.userId,
        publicKey: key.publicKeyHex,
        operatorKeyGrant: JSON.stringify(sealForDevice({ vaultKeyOperator: "c4".repeat(32) }, key.publicKeyHex)),
      },
    });
    const form = new FormData();
    form.set("deviceId", target.id);

    await expect(readOperatorKeyDelivery(null, form)).resolves.toMatchObject({
      ok: false,
      message: expect.stringContaining("issue a new grant"),
    });
  });

  it("renews an expired authorization without replacing its completion challenge", async () => {
    const target = await grantedDevice();
    const form = new FormData(); form.set("deviceId", target.id);
    await readOperatorKeyDelivery(null, form);
    const first = await prisma.relayDevice.findUniqueOrThrow({ where: { id: target.id } });
    await prisma.relayDevice.update({ where: { id: target.id }, data: { operatorKeyDeliveryExpiresAt: new Date(0) } });
    await readOperatorKeyDelivery(null, form);
    const second = await prisma.relayDevice.findUniqueOrThrow({ where: { id: target.id } });
    expect(second.operatorKeyCompletionHash).toBe(first.operatorKeyCompletionHash);
    expect(second.operatorKeyCompletionGrant).toBe(first.operatorKeyCompletionGrant);
    expect(second.operatorKeyDeliveryAuthorization).not.toBe(first.operatorKeyDeliveryAuthorization);
  });

  it.each([
    { completionGrant: "present", completionHash: null },
    { completionGrant: null, completionHash: hashGrantCompletionProof("orphaned-proof") },
    { completionGrant: "malformed", completionHash: null },
  ])("returns a clean error for partial completion state: $completionGrant/$completionHash", async ({ completionGrant, completionHash }) => {
    const target = await grantedDevice();
    const completion = sealForDevice({ proof: "orphaned-proof" }, target.publicKey);
    await prisma.relayDevice.update({
      where: { id: target.id },
      data: {
        operatorKeyCompletionGrant: completionGrant === "present"
          ? JSON.stringify(completion)
          : completionGrant === "malformed" ? "not-json" : null,
        operatorKeyCompletionHash: completionHash,
      },
    });
    const form = new FormData(); form.set("deviceId", target.id);

    await expect(readOperatorKeyDelivery(null, form)).resolves.toMatchObject({
      ok: false,
      message: expect.stringContaining("incomplete"),
    });
  });

  it("rejects wrong owner and revoked devices before minting", async () => {
    const target = await grantedDevice();
    await prisma.relayDevice.update({ where: { id: target.id }, data: { userId: "other" } });
    const form = new FormData(); form.set("deviceId", target.id);
    expect((await readOperatorKeyDelivery(null, form)).ok).toBe(false);
    await prisma.relayDevice.update({ where: { id: target.id }, data: { userId: ACTOR.userId, revokedAt: new Date() } });
    expect((await readOperatorKeyDelivery(null, form)).ok).toBe(false);
  });

  it("does not let an ADMIN role bypass delivery ownership", async () => {
    const target = await grantedDevice();
    actor = { ...ACTOR, role: "ADMIN" };
    await prisma.relayDevice.update({ where: { id: target.id }, data: { userId: "other" } });
    const form = new FormData(); form.set("deviceId", target.id);
    expect((await readOperatorKeyDelivery(null, form)).ok).toBe(false);
    expect((await prisma.relayDevice.findUniqueOrThrow({ where: { id: target.id } })).operatorKeyDeliveryAuthorization).toBeNull();
  });

  it("does not become ready before proof, then commits idempotently after proof", async () => {
    const target = await grantedDevice();
    const proof = "recipient-proof";
    await prisma.relayDevice.update({
      where: { id: target.id },
      data: { operatorKeyCompletionHash: hashGrantCompletionProof(proof), operatorKeyDeliveryExpiresAt: new Date(Date.now() + 30_000) },
    });
    expect((await prisma.relayDevice.findUniqueOrThrow({ where: { id: target.id } })).operatorKeyReadyAt).toBeNull();
    const form = new FormData();
    form.set("deviceId", target.id); form.set("grantId", "grant-1"); form.set("generation", "1"); form.set("proof", proof);
    expect((await completeOperatorKeyDelivery(null, form)).ok).toBe(true);
    expect((await completeOperatorKeyDelivery(null, form)).ok).toBe(true);
  });

  it("commits a cached recipient proof after the 30-second authorization window", async () => {
    const target = await grantedDevice();
    const proof = "cached-proof";
    await prisma.relayDevice.update({ where: { id: target.id }, data: {
      operatorKeyCompletionHash: hashGrantCompletionProof(proof),
      operatorKeyDeliveryExpiresAt: new Date(Date.now() - 1),
    } });
    const form = new FormData();
    form.set("deviceId", target.id); form.set("grantId", "grant-1"); form.set("generation", "1"); form.set("proof", proof);
    expect((await completeOperatorKeyDelivery(null, form)).ok).toBe(true);
  });

  it("serializes a normal Ready commit with the global bootstrap lock", async () => {
    const target = await grantedDevice();
    const proof = "locked-proof";
    await prisma.relayDevice.update({
      where: { id: target.id },
      data: { operatorKeyCompletionHash: hashGrantCompletionProof(proof) },
    });
    const form = new FormData();
    form.set("deviceId", target.id);
    form.set("grantId", "grant-1");
    form.set("generation", "1");
    form.set("proof", proof);

    let completion: Promise<Awaited<ReturnType<typeof completeOperatorKeyDelivery>>> | undefined;
    await prisma.$transaction(async (tx) => {
      await tx.$executeRaw`SELECT pg_advisory_xact_lock(40304)`;
      completion = completeOperatorKeyDelivery(null, form);
      await new Promise((resolve) => setTimeout(resolve, 50));
      expect((await tx.relayDevice.findUniqueOrThrow({ where: { id: target.id } })).operatorKeyReadyAt).toBeNull();
    });

    await expect(completion).resolves.toMatchObject({ ok: true });
  });

});
