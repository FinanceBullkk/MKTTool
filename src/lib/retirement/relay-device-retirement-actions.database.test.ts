import { createHash } from "node:crypto";
import { afterAll, beforeEach, describe, expect, it, vi } from "vitest";
import { AuthorizationError, type Actor } from "@/lib/auth/require-actor";

vi.mock("next/cache", () => ({ revalidatePath: () => {} }));
process.env.TICKET_SIGNING_KEY =
  "d0e8f8e9db83cb4084c00acf3be92e7bcc2871900019cb4b84cf25045bdcbeb4";
// Khóa giả nhưng phải trông như hàng thật: chốt C33 từ chối khuôn mẫu điền tạm, và
// `"21".repeat(32)` — giá trị bài này dùng trước đây — là một byte lặp 32 lần. Giá trị cố định
// chứ không `randomBytes`: một khóa rút ngẫu nhiên mỗi lần chạy biến một lần đỏ thành thứ không
// dựng lại nổi. Hai vùng vẫn phải khác nhau, vì bài này canh đúng chuyện tách vùng.
process.env.VAULT_KEY_SERVER =
  "ca7f4274ff3ec1ae147a8c15c50d282e549cb75b540228ae591669a8b151b0af";
process.env.VAULT_KEY_OPERATOR =
  "29301f912d87a15d2aa202f7bdcca5db6e774c117bfd18f79b0a5afe8137354c";

const ADMIN = { userId: "admin", email: "admin@example.com", role: "ADMIN" as const };
const OWNER = { id: "owner", email: "owner@example.com" };
const OWNER_ACTOR: Actor = { userId: OWNER.id, email: OWNER.email, role: "OPERATOR" };
const OTHER_ACTOR: Actor = { userId: "other", email: "other@example.com", role: "OPERATOR" };
const ACCESS_DENIED = "You can only finish cleanup for a revoked Relay PC that you own.";
let actor: Actor | null = ADMIN;

vi.mock("@/lib/auth/require-actor", async (original) => ({
  ...(await original<typeof import("@/lib/auth/require-actor")>()),
  requireActor: async () => {
    if (!actor) throw new AuthorizationError("You are not signed in.", true);
    return actor;
  },
  requireAdmin: async () => {
    if (!actor) throw new AuthorizationError("You are not signed in.", true);
    if (actor.role !== "ADMIN") throw new AuthorizationError("ADMIN only.", false);
    return actor;
  },
}));

const { prisma } = await import("@/lib/db/prisma-client");
const { generateRelayDeviceKeyPair } = await import("@/lib/tickets/relay-device-key");
const { relayPrivateKeyToKeyObject } = await import("@/lib/tickets/relay-device-key");
const { openSealedPayload } = await import("@/lib/tickets/ticket-sealed-box");
const { encryptCredential } = await import("@/lib/crypto/credential-encryption");
const { loadVaultKey } = await import("@/lib/crypto/encryption-key-loader");
const { loadServerSigningKeys, publicKeyFromHex, resetServerSigningKeysCache } = await import(
  "@/lib/tickets/server-signing-key"
);
const { verifyDeviceRetirementAuthorization } = await import(
  "@/lib/relay/retirement/device-retirement-authorization"
);
const { verifyDeviceRetirementFinalization } = await import(
  "@/lib/relay/retirement/device-retirement-finalization"
);
const {
  beginRelayDeviceRetirement,
  completeRelayDeviceRetirement,
  issueRelayDeviceRetirementFinalization,
} = await import("./relay-device-retirement-actions");

beforeEach(async () => {
  actor = ADMIN;
  process.env.TICKET_SIGNING_KEY =
  "d0e8f8e9db83cb4084c00acf3be92e7bcc2871900019cb4b84cf25045bdcbeb4";
  resetServerSigningKeysCache();
  await prisma.auditLog.deleteMany();
  await prisma.account.deleteMany();
  await prisma.relayDevice.deleteMany();
  await prisma.user.deleteMany();
  await prisma.user.createMany({
    data: [
      { id: ADMIN.userId, name: "Admin", email: ADMIN.email, updatedAt: new Date() },
      { id: OWNER.id, name: "Owner", email: OWNER.email, updatedAt: new Date() },
      { id: OTHER_ACTOR.userId, name: "Other", email: OTHER_ACTOR.email, updatedAt: new Date() },
    ],
  });
});

