import { afterAll, beforeEach, describe, expect, it, vi } from "vitest";

const OPERATOR_ID = "launch-operator";
const SERVER_KEY_HEX = "27112efee5aeaa94963b0f1f9e0dabcdf2767c34ee483d8dc2c76f61bdd1186d";

process.env.VAULT_KEY_SERVER = SERVER_KEY_HEX;
process.env.TICKET_SIGNING_KEY =
  "9d61b19deffd5a60ba844af492ec2cc44449c5697b326919703bac031cae7f60";

const { prisma } = await import("@/lib/db/prisma-client");
const { encryptCredential } = await import("@/lib/crypto/credential-encryption");
const { loadVaultKey } = await import("@/lib/crypto/encryption-key-loader");
const { generateRelayDeviceKeyPair } = await import("@/lib/tickets/relay-device-key");
const { issueLockedProfileLaunchTicket } = await import("./profile-launch-ticket-issuance");

let accountId: string;
let deviceId: string;
let deviceName: string;
let devicePublicKey: string;
let replacementProxyId: string;

beforeEach(async () => {
  await prisma.auditLog.deleteMany();
  await prisma.account.deleteMany();
  await prisma.proxy.deleteMany();
  await prisma.relayDevice.deleteMany();
  await prisma.user.deleteMany();

  await prisma.user.create({
    data: {
      id: OPERATOR_ID,
      name: "Launch Operator",
      email: "launch-operator@mkttool.local",
      updatedAt: new Date(),
    },
  });
  const keypair = generateRelayDeviceKeyPair();
  const device = await prisma.relayDevice.create({
    data: {
      name: "Launch PC",
      userId: OPERATOR_ID,
      publicKey: keypair.publicKeyHex,
    },
  });
  deviceId = device.id;
  deviceName = device.name;
  devicePublicKey = device.publicKey;

  const proxyPassword = encryptCredential("proxy-password", loadVaultKey("server"));
  const [proxy, replacementProxy] = await Promise.all([
    prisma.proxy.create({
      data: {
        label: "Proxy A",
        host: "127.0.0.1",
        port: 8080,
        username: "proxy-user-a",
        passwordEnc: proxyPassword,
        country: "US",
        protocol: "http",
      },
    }),
    prisma.proxy.create({
      data: {
        label: "Proxy B",
        host: "127.0.0.2",
        port: 8081,
        username: "proxy-user-b",
        passwordEnc: proxyPassword,
        country: "US",
        protocol: "http",
      },
    }),
  ]);
  replacementProxyId = replacementProxy.id;

  const account = await prisma.account.create({
    data: {
      platform: "REDDIT",
      username: "launch-race",
      emailAddress: "launch-race@example.test",
      emailPasswordEnc: "ciphertext",
      status: "ALIVE",
      ownerId: OPERATOR_ID,
      deviceId,
      proxyId: proxy.id,
      antidetectProfileId: "profile-before-probe",
    },
  });
  accountId = account.id;
});

afterAll(async () => {
  await prisma.$disconnect();
});

describe("profile launch ticket linearization", () => {
  it.each(["proxy", "profile"] as const)(
    "rejects a %s reassignment that commits after the proxy snapshot",
    async (change) => {
      const snapshot = await prisma.account.findUniqueOrThrow({
        where: { id: accountId },
        include: { proxy: true },
      });
      if (!snapshot.proxy) throw new Error("Expected the launch proxy fixture.");

      const changed = Promise.withResolvers<void>();
      const release = Promise.withResolvers<void>();
      const changing = prisma.$transaction(async (tx) => {
        await tx.account.update({
          where: { id: accountId },
          data:
            change === "proxy"
              ? { proxyId: replacementProxyId }
              : { antidetectProfileId: "profile-after-probe" },
        });
        changed.resolve();
        await release.promise;
      });
      await changed.promise;

      const issuing = issueLockedProfileLaunchTicket({
        actor: {
          userId: OPERATOR_ID,
          email: "launch-operator@mkttool.local",
          role: "OPERATOR",
        },
        account: snapshot,
        proxy: snapshot.proxy,
        recipient: { deviceId, deviceName, publicKey: devicePublicKey },
      });
      try {
        await vi.waitFor(async () => {
          const waiting = await prisma.$queryRaw<{ waiting: boolean }[]>`
            SELECT EXISTS (
              SELECT 1 FROM pg_stat_activity
              WHERE datname = current_database() AND pid <> pg_backend_pid()
                AND wait_event_type = 'Lock'
                AND query LIKE '%FROM "Account"%FOR NO KEY UPDATE%'
            ) AS waiting`;
          expect(waiting[0].waiting).toBe(true);
        }, { timeout: 2000, interval: 20 });
      } finally {
        release.resolve();
        await changing;
      }

      await expect(issuing).resolves.toMatchObject({
        ok: false,
        status: 409,
        message: expect.stringContaining("changed"),
      });
      expect(
        await prisma.auditLog.count({
          where: { accountId, action: "PROFILE_LAUNCH_TICKET_ISSUED" },
        }),
      ).toBe(0);
    },
  );

  it("rejects a Relay PC key rotation that commits before launch-ticket signing", async () => {
    const snapshot = await prisma.account.findUniqueOrThrow({
      where: { id: accountId },
      include: { proxy: true },
    });
    if (!snapshot.proxy) throw new Error("Expected the launch proxy fixture.");

    const replacement = generateRelayDeviceKeyPair();
    const changed = Promise.withResolvers<void>();
    const release = Promise.withResolvers<void>();
    const rotation = prisma.$transaction(async (tx) => {
      await tx.relayDevice.update({
        where: { id: deviceId },
        data: { publicKey: replacement.publicKeyHex },
      });
      changed.resolve();
      await release.promise;
    });
    await changed.promise;

    const issuing = issueLockedProfileLaunchTicket({
      actor: {
        userId: OPERATOR_ID,
        email: "launch-operator@mkttool.local",
        role: "OPERATOR",
      },
      account: snapshot,
      proxy: snapshot.proxy,
      recipient: { deviceId, deviceName, publicKey: devicePublicKey },
    });
    try {
      await vi.waitFor(async () => {
        const waiting = await prisma.$queryRaw<{ waiting: boolean }[]>`
          SELECT EXISTS (
            SELECT 1 FROM pg_stat_activity
            WHERE datname = current_database() AND pid <> pg_backend_pid()
              AND wait_event_type = 'Lock'
              AND query LIKE '%FROM "RelayDevice"%FOR NO KEY UPDATE%'
          ) AS waiting`;
        expect(waiting[0].waiting).toBe(true);
      }, { timeout: 2000, interval: 20 });
    } finally {
      release.resolve();
      await rotation;
    }

    await expect(issuing).resolves.toMatchObject({
      ok: false,
      status: 409,
      message: expect.stringContaining("changed"),
    });
    expect(
      await prisma.auditLog.count({
        where: { accountId, action: "PROFILE_LAUNCH_TICKET_ISSUED" },
      }),
    ).toBe(0);
  });
});
