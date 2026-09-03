import { generateKeyPairSync } from "node:crypto";
import { afterAll, beforeEach, describe, expect, it, vi } from "vitest";
import { AuthorizationError } from "@/lib/auth/require-actor";
import { MIN_RELAY_VERSION } from "@/lib/tickets/ticket-types";
import type { RelayCompatibilityRelease } from "@/lib/relay/relay-compatibility-manifest-file";

const releaseFixture = vi.hoisted(() => ({ read: vi.fn() }));
vi.mock("@/lib/relay/relay-compatibility-manifest-file", () => ({
  readRelayCompatibilityRelease: releaseFixture.read,
}));

/**
 * Khóa giả nhưng phải trông như hàng thật: chốt C33 từ chối khuôn mẫu điền tạm, và `"42".repeat(32)`
 * — giá trị bài này dùng trước đây — là một byte lặp 32 lần. Cố định chứ không `randomBytes`, để
 * một lần đỏ còn dựng lại được. Khai một chỗ vì `beforeEach` đặt lại đúng biến này; hai bản chép
 * tay là hẹn ngày chúng lệch nhau.
 */
const VAULT_KEY_SERVER_HEX =
  "80abb1295489b1829cdc7ea52219632df9d0dc9477a1684ab0594a9afbd45b42";

process.env.TICKET_SIGNING_KEY =
  "126fa4e495c62ce4d00b8778dbf10d53cb649026bd648c2c86a686c1379f2b69";
process.env.VAULT_KEY_SERVER = VAULT_KEY_SERVER_HEX;
process.env.RELAY_WEB_ORIGIN = "https://mkt.example";
process.env.COMPATIBILITY_SMOKE_OBSERVER_PROXY_LABEL = "Observer1";

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

const { encryptCredential } = await import("@/lib/crypto/credential-encryption");
const { loadVaultKey, resetVaultKeyCache } = await import("@/lib/crypto/encryption-key-loader");
const { prisma } = await import("@/lib/db/prisma-client");
const { AUDIT_ACTIONS } = await import("@/lib/audit/audit-log-actions");
const { relayPublicKeyToHex } = await import("@/lib/tickets/relay-device-key");
const { resetServerSigningKeysCache, loadServerSigningKeys } = await import(
  "@/lib/tickets/server-signing-key"
);
const { TicketReplayGuard } = await import("@/lib/tickets/ticket-replay-guard");
const { verifyTicket } = await import("@/lib/tickets/ticket-verifier");
const { reviewTicketPayload } = await import("../../../relay/src/ticket-payload-schema");
const { verifyCompatibilityUpdateAuthorization } = await import(
  "./compatibility-update-authorization"
);
const { signedManifestDigest } = await import("./compatibility-manifest-crypto");
const { issueCompatibilityUpdateTicket } = await import("./compatibility-update-actions");
const { previewCompatibilityUpdate } = await import("./compatibility-update-preview-action");

beforeEach(async () => {
  role = "ADMIN";
  process.env.TICKET_SIGNING_KEY =
  "126fa4e495c62ce4d00b8778dbf10d53cb649026bd648c2c86a686c1379f2b69";
  process.env.VAULT_KEY_SERVER = VAULT_KEY_SERVER_HEX;
  process.env.RELAY_WEB_ORIGIN = "https://mkt.example";
  process.env.COMPATIBILITY_SMOKE_OBSERVER_PROXY_LABEL = "Observer1";
  resetServerSigningKeysCache();
  resetVaultKeyCache();
  releaseFixture.read.mockResolvedValue(release());
  await prisma.auditLog.deleteMany();
  await prisma.observerProxy.deleteMany();
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
  resetVaultKeyCache();
  await prisma.auditLog.deleteMany();
  await prisma.observerProxy.deleteMany();
  await prisma.relayDevice.deleteMany();
  await prisma.user.deleteMany();
  await prisma.$disconnect();
});