afterAll(async () => {
  process.env.TICKET_SIGNING_KEY =
  "d0e8f8e9db83cb4084c00acf3be92e7bcc2871900019cb4b84cf25045bdcbeb4";
  resetServerSigningKeysCache();
  await prisma.$disconnect();
});

async function seedDevice() {
  const keys = generateRelayDeviceKeyPair();
  const device = await prisma.relayDevice.create({
    data: { name: "Operator PC", userId: OWNER.id, publicKey: keys.publicKeyHex },
  });
  return { device, keys };
}

function form(fields: Record<string, string>): FormData {
  const result = new FormData();
  for (const [name, value] of Object.entries(fields)) result.set(name, value);
  return result;
}

describe("ADMIN Relay device retirement", () => {
  it("revokes first, persists one stable retirement, and issues a recipient-bound authorization", async () => {
    const { device, keys } = await seedDevice();
    await prisma.relayDevice.update({
      where: { id: device.id },
      data: {
        operatorKeyGrant: JSON.stringify({ ephemeralPublicKey: "ab".repeat(32), sealed: "ciphertext" }),
        operatorKeyCompletionGrant: JSON.stringify({ ephemeralPublicKey: "cd".repeat(32), sealed: "proof" }),
        operatorKeyDeliveryAuthorization: "stale-delivery",
        operatorKeyDeliveryExpiresAt: new Date(Date.now() + 60_000),
        bootstrapAuthorization: "stale-bootstrap",
        bootstrapAuthorizationExpiresAt: new Date(Date.now() + 60_000),
      },
    });

    const result = await beginRelayDeviceRetirement(null, form({ deviceId: device.id }));

    expect(result.ok).toBe(true);
    if (!("authorization" in result) || !result.authorization) throw new Error("missing authorization");
    const authorization = verifyDeviceRetirementAuthorization(
      result.authorization,
      loadServerSigningKeys().publicKey,
    );
    expect(authorization).toMatchObject({ deviceId: device.id, recipientPublicKey: keys.publicKeyHex });
    const saved = await prisma.relayDevice.findUniqueOrThrow({ where: { id: device.id } });
    expect(saved.revokedAt).toBeInstanceOf(Date);
    expect(saved.retirementId).toBe(authorization.retirementId);
    expect(saved.retirementCompletedAt).toBeNull();
    expect(saved.operatorKeyGrant).toBeNull();
    expect(saved.operatorKeyCompletionGrant).toBeNull();
    expect(saved.operatorKeyDeliveryAuthorization).toBeNull();
    expect(saved.bootstrapAuthorization).toBeNull();
    expect(await prisma.auditLog.count({ where: { action: "RELAY_DEVICE_RETIREMENT_STARTED" } })).toBe(1);
  });

  it("records local cleanup only after the recipient-only proof and is idempotent", async () => {
    const { device, keys } = await seedDevice();
    const begun = await beginRelayDeviceRetirement(null, form({ deviceId: device.id }));
    if (!("authorization" in begun) || !begun.authorization) throw new Error("missing authorization");
    const authorization = verifyDeviceRetirementAuthorization(
      begun.authorization,
      loadServerSigningKeys().publicKey,
    );
    const opened = openSealedPayload(
      {
        ephemeralPublicKey: authorization.completionEphemeralPublicKey,
        sealed: authorization.completionSealed,
      },
      relayPrivateKeyToKeyObject(keys.privateKeyHex),
    ) as { proof: string };

    const wrong = await completeRelayDeviceRetirement(
      null,
      form({ deviceId: device.id, retirementId: authorization.retirementId, proof: "wrong" }),
    );
    expect(wrong.ok).toBe(false);

    const completion = form({
      deviceId: device.id,
      retirementId: authorization.retirementId,
      proof: opened.proof,
    });
    expect((await completeRelayDeviceRetirement(null, completion)).ok).toBe(true);
    expect((await completeRelayDeviceRetirement(null, completion)).ok).toBe(true);
    const saved = await prisma.relayDevice.findUniqueOrThrow({ where: { id: device.id } });
    expect(saved.retirementCompletedAt).toBeInstanceOf(Date);
    expect(saved.retirementCompletionHash).toBe(
      createHash("sha256").update(opened.proof, "utf8").digest("hex"),
    );
    expect(saved.retirementFinalizationKeyEnc).toBeNull();
    expect(saved.retirementFinalizationAuthorization).toBeTruthy();
    expect(await prisma.auditLog.count({ where: { action: "RELAY_DEVICE_RETIREMENT_COMPLETED" } })).toBe(1);

    const finalized = await issueRelayDeviceRetirementFinalization(
      null,
      form({ deviceId: device.id }),
    );
    if (!("finalizationAuthorization" in finalized) || !finalized.finalizationAuthorization) {
      throw new Error("missing finalization authorization");
    }
    expect(
      verifyDeviceRetirementFinalization(
        finalized.finalizationAuthorization,
        publicKeyFromHex(authorization.finalizationPublicKey),
      ),
    ).toMatchObject({
      retirementId: authorization.retirementId,
      deviceId: device.id,
      recipientPublicKey: keys.publicKeyHex,
      completionHash: saved.retirementCompletionHash,
    });
    expect(() =>
      verifyDeviceRetirementFinalization(
        finalized.finalizationAuthorization!,
        loadServerSigningKeys().publicKey,
      ),
    ).toThrow(/signature/i);

    process.env.TICKET_SIGNING_KEY =
  "46a342d3084b5c8788d32377a8dc7cd74f038e5679347be5f41b70759f4f1416";
    resetServerSigningKeysCache();
    const recovered = await issueRelayDeviceRetirementFinalization(
      null,
      form({ deviceId: device.id }),
    );
    if (!("finalizationAuthorization" in recovered) || !recovered.finalizationAuthorization) {
      throw new Error("missing recovered finalization authorization");
    }
    expect(recovered.finalizationAuthorization).toBe(finalized.finalizationAuthorization);
    expect(() =>
      verifyDeviceRetirementFinalization(
        recovered.finalizationAuthorization!,
        loadServerSigningKeys().publicKey,
      ),
    ).toThrow(/signature/i);
  });

  it("allows the owner to resume cleanup after an earlier emergency revoke", async () => {
    const { device } = await seedDevice();
    await prisma.relayDevice.update({ where: { id: device.id }, data: { revokedAt: new Date() } });

    expect((await beginRelayDeviceRetirement(null, form({ deviceId: device.id }))).ok).toBe(true);
    actor = OWNER_ACTOR;
    expect((await beginRelayDeviceRetirement(null, form({ deviceId: device.id }))).ok).toBe(true);
  });

  it("keeps one retirement identity across authorization retries and rejects partial stored state", async () => {
    const { device } = await seedDevice();
    const first = await beginRelayDeviceRetirement(null, form({ deviceId: device.id }));
    if (!("authorization" in first) || !first.authorization) throw new Error("missing authorization");
    const firstEnvelope = verifyDeviceRetirementAuthorization(
      first.authorization,
      loadServerSigningKeys().publicKey,
    );
    await prisma.relayDevice.update({
      where: { id: device.id },
      data: { retirementAuthorizationExpiresAt: new Date(Date.now() - 1) },
    });

    const second = await beginRelayDeviceRetirement(null, form({ deviceId: device.id }));
    if (!("authorization" in second) || !second.authorization) throw new Error("missing authorization");
    const secondEnvelope = verifyDeviceRetirementAuthorization(
      second.authorization,
      loadServerSigningKeys().publicKey,
    );
    expect(secondEnvelope.retirementId).toBe(firstEnvelope.retirementId);
    expect(secondEnvelope.completionHash).toBe(firstEnvelope.completionHash);
    expect(secondEnvelope.finalizationPublicKey).toBe(firstEnvelope.finalizationPublicKey);
    expect(second.authorization).not.toBe(first.authorization);

    await prisma.relayDevice.update({
      where: { id: device.id },
      data: { retirementCompletionGrant: null },
    });
    const corrupt = await beginRelayDeviceRetirement(null, form({ deviceId: device.id }));
    expect(corrupt.ok).toBe(false);
    expect(corrupt.message).toContain("incomplete");
  });

  it("fails closed when durable completion markers are only partially stored", async () => {
    const { device } = await seedDevice();
    await prisma.relayDevice.update({
      where: { id: device.id },
      data: {
        retirementCompletedAt: new Date(),
        retirementFinalizationAuthorization: "orphaned-finalization",
      },
    });
    const missingId = await beginRelayDeviceRetirement(null, form({ deviceId: device.id }));
    expect(missingId.ok).toBe(false);
    expect(missingId.message).toContain("incomplete");

    await prisma.relayDevice.update({
      where: { id: device.id },
      data: { retirementCompletedAt: null },
    });
    const missingTimestamp = await beginRelayDeviceRetirement(null, form({ deviceId: device.id }));
    expect(missingTimestamp.ok).toBe(false);
    expect(missingTimestamp.message).toContain("incomplete");
  });
});

