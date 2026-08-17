import { createHash } from "node:crypto";
import { afterAll, beforeEach, describe, expect, it, vi } from "vitest";
import { AuthorizationError } from "@/lib/auth/require-actor";

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
const { relayPrivateKeyToKeyObject } = await import("@/lib/tickets/relay-device-key");
const { openSealedPayload } = await import("@/lib/tickets/ticket-sealed-box");
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
  role = "ADMIN";
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

  it("can start local retirement after an earlier emergency revoke but remains ADMIN-only", async () => {
    const { device } = await seedDevice();
    await prisma.relayDevice.update({ where: { id: device.id }, data: { revokedAt: new Date() } });

    expect((await beginRelayDeviceRetirement(null, form({ deviceId: device.id }))).ok).toBe(true);
    role = "OPERATOR";
    expect((await beginRelayDeviceRetirement(null, form({ deviceId: device.id }))).ok).toBe(false);
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