describe("ADMIN compatibility update ticket", () => {
  it("previews the signed target without issuing a ticket or audit row", async () => {
    const device = await seedDevice("aa".repeat(32));

    const result = await previewCompatibilityUpdate(null, form({ deviceId: device.id }));

    expect(result).toMatchObject({
      ok: true,
      targetSequence: 1,
      targetRelayVersion: "1",
      targetBrowserVersion: "1",
    });
    expect(await prisma.auditLog.count()).toBe(0);
  });

  it("encrypts the selected ObserverProxy into a device-bound ticket and audits metadata only", async () => {
    const deviceKeys = generateKeyPairSync("x25519");
    const device = await seedDevice(relayPublicKeyToHex(deviceKeys.publicKey));
    await seedObserver();

    const result = await issueCompatibilityUpdateTicket(
      null,
      form({ deviceId: device.id, repairMissingState: "true" }),
    );

    expect(result.ok).toBe(true);
    if (!("ticket" in result) || !result.ticket) throw new Error("missing update ticket");
    expect(result.ticket).not.toContain("proxy-secret");
    expect(result.ticket).not.toContain("10.0.0.8");
    const verified = verifyTicket(result.ticket, {
      deviceId: device.id,
      // Derived, not literal -- see MIN_RELAY_VERSION. A pinned number here is a fixture that
      // expires without telling anyone.
      version: MIN_RELAY_VERSION,
      privateKey: deviceKeys.privateKey,
      serverPublicKey: loadServerSigningKeys().publicKey,
      replayGuard: new TicketReplayGuard(),
    });
    const payload = reviewTicketPayload(verified.envelope.kind, verified.payload);
    if (payload.kind !== "COMPATIBILITY_UPDATE") throw new Error("wrong payload kind");
    expect(payload.smokeProfile).toMatchObject({
      proxyLabel: "Observer1",
      proxyCountry: "US",
      proxy: { host: "10.0.0.8", password: "proxy-secret" },
    });
    expect(
      verifyCompatibilityUpdateAuthorization(payload.authorization, {
        serverPublicKeyHex: loadServerSigningKeys().publicKeyHex,
        deviceId: device.id,
        sequence: 1,
        manifestDigest: signedManifestDigest(release().manifest),
        manifestArtifactUrls: Object.values(release().manifest.manifest.artifacts).map(
          (artifact) => artifact.url,
        ),
      }),
    ).toMatchObject({ repairMissingState: true, authorizedRole: "ADMIN" });
    const audit = await prisma.auditLog.findFirstOrThrow({
      where: { action: AUDIT_ACTIONS.COMPATIBILITY_UPDATE_AUTHORIZED },
    });
    expect(audit.actorId).toBe(ADMIN.userId);
    expect(audit.detail).toContain("sequence 1");
    expect(audit.detail).not.toContain("proxy-secret");
    expect(audit.detail).not.toContain("10.0.0.8");
  });

  it("rejects operators, revoked devices, and a missing explicit ObserverProxy", async () => {
    const device = await seedDevice("ab".repeat(32));
    await seedObserver();
    role = "OPERATOR";
    expect((await issueCompatibilityUpdateTicket(null, form({ deviceId: device.id }))).ok).toBe(false);

    role = "ADMIN";
    expect(
      (
        await issueCompatibilityUpdateTicket(
          null,
          form({ deviceId: device.id, expectedTargetSequence: "2" }),
        )
      ).message,
    ).toContain("target changed");
    await prisma.relayDevice.update({ where: { id: device.id }, data: { revokedAt: new Date() } });
    expect((await issueCompatibilityUpdateTicket(null, form({ deviceId: device.id }))).ok).toBe(false);
    await prisma.relayDevice.update({ where: { id: device.id }, data: { revokedAt: null } });
    process.env.COMPATIBILITY_SMOKE_OBSERVER_PROXY_LABEL = "Missing";
    expect((await issueCompatibilityUpdateTicket(null, form({ deviceId: device.id }))).ok).toBe(false);
    expect(await prisma.auditLog.count()).toBe(0);
  });
});

async function seedDevice(publicKey: string) {
  return prisma.relayDevice.create({
    data: { name: "Operator PC", userId: OWNER.id, publicKey },
  });
}

async function seedObserver() {
  return prisma.observerProxy.create({
    data: {
      label: "Observer1",
      host: "10.0.0.8",
      port: 8080,
      username: "observer",
      passwordEnc: encryptCredential("proxy-secret", loadVaultKey("server")),
      country: "US",
      protocol: "http",
      active: true,
    },
  });
}

function release(): RelayCompatibilityRelease {
  const base = "https://mkt.example/api/relay/download/v12/artifact";
  const artifact = <TKind extends "installer" | "relay" | "browser" | "control-contract" | "engine">(
    kind: TKind,
    url: string,
  ) => ({ kind, version: "1", sha256: "a".repeat(64), sizeBytes: 1, url });
  return {
    revocations: [],
    manifest: {
      schemaVersion: 1,
      type: "mkttool.signed-windows-compatibility-manifest",
      signedAt: "2026-08-15T00:00:00.000Z",
      delegation: {
        schemaVersion: 1,
        type: "mkttool.release-delegation",
        rootKeyId: "c".repeat(64),
        signedAt: "2026-08-15T00:00:00.000Z",
        delegation: {
          schemaVersion: 1,
          type: "mkttool.release-delegation-request",
          scope: "mkttool.windows.compatibility-manifest",
          label: "test-owner",
          delegatedKeyId: "b".repeat(64),
          delegatedPublicKeyHex: "d".repeat(64),
          createdAt: "2026-08-15T00:00:00.000Z",
          notBefore: "2026-08-15T00:00:00.000Z",
          expiresAt: "2027-08-15T00:00:00.000Z",
          nonce: "test-delegation-nonce",
        },
        signature: "r".repeat(86),
      },
      signature: "s".repeat(86),
      manifest: {
        schemaVersion: 1,
        type: "mkttool.windows.compatibility-manifest",
        sequence: 1,
        channel: "pilot",
        platform: "windows-x64",
        issuedAt: "2026-08-15T00:00:00.000Z",
        expiresAt: "2026-09-15T00:00:00.000Z",
        delegatedKeyId: "b".repeat(64),
        transition: { fromSequences: [0], retainedSequence: null },
        artifacts: {
          installer: artifact("installer", `${base}/installer`),
          relay: { ...artifact("relay", `${base}/relay`), supportedBrowserContract: { min: 4, max: 4 }, secureStoreSchemaVersion: 1 },
          browser: { ...artifact("browser", `${base}/browser`), contractVersion: 4, profileSchemaVersion: 3, engineKind: "cloakbrowser" },
          controlContract: { ...artifact("control-contract", `${base}/control-contract`), contractVersion: 4 },
          engine: { ...artifact("engine", `${base}/engine`), engineKind: "cloakbrowser" },
        },
      },
    },
  };
}

function form(fields: Record<string, string>): FormData {
  const result = new FormData();
  result.set("expectedTargetSequence", "1");
  for (const [key, value] of Object.entries(fields)) result.set(key, value);
  return result;
}