async function beginAndOpenProof(device: Awaited<ReturnType<typeof seedDevice>>) {
  const begun = await beginRelayDeviceRetirement(null, form({ deviceId: device.device.id }));
  expect(begun.ok).toBe(true);
  if (!("authorization" in begun) || !begun.authorization) throw new Error("missing authorization");
  const authorization = verifyDeviceRetirementAuthorization(
    begun.authorization,
    loadServerSigningKeys().publicKey,
  );
  const opened = openSealedPayload(
    {
      ephemeralPublicKey: authorization.completionEphemeralPublicKey,
      sealed: authorization.completionSealed,
    },
    relayPrivateKeyToKeyObject(device.keys.privateKeyHex),
  ) as { proof: string };
  const completion = form({
    deviceId: device.device.id,
    retirementId: authorization.retirementId,
    proof: opened.proof,
  });
  return { authorization, completion, proof: opened.proof };
}

async function databaseSnapshot() {
  return {
    devices: await prisma.relayDevice.findMany({ orderBy: { id: "asc" } }),
    accounts: await prisma.account.findMany({ orderBy: { id: "asc" } }),
    audits: await prisma.auditLog.findMany({ orderBy: { id: "asc" } }),
  };
}

describe("owner cleanup of an already revoked Relay PC", () => {
  it("completes and retries the signed protocol without changing identity or nick assignments", async () => {
    const target = await seedDevice();
    const account = await prisma.account.create({
      data: {
        platform: "REDDIT",
        username: "synthetic-assigned-nick",
        emailAddress: "synthetic-nick@example.test",
        emailPasswordEnc: encryptCredential("synthetic-email-password", loadVaultKey("operator")),
        ownerId: OWNER.id,
        deviceId: target.device.id,
      },
    });
    const revokedAt = new Date("2026-01-01T00:00:00.000Z");
    await prisma.relayDevice.update({ where: { id: target.device.id }, data: { revokedAt } });
    actor = OWNER_ACTOR;

    const { authorization, completion } = await beginAndOpenProof(target);
    const retry = await beginRelayDeviceRetirement(null, form({ deviceId: target.device.id }));
    expect(retry).toMatchObject({ ok: true, state: "ready", retirementId: authorization.retirementId });
    expect((await completeRelayDeviceRetirement(null, completion)).ok).toBe(true);
    expect((await completeRelayDeviceRetirement(null, completion)).ok).toBe(true);
    const finalized = await issueRelayDeviceRetirementFinalization(null, form({ deviceId: target.device.id }));
    expect(finalized.ok).toBe(true);
    if (!("finalizationAuthorization" in finalized) || !finalized.finalizationAuthorization) {
      throw new Error("missing finalization authorization");
    }
    expect(verifyDeviceRetirementFinalization(
      finalized.finalizationAuthorization,
      publicKeyFromHex(authorization.finalizationPublicKey),
    )).toMatchObject({
      deviceId: target.device.id,
      retirementId: authorization.retirementId,
      recipientPublicKey: target.keys.publicKeyHex,
    });
    expect(await issueRelayDeviceRetirementFinalization(null, form({ deviceId: target.device.id }))).toEqual(finalized);
    expect(await beginRelayDeviceRetirement(null, form({ deviceId: target.device.id }))).toMatchObject({
      ok: true,
      state: "completed",
      finalizationAuthorization: finalized.finalizationAuthorization,
    });
    const saved = await prisma.relayDevice.findUniqueOrThrow({ where: { id: target.device.id } });
    expect(saved).toMatchObject({ revokedAt, userId: OWNER.id, publicKey: target.keys.publicKeyHex });
    expect(saved.retirementCompletedAt).toBeInstanceOf(Date);
    expect(saved.retirementFinalizationKeyEnc).toBeNull();
    expect(saved.operatorKeyGrant).toBeNull();
    expect(await prisma.account.findUniqueOrThrow({ where: { id: account.id } })).toEqual(account);
    expect(await prisma.auditLog.count({ where: { action: "RELAY_DEVICE_RETIREMENT_STARTED", actorId: OWNER.id } })).toBe(1);
    expect(await prisma.auditLog.count({ where: { action: "RELAY_DEVICE_RETIREMENT_COMPLETED", actorId: OWNER.id } })).toBe(1);
  });

  it.each(["active", "pending", "completed", "missing"] as const)(
    "denies another operator every action for a %s record without mutation or receipt disclosure",
    async (state) => {
      const target = await seedDevice();
      let completion = form({ deviceId: target.device.id, retirementId: "unknown", proof: "unknown" });
      if (state === "pending" || state === "completed") {
        completion = (await beginAndOpenProof(target)).completion;
        if (state === "completed") expect((await completeRelayDeviceRetirement(null, completion)).ok).toBe(true);
      }
      const deviceId = state === "missing" ? "missing-device" : target.device.id;
      completion.set("deviceId", deviceId);
      const before = await databaseSnapshot();
      actor = OTHER_ACTOR;
      expect(await beginRelayDeviceRetirement(null, form({ deviceId }))).toEqual({ ok: false, message: ACCESS_DENIED });
      expect(await completeRelayDeviceRetirement(null, completion)).toEqual({ ok: false, message: ACCESS_DENIED });
      expect(await issueRelayDeviceRetirementFinalization(null, form({ deviceId }))).toEqual({ ok: false, message: ACCESS_DENIED });
      expect(await databaseSnapshot()).toEqual(before);
    },
  );

  it.each(["active", "inconsistent-completed"] as const)("denies the owner every action for an %s PC", async (state) => {
    const target = await seedDevice();
    if (state === "inconsistent-completed") {
      await prisma.relayDevice.update({
        where: { id: target.device.id },
        data: { retirementCompletedAt: new Date(), retirementId: "retirement-1", retirementFinalizationAuthorization: "stored-receipt" },
      });
    }
    const before = await databaseSnapshot();
    actor = OWNER_ACTOR;
    const deviceForm = form({ deviceId: target.device.id });
    expect(await beginRelayDeviceRetirement(null, deviceForm)).toEqual({ ok: false, message: ACCESS_DENIED });
    expect(await completeRelayDeviceRetirement(null, form({ deviceId: target.device.id, retirementId: "retirement-1", proof: "proof" }))).toEqual({ ok: false, message: ACCESS_DENIED });
    expect(await issueRelayDeviceRetirementFinalization(null, deviceForm)).toEqual({ ok: false, message: ACCESS_DENIED });
    expect(await databaseSnapshot()).toEqual(before);
  });

  it("denies all signed-out actions before disclosing a completed receipt", async () => {
    const target = await seedDevice();
    const { completion } = await beginAndOpenProof(target);
    expect((await completeRelayDeviceRetirement(null, completion)).ok).toBe(true);
    const before = await databaseSnapshot();
    actor = null;
    const denied = { ok: false, message: "You are not signed in. Reload the page to sign in." };
    expect(await beginRelayDeviceRetirement(null, form({ deviceId: target.device.id }))).toEqual(denied);
    expect(await completeRelayDeviceRetirement(null, completion)).toEqual(denied);
    expect(await issueRelayDeviceRetirementFinalization(null, form({ deviceId: target.device.id }))).toEqual(denied);
    expect(await databaseSnapshot()).toEqual(before);
  });

  it("rejects wrong and cross-device completion proofs and premature finalization for the owner", async () => {
    const first = await seedDevice();
    const second = await seedDevice();
    const firstProof = await beginAndOpenProof(first);
    const secondProof = await beginAndOpenProof(second);
    actor = OWNER_ACTOR;
    const before = await databaseSnapshot();
    for (const proof of ["wrong", firstProof.proof]) {
      expect(await completeRelayDeviceRetirement(null, form({
        deviceId: second.device.id,
        retirementId: secondProof.authorization.retirementId,
        proof,
      }))).toMatchObject({ ok: false, message: expect.stringContaining("proof is invalid") });
    }
    expect(await completeRelayDeviceRetirement(null, form({
      deviceId: second.device.id,
      retirementId: firstProof.authorization.retirementId,
      proof: firstProof.proof,
    }))).toMatchObject({ ok: false, message: expect.stringContaining("proof is invalid") });
    expect(await issueRelayDeviceRetirementFinalization(null, form({ deviceId: second.device.id }))).toEqual({
      ok: false, message: "Server retirement completion is not confirmed for this PC.",
    });
    expect(await databaseSnapshot()).toEqual(before);
  });
});
