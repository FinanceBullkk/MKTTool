import { afterAll, beforeEach, describe, expect, it, vi } from "vitest";
import { fingerprintOperatorKey } from "@/lib/crypto/operator-key-fingerprint";
import { hashGrantCompletionProof } from "@/lib/relay/enrollment/grant-digests";

vi.mock("next/cache", () => ({ revalidatePath: () => {} }));

const OPERATOR_KEY = "500492c4cba32f2a2f5e5c9f0a002c5998c98ea1f0f93afc862a02a7059e8e77";
process.env.TICKET_SIGNING_KEY =
  "411a055f1c441462bbf17be08157633b7f4e99db8462b44fa680ddeb6e6c654e";
process.env.VAULT_KEY_OPERATOR_FINGERPRINT = fingerprintOperatorKey(OPERATOR_KEY);

const OWNER = { userId: "owner", email: "owner@example.com", role: "OPERATOR" as const };
const OTHER = { userId: "other", email: "other@example.com", role: "OPERATOR" as const };
let actor = OWNER;

vi.mock("@/lib/auth/require-actor", async (original) => ({
  ...(await original<typeof import("@/lib/auth/require-actor")>()),
  requireActor: async () => actor,
}));

const { prisma } = await import("@/lib/db/prisma-client");
const { generateRelayDeviceKeyPair } = await import("@/lib/tickets/relay-device-key");
const { mintBootstrapAuthorization, completeBootstrap } = await import("./bootstrap-actions");

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

afterAll(() => prisma.$disconnect());

async function device(userId = OWNER.userId) {
  const key = generateRelayDeviceKeyPair();
  return prisma.relayDevice.create({
    data: { name: `${userId} PC`, userId, publicKey: key.publicKeyHex },
  });
}

async function stageCompletion(targetId: string, grantId = "bootstrap-1", generation = 1) {
  const proof = "proof";
  await prisma.relayDevice.update({
    where: { id: targetId },
    data: {
      operatorKeyGrantGeneration: generation,
      operatorKeyCompletionHash: hashGrantCompletionProof(proof),
      bootstrapAuthorizationId: grantId,
      bootstrapAuthorizationExpiresAt: new Date(Date.now() + 300_000),
    },
  });
  return { proof, grantId, generation };
}

function completionForm(
  targetId: string,
  completion: { proof: string; grantId: string; generation: number },
  keyFingerprint = fingerprintOperatorKey(OPERATOR_KEY),
) {
  const form = new FormData();
  form.set("deviceId", targetId);
  form.set("grantId", completion.grantId);
  form.set("generation", String(completion.generation));
  form.set("proof", completion.proof);
  form.set("keyFingerprint", keyFingerprint);
  return form;
}

describe("owner operator-key self-enrollment", () => {
  it("does not mint authorization after device retirement has started", async () => {
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

  it("lets an operator authorize only their own PC and supersedes stale attempts", async () => {
    const target = await device();
    const form = new FormData();
    form.set("deviceId", target.id);

    const first = await mintBootstrapAuthorization(null, form);
    const second = await mintBootstrapAuthorization(null, form);
    expect(first.ok).toBe(true);
    expect(second.ok).toBe(true);
    const saved = await prisma.relayDevice.findUniqueOrThrow({ where: { id: target.id } });
    expect(saved.operatorKeyGrantGeneration).toBe(2);
    expect("authorization" in first ? first.authorization : null)
      .not.toBe("authorization" in second ? second.authorization : null);

    actor = OTHER;
    expect((await mintBootstrapAuthorization(null, form)).ok).toBe(false);
  });

  it("records readiness only after the recipient proof and correct key fingerprint", async () => {
    const target = await device();
    const completion = await stageCompletion(target.id);
    const form = completionForm(target.id, completion);

    expect((await completeBootstrap(null, form)).ok).toBe(true);
    expect((await completeBootstrap(null, form)).ok).toBe(true);
    expect((await prisma.relayDevice.findUniqueOrThrow({ where: { id: target.id } })).operatorKeyReadyAt)
      .not.toBeNull();
  });

  it("rejects a wrong key fingerprint without consuming the authorization", async () => {
    const target = await device();
    const completion = await stageCompletion(target.id);
    const result = await completeBootstrap(
      null,
      completionForm(target.id, completion, fingerprintOperatorKey("12".repeat(32))),
    );

    expect(result).toMatchObject({ ok: false, message: expect.stringContaining("does not match") });
    const saved = await prisma.relayDevice.findUniqueOrThrow({ where: { id: target.id } });
    expect(saved.operatorKeyReadyAt).toBeNull();
    expect(saved.bootstrapAuthorizationUsedAt).toBeNull();
  });

  it("rejects completion after the authorization expires", async () => {
    const target = await device();
    const completion = await stageCompletion(target.id);
    await prisma.relayDevice.update({
      where: { id: target.id },
      data: { bootstrapAuthorizationExpiresAt: new Date(Date.now() - 1) },
    });

    expect((await completeBootstrap(null, completionForm(target.id, completion))).ok).toBe(false);
    const saved = await prisma.relayDevice.findUniqueOrThrow({ where: { id: target.id } });
    expect(saved.operatorKeyReadyAt).toBeNull();
    expect(saved.bootstrapAuthorizationUsedAt).toBeNull();
  });

  it("rejects completion after device retirement starts", async () => {
    const target = await device();
    const completion = await stageCompletion(target.id);
    await prisma.relayDevice.update({
      where: { id: target.id },
      data: { retirementId: "retirement-in-progress" },
    });

    expect((await completeBootstrap(null, completionForm(target.id, completion))).ok).toBe(false);
    const saved = await prisma.relayDevice.findUniqueOrThrow({ where: { id: target.id } });
    expect(saved.operatorKeyReadyAt).toBeNull();
    expect(saved.bootstrapAuthorizationUsedAt).toBeNull();
  });

  it("allows independent owners to authorize their own active PCs", async () => {
    const ownerDevice = await device(OWNER.userId);
    const otherDevice = await device(OTHER.userId);
    const ownerForm = new FormData();
    ownerForm.set("deviceId", ownerDevice.id);
    expect((await mintBootstrapAuthorization(null, ownerForm)).ok).toBe(true);

    actor = OTHER;
    const otherForm = new FormData();
    otherForm.set("deviceId", otherDevice.id);
    expect((await mintBootstrapAuthorization(null, otherForm)).ok).toBe(true);
  });

  it("rejects completion by a different signed-in owner", async () => {
    const target = await device();
    const completion = await stageCompletion(target.id);
    actor = OTHER;

    expect(await completeBootstrap(null, completionForm(target.id, completion))).toMatchObject({
      ok: false,
      message: expect.stringContaining("your own Relay PC"),
    });
    expect((await prisma.relayDevice.findUniqueOrThrow({ where: { id: target.id } })).operatorKeyReadyAt)
      .toBeNull();
  });
});
