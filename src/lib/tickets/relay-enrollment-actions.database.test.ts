/**
 * Ghi danh máy đang ngồi, chạy trên Postgres thật (xem vitest.global-setup.ts).
 *
 * Bài này canh **một** tính chất, và nó là toàn bộ lý do đường này được nới xuống OPERATOR:
 *
 *   Người bấm không phải ADMIN thì chủ máy **luôn là chính họ**, bất kể form gửi lên gì.
 *
 * Không có nó thì "tự đăng ký máy của mình" thành "đăng ký một máy cho bất kỳ ai" — tức tự mở
 * thêm một chỗ nhận ciphertext cho người khác, đúng thứ mà bản đầu để `adminAction` để tránh.
 * Ẩn ô chọn trên giao diện KHÔNG phải là chặn: người gọi thẳng endpoint không thấy giao diện nào.
 */
import { afterAll, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("next/cache", () => ({ revalidatePath: () => {} }));

const ADMIN_EMAIL = "admin@mkttool.local";
const OPERATOR_EMAIL = "operator@mkttool.local";
const OTHER_EMAIL = "nguoikhac@mkttool.local";

process.env.ALLOWED_EMAILS = `${ADMIN_EMAIL},${OPERATOR_EMAIL},${OTHER_EMAIL}`;
process.env.ADMIN_EMAILS = ADMIN_EMAIL;
// `enrollThisMachine` trả về khóa công khai của máy chủ, suy ra từ hạt giống này.
process.env.TICKET_SIGNING_KEY =
  "411a055f1c441462bbf17be08157633b7f4e99db8462b44fa680ddeb6e6c654e";

const ADMIN_ID = "user-admin";
const OPERATOR_ID = "user-operator";
const OTHER_ID = "user-other";

/**
 * Phiên đăng nhập giả, **đổi được giữa các bài**.
 *
 * Thay nguồn danh tính chứ không nới `guardedAction` — lớp bọc vẫn chạy nguyên vẹn. Biến `actor`
 * để mỗi bài tự chọn mình đang là ai, vì chính sự khác nhau giữa hai vai là thứ đang được đo.
 */
let actor = { userId: OPERATOR_ID, email: OPERATOR_EMAIL, role: "OPERATOR" as "OPERATOR" | "ADMIN" };

vi.mock("@/lib/auth/require-actor", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/auth/require-actor")>()),
  requireActor: async () => actor,
  requireAdmin: async () => actor,
}));

const { prisma } = await import("@/lib/db/prisma-client");
const { generateRelayDeviceKeyPair } = await import("./relay-device-key");
const { enrollThisMachine } = await import("./relay-enrollment-actions");

function enroll(fields: { name: string; publicKey: string; userId?: string }) {
  const form = new FormData();
  form.set("name", fields.name);
  form.set("publicKey", fields.publicKey);
  if (fields.userId) form.set("userId", fields.userId);
  return enrollThisMachine(null, form);
}

beforeEach(async () => {
  actor = { userId: OPERATOR_ID, email: OPERATOR_EMAIL, role: "OPERATOR" };

  await prisma.relayDevice.deleteMany();
  await prisma.auditLog.deleteMany();
  await prisma.user.deleteMany();

  await prisma.user.createMany({
    data: [
      { id: ADMIN_ID, name: "Admin", email: ADMIN_EMAIL, updatedAt: new Date() },
      { id: OPERATOR_ID, name: "Operator", email: OPERATOR_EMAIL, updatedAt: new Date() },
      { id: OTHER_ID, name: "Other user", email: OTHER_EMAIL, updatedAt: new Date() },
    ],
  });
});

afterAll(async () => {
  await prisma.$disconnect();
});

