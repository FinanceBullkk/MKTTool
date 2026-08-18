/**
 * C40: máy chủ ghi lại bản cầu nối mà mỗi chiếc máy khai, chạy trên Postgres thật.
 *
 * Con số này là **quan trắc, không phải điều khiển** — nó do máy khách khai nên không được phép
 * mở cánh cửa nào. Thứ đáng kiểm ở đây vì thế không phải "ghi có đúng số không", mà là **ba cách
 * ghi sai chỗ**, cả ba đều hỏng âm thầm: bảng trông vẫn đúng, chỉ có nội dung là bịa.
 *
 *  1. Người này ghi lên máy của người kia. Rẻ tiền nhưng bẩn: một ô "đội đã cập nhật xong" sai
 *     còn tệ hơn một ô trống, vì ô trống thì người ta đi hỏi, còn ô sai thì người ta tin.
 *  2. Máy đã thu hồi tự cập nhật `lastSeenAt`, làm một hàng đã đóng trông như còn sống. Thu hồi
 *     là một chiều, nên trạng thái của nó phải đứng yên ở mốc bị chặn.
 *  3. Số dị dạng lọt vào cột. Đường này nằm trên nút bấm của người dùng, nên nó phải từ chối mà
 *     không ném — một lượt quan trắc hỏng không được phép làm hỏng việc người ta đang làm.
 */
import { afterAll, beforeEach, describe, expect, it, vi } from "vitest";

const OWNER_ID = "user-owner";
const OTHER_ID = "user-other";
const OWNER_EMAIL = "owner@mkttool.local";
const OTHER_EMAIL = "other@mkttool.local";

process.env.ALLOWED_EMAILS = `${OWNER_EMAIL},${OTHER_EMAIL}`;

/**
 * Phiên đăng nhập giả, cùng lý lẽ với `relay-device-actions.database.test.ts`: thay **nguồn danh
 * tính**, không nới lỏng `guardedAction`. Lớp bọc vẫn chạy nguyên vẹn, và `actor.userId` vẫn là
 * thứ quyết định hàng nào được ghi — đúng cái đang bị kiểm.
 */
const ACTOR = { userId: OWNER_ID, email: OWNER_EMAIL, role: "OPERATOR" as const };

vi.mock("@/lib/auth/require-actor", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/auth/require-actor")>()),
  requireActor: async () => ACTOR,
}));

const { prisma } = await import("@/lib/db/prisma-client");
const { generateRelayDeviceKeyPair } = await import("./relay-device-key");
const { recordRelayDeviceVersion } = await import("./relay-device-version-reporting");

async function makeDevice(fields: { userId: string; revokedAt?: Date }) {
  return prisma.relayDevice.create({
    data: {
      name: "PC",
      userId: fields.userId,
      publicKey: generateRelayDeviceKeyPair().publicKeyHex,
      revokedAt: fields.revokedAt ?? null,
    },
  });
}

beforeEach(async () => {
  await prisma.relayDevice.deleteMany();
  await prisma.user.deleteMany();
  await prisma.user.createMany({
    data: [
      { id: OWNER_ID, name: "Owner", email: OWNER_EMAIL, updatedAt: new Date() },
      { id: OTHER_ID, name: "Other", email: OTHER_EMAIL, updatedAt: new Date() },
    ],
  });
});

afterAll(async () => {
  await prisma.$disconnect();
});

describe("recordRelayDeviceVersion", () => {
  it("records the version and a timestamp on the caller's own device", async () => {
    const device = await makeDevice({ userId: OWNER_ID });
    const before = Date.now();

    await expect(recordRelayDeviceVersion({ deviceId: device.id, relayVersion: 13 })).resolves
      .toEqual({ recorded: true });

    const row = await prisma.relayDevice.findUniqueOrThrow({ where: { id: device.id } });
    expect(row.relayVersion).toBe(13);
    expect(row.lastSeenAt).not.toBeNull();
    expect(row.lastSeenAt!.getTime()).toBeGreaterThanOrEqual(before - 1000);
  });

  it("refuses to write to a device owned by someone else", async () => {
    // The security property. Without the userId in the where clause this passes and the fleet
    // view fills with numbers anyone could have typed.
    const foreign = await makeDevice({ userId: OTHER_ID });

    await expect(recordRelayDeviceVersion({ deviceId: foreign.id, relayVersion: 99 })).resolves
      .toEqual({ recorded: false });

    const row = await prisma.relayDevice.findUniqueOrThrow({ where: { id: foreign.id } });
    expect(row.relayVersion).toBeNull();
    expect(row.lastSeenAt).toBeNull();
  });

  it("leaves a revoked device frozen at the moment it was blocked", async () => {
    const revoked = await makeDevice({ userId: OWNER_ID, revokedAt: new Date() });

    await expect(recordRelayDeviceVersion({ deviceId: revoked.id, relayVersion: 13 })).resolves
      .toEqual({ recorded: false });

    const row = await prisma.relayDevice.findUniqueOrThrow({ where: { id: revoked.id } });
    expect(row.lastSeenAt).toBeNull();
  });

  it("rejects malformed input without throwing, and writes nothing", async () => {
    const device = await makeDevice({ userId: OWNER_ID });

    for (const bad of [0, -1, 1.5, Number.NaN, Number.MAX_SAFE_INTEGER + 2]) {
      await expect(
        recordRelayDeviceVersion({ deviceId: device.id, relayVersion: bad }),
      ).resolves.toEqual({ recorded: false });
    }
    await expect(recordRelayDeviceVersion({ deviceId: "", relayVersion: 13 })).resolves.toEqual({
      recorded: false,
    });

    const row = await prisma.relayDevice.findUniqueOrThrow({ where: { id: device.id } });
    expect(row.relayVersion).toBeNull();
  });

  it("is idempotent and moves the timestamp forward on a repeat report", async () => {
    const device = await makeDevice({ userId: OWNER_ID });
    await recordRelayDeviceVersion({ deviceId: device.id, relayVersion: 13 });
    const first = await prisma.relayDevice.findUniqueOrThrow({ where: { id: device.id } });

    await new Promise((resolve) => setTimeout(resolve, 5));
    await recordRelayDeviceVersion({ deviceId: device.id, relayVersion: 13 });
    const second = await prisma.relayDevice.findUniqueOrThrow({ where: { id: device.id } });

    expect(second.relayVersion).toBe(13);
    // The point of storing a timestamp beside the version: a version with no time cannot tell
    // "running 12 today" from "switched off last month at 12".
    expect(second.lastSeenAt!.getTime()).toBeGreaterThanOrEqual(first.lastSeenAt!.getTime());
  });
});
