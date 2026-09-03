/** Checklist đọc trạng thái thật từ kho; bước phân công dùng chung phép chấm với `/accounts`. */
import { afterAll, beforeEach, describe, expect, it } from "vitest";

process.env.VAULT_KEY_SERVER = "27112efee5aeaa94963b0f1f9e0dabcdf2767c34ee483d8dc2c76f61bdd1186d";
process.env.VAULT_KEY_OPERATOR = "a3d1e1576b7746dbd4481fb6fd16b16f7c7381301b8ab9ef8a3f2994c96150dc";

const { prisma } = await import("@/lib/db/prisma-client");
const { encryptCredential } = await import("@/lib/crypto/credential-encryption");
const { loadVaultKey } = await import("@/lib/crypto/encryption-key-loader");
const { loadSetupChecklist } = await import("./setup-checklist");

const HA_ID = "user-ha";
const rolloutScopeBefore = process.env.ROLLOUT_PLATFORMS;

async function stateOf(id: string) {
  const { handoff } = await loadSetupChecklist();
  const step = handoff.steps.find((entry) => entry.id === id);
  if (!step) throw new Error(`Step "${id}" was not found`);
  return step;
}

let nextProxyPort = 8080;

async function seedNick(fields: { username: string; ownerId?: string; deviceId?: string }) {
  const proxy = await prisma.proxy.create({
    data: {
      label: `proxy-${fields.username}`,
      host: "1.2.3.4",
      port: nextProxyPort++,
      username: "u",
      passwordEnc: encryptCredential("p", loadVaultKey("server")),
      country: "US",
      protocol: "http",
    },
  });

  return prisma.account.create({
    data: {
      platform: "REDDIT",
      username: fields.username,
      passwordEnc: encryptCredential("password", loadVaultKey("operator")),
      emailAddress: `${fields.username}@example.test`,
      emailPasswordEnc: encryptCredential("email-password", loadVaultKey("operator")),
      voice: "calm",
      contentAngle: "self-hosting",
      proxyId: proxy.id,
      antidetectProfileId: `profile-${fields.username}`,
      status: "ALIVE",
      ownerId: fields.ownerId,
      deviceId: fields.deviceId,
    },
  });
}

beforeEach(async () => {
  delete process.env.ROLLOUT_PLATFORMS;
  await prisma.auditLog.deleteMany();
  await prisma.postJob.deleteMany();
  await prisma.contentItem.deleteMany();
  await prisma.platformTarget.deleteMany();
  await prisma.account.deleteMany();
  await prisma.proxy.deleteMany();
  await prisma.observerProxy.deleteMany();
  await prisma.relayDevice.deleteMany();
  await prisma.user.deleteMany();
});

afterAll(async () => {
  if (rolloutScopeBefore === undefined) delete process.env.ROLLOUT_PLATFORMS;
  else process.env.ROLLOUT_PLATFORMS = rolloutScopeBefore;
  await prisma.$disconnect();
});

describe("empty vault", () => {
  it("keeps every step incomplete and makes Relay installation the next step", async () => {
    const checklist = await loadSetupChecklist();

    expect(checklist.handoff.doneCount).toBe(0);
    expect(checklist.handoff.steps.every((step) => step.state === "todo")).toBe(true);
    expect(checklist.posting.steps.every((step) => step.state === "todo")).toBe(true);
    // Cầu nối đứng đầu vì chưa có nó thì không tạo nổi một nick có bí mật.
    expect(checklist.handoff.nextStepId).toBe("relay");
    expect(checklist.posting.nextStepId).toBe("targets");
    expect(checklist.posting.inRolloutScope).toBe(false);
  });

  it("gives every step a reason and a destination", async () => {
    const checklist = await loadSetupChecklist();
    const steps = [...checklist.handoff.steps, ...checklist.posting.steps];

    for (const step of steps) {
      expect(step.why.length).toBeGreaterThan(20);
      expect(step.href.startsWith("/")).toBe(true);
      expect(step.status.length).toBeGreaterThan(0);
    }
  });
});