describe("enrollThisMachine", () => {
  it("allows an OPERATOR to register their own Relay PC", async () => {
    const { publicKeyHex } = generateRelayDeviceKeyPair();
    const result = await enroll({ name: "Ha's laptop", publicKey: publicKeyHex });

    expect(result.ok).toBe(true);
    const device = await prisma.relayDevice.findUniqueOrThrow({
      where: { publicKey: publicKeyHex },
    });
    expect(device.userId).toBe(OPERATOR_ID);
  });

  it("ignores another userId submitted by an OPERATOR", async () => {
    // Đây là bài quan trọng nhất của cả file. Ẩn ô chọn trên giao diện không chặn được lượt gọi
    // thẳng endpoint — chặn phải nằm ở server action.
    const { publicKeyHex } = generateRelayDeviceKeyPair();
    const result = await enroll({
      name: "Impersonating PC",
      publicKey: publicKeyHex,
      userId: OTHER_ID,
    });

    expect(result.ok).toBe(true);
    const device = await prisma.relayDevice.findUniqueOrThrow({
      where: { publicKey: publicKeyHex },
    });
    expect(device.userId).toBe(OPERATOR_ID);
    expect(device.userId).not.toBe(OTHER_ID);
  });

  it("allows an ADMIN to select the Relay PC owner", async () => {
    actor = { userId: ADMIN_ID, email: ADMIN_EMAIL, role: "ADMIN" };
    const { publicKeyHex } = generateRelayDeviceKeyPair();

    await enroll({ name: "Other user's PC", publicKey: publicKeyHex, userId: OTHER_ID });

    const device = await prisma.relayDevice.findUniqueOrThrow({
      where: { publicKey: publicKeyHex },
    });
    expect(device.userId).toBe(OTHER_ID);
  });

  it("assigns the Relay PC to the ADMIN when no owner is selected", async () => {
    actor = { userId: ADMIN_ID, email: ADMIN_EMAIL, role: "ADMIN" };
    const { publicKeyHex } = generateRelayDeviceKeyPair();

    await enroll({ name: "Admin PC", publicKey: publicKeyHex });

    const device = await prisma.relayDevice.findUniqueOrThrow({
      where: { publicKey: publicKeyHex },
    });
    expect(device.userId).toBe(ADMIN_ID);
  });

  it("returns the Relay PC ID and server key for browser delivery", async () => {
    const { publicKeyHex } = generateRelayDeviceKeyPair();
    const result = await enroll({ name: "Laptop", publicKey: publicKeyHex });

    expect(result.ok).toBe(true);
    if (!("enrollment" in result) || !result.enrollment) throw new Error("missing enrollment");

    // Mã máy phải là mã của đúng hàng vừa ghi — cầu nối dán nó vào cấu hình, và sai mã thì mọi
    // vé báo "phát cho máy khác".
    const device = await prisma.relayDevice.findUniqueOrThrow({
      where: { publicKey: publicKeyHex },
    });
    expect(result.enrollment.deviceId).toBe(device.id);
    expect(result.enrollment.serverPublicKey).toMatch(/^[0-9a-f]{64}$/);
  });

  it("returns the existing enrollment instead of failing", async () => {
    // Cài lại máy hoặc mất file cấu hình mà còn khóa cũ là ca có thật. Bắt người ta đi thu hồi
    // rồi đăng ký lại là bắt họ xoay một khóa còn tốt.
    const { publicKeyHex } = generateRelayDeviceKeyPair();
    const first = await enroll({ name: "Laptop", publicKey: publicKeyHex });
    const second = await enroll({ name: "Laptop", publicKey: publicKeyHex });

    expect(second.ok).toBe(true);
    if (!("enrollment" in first) || !first.enrollment) throw new Error("missing enrollment");
    if (!("enrollment" in second) || !second.enrollment) throw new Error("missing enrollment");
    expect(second.enrollment.deviceId).toBe(first.enrollment.deviceId);
    expect(await prisma.relayDevice.count()).toBe(1);
  });

  it("recovers every caller when the same PC is enrolled concurrently", async () => {
    const { publicKeyHex } = generateRelayDeviceKeyPair();

    const results = await Promise.all(
      Array.from({ length: 8 }, (_, index) => enroll({ name: `Concurrent PC ${index}`, publicKey: publicKeyHex })),
    );

    expect(results.every((result) => result.ok && "enrollment" in result && result.enrollment)).toBe(true);
    const ids = results.map((result) => "enrollment" in result ? result.enrollment?.deviceId : undefined);
    expect(new Set(ids).size).toBe(1);
    expect(await prisma.relayDevice.count()).toBe(1);
  });

  it("does not return another owner's existing device configuration", async () => {
    const { publicKeyHex } = generateRelayDeviceKeyPair();
    await prisma.relayDevice.create({
      data: { name: "Other owner's PC", userId: OTHER_ID, publicKey: publicKeyHex },
    });

    const result = await enroll({ name: "Claimed PC", publicKey: publicKeyHex });

    expect(result.ok).toBe(false);
    expect(result.message).toContain("administrator");
  });

  it("rejects a revoked key and explains how to generate a new one", async () => {
    const { publicKeyHex } = generateRelayDeviceKeyPair();
    await enroll({ name: "Lost laptop", publicKey: publicKeyHex });
    await prisma.relayDevice.update({
      where: { publicKey: publicKeyHex },
      data: { revokedAt: new Date() },
    });

    const result = await enroll({ name: "Lost laptop", publicKey: publicKeyHex });

    expect(result.ok).toBe(false);
    // Câu cụt "sinh khóa mới đi" để người đọc đứng trước một máy không đăng ký được mà không
    // biết mở thư mục nào, xóa file nào.
    expect(result.message).toContain("relay-device-key.json");
  });
});
