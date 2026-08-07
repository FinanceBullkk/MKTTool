/**
 * Trang Chuẩn bị đọc trạng thái **thật** từ kho, không phải một danh sách viết cứng.
 *
 * Đó là toàn bộ lý do nó tồn tại: hướng dẫn viết cứng trong tài liệu thì đúng vào ngày viết ra,
 * còn cái này thì không bao giờ nói sai về việc đã làm tới đâu. Nên thứ cần canh là **phép đọc**,
 * và riêng bước "phân công cụm" phải đếm bằng đúng `describeAccountReadiness()` mà `/accounts`
 * dùng — hai chỗ đếm khác nhau thì sớm muộn hai chỗ nói hai kiểu.
 */
import { afterAll, beforeEach, describe, expect, it } from "vitest";

process.env.VAULT_KEY_SERVER = "00112233445566778899aabbccddeeff00112233445566778899aabbccddeeff";
process.env.VAULT_KEY_OPERATOR = "ffeeddccbbaa99887766554433221100ffeeddccbbaa99887766554433221100";

const { prisma } = await import("@/lib/db/prisma-client");
const { encryptCredential } = await import("@/lib/crypto/credential-encryption");
const { loadVaultKey } = await import("@/lib/crypto/encryption-key-loader");
const { loadSetupChecklist } = await import("./setup-checklist");

const HA_ID = "user-ha";

/** Trạng thái của một bước theo id — gọn hơn là lôi cả mảng ra so. */
async function stateOf(id: string) {
  const { steps } = await loadSetupChecklist();
  const step = steps.find((entry) => entry.id === id);
  if (!step) throw new Error(`Không có bước "${id}"`);
  return step;
}

/** Cổng tăng dần: `@@unique([host, port, username])` chặn hai proxy trùng nhau. */
let nextProxyPort = 8080;

async function seedNick(fields: { username: string; ownerId?: string; deviceId?: string }) {
  const persona = await prisma.persona.findFirst();
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
      passwordEnc: encryptCredential("mat-khau", loadVaultKey("operator")),
      emailAddress: `${fields.username}@example.test`,
      emailPasswordEnc: encryptCredential("mat-khau-email", loadVaultKey("operator")),
      personaId: persona!.id,
      proxyId: proxy.id,
      antidetectProfileId: `profile-${fields.username}`,
      status: "ALIVE",
      ownerId: fields.ownerId,
      deviceId: fields.deviceId,
    },
  });
}

beforeEach(async () => {
  await prisma.auditLog.deleteMany();
  await prisma.postJob.deleteMany();
  await prisma.contentItem.deleteMany();
  await prisma.platformTarget.deleteMany();
  await prisma.account.deleteMany();
  await prisma.proxy.deleteMany();
  await prisma.observerProxy.deleteMany();
  await prisma.relayDevice.deleteMany();
  await prisma.persona.deleteMany();
  await prisma.user.deleteMany();
});

afterAll(async () => {
  await prisma.$disconnect();
});

describe("kho rỗng", () => {
  it("mọi bước đều chưa làm, và bước tiếp theo là cài cầu nối", async () => {
    const checklist = await loadSetupChecklist();

    expect(checklist.doneCount).toBe(0);
    expect(checklist.steps.every((step) => step.state === "todo")).toBe(true);
    // Cầu nối đứng đầu vì chưa có nó thì không tạo nổi một nick có bí mật.
    expect(checklist.nextStepId).toBe("relay");
  });

  it("mỗi bước đều nói được VÌ SAO và đi được tới đâu", async () => {
    const { steps } = await loadSetupChecklist();

    for (const step of steps) {
      expect(step.why.length).toBeGreaterThan(20);
      expect(step.href.startsWith("/")).toBe(true);
      expect(step.status.length).toBeGreaterThan(0);
    }
  });
});

describe("bước xong dần theo kho", () => {
  it("thêm máy rồi thì bước tiếp theo nhảy sang nhân vật", async () => {
    await prisma.user.create({
      data: { id: HA_ID, name: "Hà", email: "ha@mkttool.local", updatedAt: new Date() },
    });
    await prisma.relayDevice.create({
      data: { name: "Laptop Dell", userId: HA_ID, publicKey: "a".repeat(64) },
    });

    const checklist = await loadSetupChecklist();

    expect(checklist.steps.find((step) => step.id === "relay")?.state).toBe("done");
    expect(checklist.nextStepId).toBe("personas");
  });

  it("máy đã thu hồi KHÔNG tính là đã cài", async () => {
    await prisma.user.create({
      data: { id: HA_ID, name: "Hà", email: "ha@mkttool.local", updatedAt: new Date() },
    });
    await prisma.relayDevice.create({
      data: {
        name: "Laptop mất",
        userId: HA_ID,
        publicKey: "b".repeat(64),
        revokedAt: new Date(),
      },
    });

    expect((await stateOf("relay")).state).toBe("todo");
  });

  it("proxy quan sát viên tắt KHÔNG tính là đã có", async () => {
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

describe("bước phân công cụm", () => {
  beforeEach(async () => {
    await prisma.user.create({
      data: { id: HA_ID, name: "Hà", email: "ha@mkttool.local", updatedAt: new Date() },
    });
    await prisma.persona.create({
      data: { name: "Nhân vật thử", voice: "điềm đạm", contentAngle: "self-hosting" },
    });
  });

  it("nick chưa gán chủ và máy thì bước này chưa xong", async () => {
    await seedNick({ username: "anna" });

    const step = await stateOf("clusters");
    expect(step.state).toBe("todo");
    expect(step.status).toContain("0/1");
  });

  /** Ca hay gặp nhất khi bàn giao: gán được vài nick rồi bỏ dở. */
  it("gán một nửa thì là ĐANG DỞ, không phải xong", async () => {
    const device = await prisma.relayDevice.create({
      data: { name: "Laptop Dell", userId: HA_ID, publicKey: "c".repeat(64) },
    });
    await seedNick({ username: "anna", ownerId: HA_ID, deviceId: device.id });
    await seedNick({ username: "bob" });

    const step = await stateOf("clusters");
    expect(step.state).toBe("partial");
    expect(step.status).toContain("1/2");
  });

  it("gán đủ thì xong", async () => {
    const device = await prisma.relayDevice.create({
      data: { name: "Laptop Dell", userId: HA_ID, publicKey: "d".repeat(64) },
    });
    await seedNick({ username: "anna", ownerId: HA_ID, deviceId: device.id });

    expect((await stateOf("clusters")).state).toBe("done");
  });

  /**
   * Đếm bằng `describeAccountReadiness()` chứ không đếm `ownerId != null`: một nick ghim vào máy
   * đã thu hồi thì cả hai cột đều có giá trị, nhưng nó KHÔNG dùng được. Đếm thô là báo xong cho
   * một việc chưa xong.
   */
  it("nick ghim máy đã thu hồi không tính là đã gán", async () => {
    const device = await prisma.relayDevice.create({
      data: {
        name: "Laptop mất",
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

  it("nick DEAD không bị đếm — nghỉ rồi thì thiếu gì cũng đúng", async () => {
    const anna = await seedNick({ username: "anna" });
    await prisma.account.update({ where: { id: anna.id }, data: { status: "DEAD" } });

    const step = await stateOf("clusters");
    // Không còn nick nào để phân công, nên bước lùi về "chưa có nick" chứ không báo 0/1.
    expect(step.status).toContain("chưa có nick");
  });
});