describe("steps complete as vault state changes", () => {
  it("moves the next step to proxies after adding a Relay PC", async () => {
    await prisma.user.create({
      data: { id: HA_ID, name: "Ha", email: "ha@mkttool.local", updatedAt: new Date() },
    });
    await prisma.relayDevice.create({
      data: { name: "Laptop Dell", userId: HA_ID, publicKey: "a".repeat(64) },
    });

    const checklist = await loadSetupChecklist();

    expect(checklist.handoff.steps.find((step) => step.id === "relay")?.state).toBe("done");
    expect(checklist.handoff.nextStepId).toBe("proxies");
  });

  it("does not count a revoked Relay PC as installed", async () => {
    await prisma.user.create({
      data: { id: HA_ID, name: "Ha", email: "ha@mkttool.local", updatedAt: new Date() },
    });
    await prisma.relayDevice.create({
      data: {
        name: "Lost laptop",
        userId: HA_ID,
        publicKey: "b".repeat(64),
        revokedAt: new Date(),
      },
    });

    expect((await stateOf("relay")).state).toBe("todo");
  });

  it("does not count an inactive observer proxy as available", async () => {
    await prisma.observerProxy.create({
      data: {
        label: "Observer1",
        host: "9.9.9.9",
        port: 8080,
        username: "u",
        passwordEnc: encryptCredential("p", loadVaultKey("server")),
        country: "US",
        active: false,
      },
    });

    expect((await stateOf("observer")).state).toBe("todo");
  });
});

describe("handoff and posting boundary", () => {
  it("completes handoff without a posting target, content item, or job", async () => {
    await prisma.user.create({
      data: { id: HA_ID, name: "Ha", email: "ha@mkttool.local", updatedAt: new Date() },
    });
    const device = await prisma.relayDevice.create({
      data: { name: "Laptop Dell", userId: HA_ID, publicKey: "f".repeat(64) },
    });
    await prisma.observerProxy.create({
      data: {
        label: "Observer1",
        host: "9.9.9.9",
        port: 8080,
        username: "u",
        passwordEnc: encryptCredential("p", loadVaultKey("server")),
        country: "US",
        active: true,
      },
    });
    await seedNick({ username: "anna", ownerId: HA_ID, deviceId: device.id });

    const checklist = await loadSetupChecklist();

    expect(checklist.handoff.nextStepId).toBeNull();
    expect(checklist.handoff.doneCount).toBe(checklist.handoff.steps.length);
    expect(checklist.posting.nextStepId).toBe("targets");
    expect(checklist.posting.doneCount).toBe(0);
  });

  it("shows the posting branch only when at least one platform is reopened", async () => {
    expect((await loadSetupChecklist()).posting.inRolloutScope).toBe(false);

    process.env.ROLLOUT_PLATFORMS = "FACEBOOK_PAGE";
    expect((await loadSetupChecklist()).posting.inRolloutScope).toBe(true);
  });
});

describe("cluster assignment step", () => {
  beforeEach(async () => {
    await prisma.user.create({
      data: { id: HA_ID, name: "Ha", email: "ha@mkttool.local", updatedAt: new Date() },
    });
  });

  it("remains incomplete when a nick has no owner or Relay PC", async () => {
    await seedNick({ username: "anna" });

    const step = await stateOf("clusters");
    expect(step.state).toBe("todo");
    expect(step.status).toContain("0/1");
  });

  it("reports partial progress instead of completion when only some nicks are assigned", async () => {
    const device = await prisma.relayDevice.create({
      data: { name: "Laptop Dell", userId: HA_ID, publicKey: "c".repeat(64) },
    });
    await seedNick({ username: "anna", ownerId: HA_ID, deviceId: device.id });
    await seedNick({ username: "bob" });

    const step = await stateOf("clusters");
    expect(step.state).toBe("partial");
    expect(step.status).toContain("1/2");
  });

  it("completes when every nick is assigned", async () => {
    const device = await prisma.relayDevice.create({
      data: { name: "Laptop Dell", userId: HA_ID, publicKey: "d".repeat(64) },
    });
    await seedNick({ username: "anna", ownerId: HA_ID, deviceId: device.id });

    expect((await stateOf("clusters")).state).toBe("done");
  });

  it("does not count a nick pinned to a revoked Relay PC as assigned", async () => {
    const device = await prisma.relayDevice.create({
      data: {
        name: "Lost laptop",
        userId: HA_ID,
        publicKey: "e".repeat(64),
        revokedAt: new Date(),
      },
    });
    await seedNick({ username: "anna", ownerId: HA_ID, deviceId: device.id });

    const step = await stateOf("clusters");
    expect(step.state).toBe("todo");
    expect(step.status).toContain("0/1");
  });

  it("does not count DEAD nicks because inactive records need no assignment", async () => {
    const anna = await seedNick({ username: "anna" });
    await prisma.account.update({ where: { id: anna.id }, data: { status: "DEAD" } });

    const step = await stateOf("clusters");
    // Không còn nick nào để phân công, nên bước lùi về trạng thái rỗng chứ không báo 0/1.
    expect(step.status).toContain("No nicks");
  });
});
