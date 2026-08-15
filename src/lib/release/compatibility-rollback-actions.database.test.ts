import { afterAll, beforeEach, describe, expect, it, vi } from "vitest";
import { AuthorizationError } from "@/lib/auth/require-actor";

process.env.TICKET_SIGNING_KEY = "41".repeat(32);

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
const { AUDIT_ACTIONS } = await import("@/lib/audit/audit-log-actions");
const { loadServerSigningKeys, resetServerSigningKeysCache } = await import(
  "@/lib/tickets/server-signing-key"
);
const { verifyRollbackAuthorization } = await import("./rollback-authorization");
const { issueCompatibilityRollbackAuthorization } = await import(
  "./compatibility-rollback-actions"
);

beforeEach(async () => {
  role = "ADMIN";
  process.env.TICKET_SIGNING_KEY = "41".repeat(32);
  resetServerSigningKeysCache();
  await prisma.auditLog.deleteMany();
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
  resetServerSigningKeysCache();
  await prisma.auditLog.deleteMany();
  await prisma.relayDevice.deleteMany();
  await prisma.user.deleteMany();
  await prisma.$disconnect();
});

describe("ADMIN compatibility rollback authorization", () => {
  it("issues a short-lived device-bound authorization and records the permanent audit action", async () => {
    const device = await seedDevice();
    const result = await issueCompatibilityRollbackAuthorization(
      null,
      form({ deviceId: device.id, currentSequence: "2", retainedSequence: "1" }),
    );

    expect(result.ok).toBe(true);
    if (!("authorization" in result) || !result.authorization) throw new Error("missing authorization");
    expect(
      verifyRollbackAuthorization(result.authorization, {
        serverPublicKeyHex: loadServerSigningKeys().publicKeyHex,
        deviceId: device.id,
        currentSequence: 2,
        retainedSequence: 1,
        rollbackFloorSequence: 1,
        usedAuthorizationIds: [],
      }),
    ).toEqual(result.authorization);

    const audit = await prisma.auditLog.findFirstOrThrow({
      where: { action: AUDIT_ACTIONS.COMPATIBILITY_ROLLBACK_AUTHORIZED },
    });
    expect(audit.actorId).toBe(ADMIN.userId);
    expect(audit.detail).toContain("from sequence 2 to 1");
    expect(audit.detail).toContain(result.authorization.authorizationId);
  });

  it("rejects operators, revoked devices, and a forward transition without writing an audit row", async () => {
    const device = await seedDevice();
    role = "OPERATOR";
    expect(
      (await issueCompatibilityRollbackAuthorization(
        null,
        form({ deviceId: device.id, currentSequence: "2", retainedSequence: "1" }),
      )).ok,
    ).toBe(false);

    role = "ADMIN";
    await prisma.relayDevice.update({ where: { id: device.id }, data: { revokedAt: new Date() } });
    expect(
      (await issueCompatibilityRollbackAuthorization(
        null,
        form({ deviceId: device.id, currentSequence: "2", retainedSequence: "1" }),
      )).ok,
    ).toBe(false);
    expect(
      (await issueCompatibilityRollbackAuthorization(
        null,
        form({ deviceId: device.id, currentSequence: "1", retainedSequence: "2" }),
      )).ok,
    ).toBe(false);
    expect(await prisma.auditLog.count()).toBe(0);
  });
});

async function seedDevice() {
  return prisma.relayDevice.create({
    data: { name: "Operator PC", userId: OWNER.id, publicKey: "ab".repeat(32) },
  });
}

function form(fields: Record<string, string>): FormData {
  const result = new FormData();
  for (const [key, value] of Object.entries(fields)) result.set(key, value);
  return result;
}
