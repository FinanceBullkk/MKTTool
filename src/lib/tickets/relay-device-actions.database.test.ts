/**
 * Sổ đăng ký máy chạy cầu nối, chạy trên Postgres thật (xem vitest.global-setup.ts).
 *
 * Bốn nhóm khẳng định, đều nhắm vào chỗ hỏng thì hỏng ÂM THẦM — sổ vẫn trông đúng, chỉ có
 * lần thu hồi là không chặn được gì:
 *  1. Một khóa chỉ nằm được ở MỘT hàng, kể cả khi dán lại bằng chữ hoa. Hỏng ở đây là thu hồi
 *     hàng này xong vẫn còn hàng kia nhận vé, mà màn hình thì báo đã thu hồi.
 *  2. Khóa đã thu hồi không đăng ký lại được. Hỏng ở đây là lần thu hồi trước thành vô nghĩa.
 *  3. Thu hồi đóng dấu ngày chứ không xóa hàng — mất hàng là mất luôn cả cái chặn đăng ký lại
 *     lẫn câu trả lời "bị chặn từ lúc nào".
 *  4. Khóa hỏng bị chặn NGAY LÚC ĐĂNG KÝ, không nằm im trong sổ tới ngày phát vé thật.
 *
 * Bài này cũng là chỗ duy nhất đối chiếu migration viết tay với model Prisma: mọi truy vấn
 * dưới đây đi qua đúng cái bảng mà `20260805060000_add_relay_device_registry` dựng lên.
 */
import { afterAll, beforeEach, describe, expect, it, vi } from "vitest";

// revalidatePath chỉ chạy được trong ngữ cảnh request của Next; ở đây ta kiểm phần database.
vi.mock("next/cache", () => ({ revalidatePath: () => {} }));

const ADMIN_EMAIL = "admin@mkttool.local";
const OPERATOR_EMAIL = "operator@mkttool.local";
const REMOVED_EMAIL = "danghiviec@mkttool.local";

// Danh sách trắng thật — `registerRelayDevice` đối chiếu nó để chặn việc đăng ký máy cho người
// đã rời team. Đặt trước khi import module để bộ nạp đọc được.
process.env.ALLOWED_EMAILS = `${ADMIN_EMAIL},${OPERATOR_EMAIL}`;
process.env.ADMIN_EMAILS = ADMIN_EMAIL;

/**
 * Phiên đăng nhập giả — cùng lý lẽ với `vault-edit-actions.database.test.ts`: thay **nguồn danh
 * tính**, không nới lỏng `adminAction`. Lớp bọc vẫn chạy nguyên vẹn như lúc chạy thật.
 *
 * Phải thay CẢ `requireAdmin`, không chỉ `requireActor`. `adminAction` gọi thẳng `requireAdmin`,
 * mà `requireAdmin` bên trong gọi `requireActor` của chính module nó — lời gọi nội bộ đó không
 * đi qua bản mock, nên chỉ thay `requireActor` là test vẫn chạy vào phép kiểm phiên thật rồi
 * chết ở `headers()`.
 *
 * Đánh đổi phải nói ra: phép kiểm "đúng vai ADMIN chưa" bị bỏ qua ở file này. Chỗ chứng minh
 * hai action này là `adminAction` chứ không phải `guardedAction` là `guarded-entry-points.test.ts`,
 * nó đọc hình dạng mã nguồn nên không mock nào che được.
 */
const TEST_ADMIN = { userId: "test-admin", email: ADMIN_EMAIL, role: "ADMIN" as const };

vi.mock("@/lib/auth/require-actor", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/auth/require-actor")>()),
  requireActor: async () => TEST_ADMIN,
  requireAdmin: async () => TEST_ADMIN,
}));

const { prisma } = await import("@/lib/db/prisma-client");
const { hashOperatorKeyGrant } = await import("@/lib/relay/enrollment/grant-digests");
const { generateRelayDeviceKeyPair } = await import("./relay-device-key");
const { grantOperatorKeyToDevice, registerRelayDevice, revokeRelayDevice } = await import(
  "./relay-device-actions"
);

/** Người dùng seed sẵn, cùng id với `userId` trong FormData. */
const OPERATOR_ID = "user-operator";
const REMOVED_ID = "user-removed";

function registrationForm(fields: { name: string; userId: string; publicKey: string }): FormData {
  const form = new FormData();
  form.set("name", fields.name);
  form.set("userId", fields.userId);
  form.set("publicKey", fields.publicKey);
  return form;
}

/** Gọi action đăng ký — `_prev` là tham số của useActionState, ở đây luôn null. */
const register = (fields: { name: string; userId: string; publicKey: string }) =>
  registerRelayDevice(null, registrationForm(fields));

beforeEach(async () => {
  await prisma.relayDevice.deleteMany();
  await prisma.auditLog.deleteMany();
  await prisma.user.deleteMany();

  await prisma.user.createMany({
    data: [
      { id: OPERATOR_ID, name: "Operator", email: OPERATOR_EMAIL, updatedAt: new Date() },
      { id: REMOVED_ID, name: "Đã nghỉ", email: REMOVED_EMAIL, updatedAt: new Date() },
    ],
  });
});

afterAll(async () => {
  await prisma.$disconnect();
});

/**
 * Đường phát khóa vùng operator, nhìn từ phía máy chủ.
 *
 * Trước 18/08/2026 chỗ này chỉ có đúng một bài, và nó kiểm một ca biên (máy đang thu hồi). Đường
 * đi thật — ADMIN bọc khóa, máy chủ giữ hộ, máy nhận tới lấy — **chưa bao giờ được chạy ở đây**,
 * kể cả khi tài liệu vận hành đã dựng nó thành lựa chọn đầu tiên cho người mới. Hai đầu phía cầu
 * nối thì có (`handle-seal-operator-key`, `handle-receive-operator-key`,
 * `operator-key-grant-substitution`); khúc giữa thì không.
 *
 * Ba nhóm dưới đây nhắm vào chỗ hỏng thì hỏng ÂM THẦM — sổ vẫn trông đúng, chỉ có chiếc máy là
 * nhận nhầm thứ nó không nên nhận:
 *  1. Hộp khóa phải được giữ **nguyên vẹn từng byte**, kèm đủ mã và vân tay để bên nhận đối
 *     chiếu. Giữ thiếu một mảnh thì máy nhận không có cách nào biết mình vừa mở đúng hộp hay không.
 *  2. Cấp lại phải **xóa sạch dấu vết lần cấp trước**. Còn sót `operatorKeyReadyAt` hay vân tay
 *     hoàn tất cũ là để một chiếc máy đọc lần giao cũ như thể nó vừa xong — hỏng không kèm lỗi.
 *  3. Hai cánh cửa đóng: máy đã thu hồi, và chủ máy đã rời `ALLOWED_EMAILS`. Cả hai đều là ca sẽ
 *     gặp thật trong lần onboard đầu tiên nếu tài khoản mới bị dựng sai thứ tự.
 */
describe("grantOperatorKeyToDevice", () => {
  /** Máy đang sống, thuộc một người còn trong danh sách trắng — điều kiện để được cấp khóa. */
  async function activeDevice(name = "Laptop của Operator") {
    const { publicKeyHex } = generateRelayDeviceKeyPair();
    return prisma.relayDevice.create({
      data: { name, userId: OPERATOR_ID, publicKey: publicKeyHex },
    });
  }

  /** Hộp khóa đã bọc, hình dạng đúng như cầu nối của ADMIN gửi lên. */
  function grantForm(deviceId: string, grant: { ephemeralPublicKey: string; sealed: string }) {
    const form = new FormData();
    form.set("deviceId", deviceId);
    form.set("ephemeralPublicKey", grant.ephemeralPublicKey);
    form.set("sealed", grant.sealed);
    return form;
  }

  const GRANT = { ephemeralPublicKey: "cd".repeat(32), sealed: "hop-khoa-da-boc" };

  it("giữ nguyên hộp khóa, kèm mã và vân tay để bên nhận đối chiếu", async () => {
    const device = await activeDevice();

    const result = await grantOperatorKeyToDevice(null, grantForm(device.id, GRANT));

    expect(result.ok).toBe(true);
    const stored = await prisma.relayDevice.findUniqueOrThrow({ where: { id: device.id } });

    // Ruột hộp máy chủ không đọc được, nên thứ duy nhất kiểm được là nó ra đúng như lúc vào.
    expect(JSON.parse(stored.operatorKeyGrant ?? "null")).toEqual(GRANT);
    expect(stored.operatorKeyGrantHash).toBe(hashOperatorKeyGrant(GRANT));
    expect(stored.operatorKeyGrantId).toEqual(expect.any(String));
    expect(stored.operatorKeyGrantedAt).toBeInstanceOf(Date);
    expect(stored.operatorKeyGrantGeneration).toBe(1);

    // Không có dòng nhật ký thì không ai trả lời được "khóa đã đi xuống máy nào, do ai, lúc nào".
    const logged = await prisma.auditLog.findMany({
      where: { action: "RELAY_OPERATOR_KEY_GRANTED" },
    });
    expect(logged).toHaveLength(1);
    expect(logged[0]?.detail).toContain(device.name);
  });

  it("cấp lại thì xóa sạch dấu vết lần giao trước", async () => {
    const device = await activeDevice();
    await grantOperatorKeyToDevice(null, grantForm(device.id, GRANT));

    // Giả lập lần giao trước đã đi tới cuối: máy nhận xong, máy chủ ghi lại vân tay hoàn tất.
    await prisma.relayDevice.update({
      where: { id: device.id },
      data: {
        operatorKeyReadyAt: new Date(),
        operatorKeyCompletionHash: "van-tay-hoan-tat-cu",
        operatorKeyCompletionGrant: "hop-cu",
        operatorKeyDeliveryAuthorization: "giay-phep-cu",
        operatorKeyDeliveryExpiresAt: new Date(Date.now() + 60_000),
      },
    });

    const lanHai = { ephemeralPublicKey: "ef".repeat(32), sealed: "hop-khoa-lan-hai" };
    const result = await grantOperatorKeyToDevice(null, grantForm(device.id, lanHai));

    expect(result.ok).toBe(true);
    const stored = await prisma.relayDevice.findUniqueOrThrow({ where: { id: device.id } });

    expect(JSON.parse(stored.operatorKeyGrant ?? "null")).toEqual(lanHai);
    expect(stored.operatorKeyGrantHash).toBe(hashOperatorKeyGrant(lanHai));
    // Thế hệ tăng — đây là thứ để bên nhận biết hộp trong tay nó đã cũ.
    expect(stored.operatorKeyGrantGeneration).toBe(2);

    // Bốn cột dưới đây còn sót lại là đủ để một chiếc máy đọc lần giao cũ như thể nó vừa xong.
    expect(stored.operatorKeyReadyAt).toBeNull();
    expect(stored.operatorKeyCompletionHash).toBeNull();
    expect(stored.operatorKeyCompletionGrant).toBeNull();
    expect(stored.operatorKeyDeliveryAuthorization).toBeNull();
    expect(stored.operatorKeyDeliveryExpiresAt).toBeNull();
  });

  it("không cấp cho máy đã thu hồi", async () => {
    const device = await activeDevice("Máy đã mất");
    await prisma.relayDevice.update({
      where: { id: device.id },
      data: { revokedAt: new Date() },
    });

    const result = await grantOperatorKeyToDevice(null, grantForm(device.id, GRANT));

    expect(result.ok).toBe(false);
    const stored = await prisma.relayDevice.findUniqueOrThrow({ where: { id: device.id } });
    expect(stored.operatorKeyGrant).toBeNull();
  });

  it("không cấp cho máy của người đã rời ALLOWED_EMAILS", async () => {
    const { publicKeyHex } = generateRelayDeviceKeyPair();
    const device = await prisma.relayDevice.create({
      data: { name: "Máy người đã nghỉ", userId: REMOVED_ID, publicKey: publicKeyHex },
    });

    const result = await grantOperatorKeyToDevice(null, grantForm(device.id, GRANT));

    expect(result.ok).toBe(false);
    expect(result.message).toContain(REMOVED_EMAIL);
    const stored = await prisma.relayDevice.findUniqueOrThrow({ where: { id: device.id } });
    expect(stored.operatorKeyGrant).toBeNull();
  });

  it("does not restore a key grant after device retirement has started", async () => {
    const { publicKeyHex } = generateRelayDeviceKeyPair();
    const device = await prisma.relayDevice.create({
      data: {
        name: "Retiring PC",
        userId: OPERATOR_ID,
        publicKey: publicKeyHex,
        retirementId: "retirement-in-progress",
      },
    });
    const form = new FormData();
    form.set("deviceId", device.id);
    form.set("ephemeralPublicKey", "ab".repeat(32));
    form.set("sealed", "synthetic-ciphertext");

    const result = await grantOperatorKeyToDevice(null, form);

    expect(result.ok).toBe(false);
    expect(
      (await prisma.relayDevice.findUniqueOrThrow({ where: { id: device.id } })).operatorKeyGrant,
    ).toBeNull();
  });
});

describe("registerRelayDevice", () => {
  it("ghi máy vào sổ, khóa lưu dạng hex chữ thường", async () => {
    const { publicKeyHex } = generateRelayDeviceKeyPair();

    const result = await register({
      name: "Laptop Dell",
      userId: OPERATOR_ID,
      publicKey: publicKeyHex.toUpperCase(),
    });

    expect(result.ok).toBe(true);

    const device = await prisma.relayDevice.findFirstOrThrow();
    expect(device.publicKey).toBe(publicKeyHex);
    expect(device.name).toBe("Laptop Dell");
    expect(device.userId).toBe(OPERATOR_ID);
    expect(device.revokedAt).toBeNull();
  });

  it("ghi AuditLog kèm người thao tác", async () => {
    const { publicKeyHex } = generateRelayDeviceKeyPair();
    await register({ name: "Laptop Dell", userId: OPERATOR_ID, publicKey: publicKeyHex });

    const log = await prisma.auditLog.findFirstOrThrow({
      where: { action: "RELAY_DEVICE_REGISTERED" },
    });
    expect(log.actorId).toBe("test-admin");
    expect(log.detail).toContain("Laptop Dell");
  });

  /**
   * Bài quan trọng nhất của file. Cùng một khóa dán lại bằng chữ HOA phải bị nhận ra là trùng.
   * Không chuẩn hóa thì Postgres coi đó là hai giá trị khác nhau, `@unique` cho qua, và trong
   * sổ có hai hàng cho cùng một chiếc máy — thu hồi hàng này, hàng kia vẫn nhận vé.
   */
  it("nhận ra khóa trùng dù dán bằng chữ hoa", async () => {
    const { publicKeyHex } = generateRelayDeviceKeyPair();
    await register({ name: "Laptop Dell", userId: OPERATOR_ID, publicKey: publicKeyHex });

    const again = await register({
      name: "Máy khác",
      userId: OPERATOR_ID,
      publicKey: publicKeyHex.toUpperCase(),
    });

    expect(again.ok).toBe(false);
    expect(again.message).toContain("đã có trong sổ");
    expect(await prisma.relayDevice.count()).toBe(1);
  });

  it("từ chối khóa đã bị thu hồi — phải sinh cặp khóa mới", async () => {
    const { publicKeyHex } = generateRelayDeviceKeyPair();
    await register({ name: "Laptop mất", userId: OPERATOR_ID, publicKey: publicKeyHex });
    const device = await prisma.relayDevice.findFirstOrThrow();
    await revokeRelayDevice(device.id);

    const again = await register({
      name: "Laptop mất (tìm lại được)",
      userId: OPERATOR_ID,
      publicKey: publicKeyHex,
    });

    expect(again.ok).toBe(false);
    expect(again.message).toContain("đã bị thu hồi");
    expect(await prisma.relayDevice.count()).toBe(1);
  });

  /** Khóa yếu phải chết ở màn hình đăng ký, không phải ở cầu nối ba tuần sau. */
  it("từ chối khóa yếu ngay lúc đăng ký", async () => {
    const result = await register({
      name: "Máy khóa hỏng",
      userId: OPERATOR_ID,
      publicKey: "00".repeat(32),
    });

    expect(result.ok).toBe(false);
    expect(result.message).toContain("khóa yếu");
    expect(await prisma.relayDevice.count()).toBe(0);
  });

  it("từ chối khóa sai độ dài", async () => {
    const result = await register({ name: "Máy", userId: OPERATOR_ID, publicKey: "abcd" });

    expect(result.ok).toBe(false);
    expect(result.message).toContain("64 ký tự hex");
  });

  /**
   * Máy đăng ký cho người đã bị gỡ khỏi ALLOWED_EMAILS sẽ không bao giờ xin được vé — mọi
   * request của họ bị chặn ở `checkActor`. Ghi vào sổ là dựng một hàng chết mà admin lại tưởng
   * đã cấp xong.
   */
  it("từ chối đăng ký cho người không còn trong ALLOWED_EMAILS", async () => {
    const { publicKeyHex } = generateRelayDeviceKeyPair();

    const result = await register({
      name: "Laptop cũ",
      userId: REMOVED_ID,
      publicKey: publicKeyHex,
    });

    expect(result.ok).toBe(false);
    expect(result.message).toContain("ALLOWED_EMAILS");
    expect(await prisma.relayDevice.count()).toBe(0);
  });

  /**
   * Khe TOCTOU giữa lượt hỏi sổ và lượt ghi: hai admin dán cùng một khóa cùng lúc thì cả hai
   * đều thấy sổ trống. `@unique` chặn người thứ hai, nhưng nếu để P2002 ném ra khỏi server
   * action thì trình duyệt chỉ thấy promise reject — nút trông như hỏng mà không có chữ nào.
   *
   * Ghi sẵn một hàng rồi gọi action thì KHÔNG chạm được nhánh đó: lượt kiểm ở đầu hàm bắt được
   * trước, và bài test sẽ xanh nhờ một đoạn mã khác đoạn cần kiểm. Phải làm lượt kiểm đầu tiên
   * trả `null` đúng một lần — đó chính là thứ người kia gây ra khi họ ghi xong sau lượt đó.
   */
  it("hai người ghi cùng lúc: người sau nhận câu giải thích, không phải lỗi trần", async () => {
    const { publicKeyHex } = generateRelayDeviceKeyPair();
    await prisma.relayDevice.create({
      data: { name: "Máy của người nhanh tay", userId: OPERATOR_ID, publicKey: publicKeyHex },
    });

    // Chỉ lần gọi ĐẦU trả null; lượt hỏi lại trong nhánh bắt lỗi dùng bản thật.
    const spy = vi.spyOn(prisma.relayDevice, "findUnique").mockResolvedValueOnce(null);

    try {
      const result = await register({
        name: "Máy của ta",
        userId: OPERATOR_ID,
        publicKey: publicKeyHex,
      });

      expect(result.ok).toBe(false);
      expect(result.message).toContain("đã có trong sổ");
      expect(await prisma.relayDevice.count()).toBe(1);

      // Hỏi sổ ĐÚNG HAI LẦN: lượt kiểm ở đầu hàm, rồi lượt hỏi lại trong nhánh bắt P2002. Một
      // lần nghĩa là câu trả lời đến từ lượt kiểm thường và nhánh cần kiểm chưa hề chạy — bài
      // test sẽ xanh trong khi thứ nó mang tên vẫn hỏng.
      expect(spy).toHaveBeenCalledTimes(2);
    } finally {
      spy.mockRestore();
    }
  });

  it("từ chối người dùng không tồn tại", async () => {
    const { publicKeyHex } = generateRelayDeviceKeyPair();

    const result = await register({
      name: "Máy ma",
      userId: "khong-co-that",
      publicKey: publicKeyHex,
    });

    expect(result.ok).toBe(false);
    expect(await prisma.relayDevice.count()).toBe(0);
  });
});

describe("revokeRelayDevice", () => {
  async function seedDevice(): Promise<string> {
    const { publicKeyHex } = generateRelayDeviceKeyPair();
    await register({ name: "Laptop Dell", userId: OPERATOR_ID, publicKey: publicKeyHex });
    const device = await prisma.relayDevice.findFirstOrThrow();
    return device.id;
  }

  it("đóng dấu ngày thu hồi, GIỮ NGUYÊN hàng", async () => {
    const id = await seedDevice();

    const result = await revokeRelayDevice(id);

    expect(result.ok).toBe(true);
    const device = await prisma.relayDevice.findUniqueOrThrow({ where: { id } });
    expect(device.revokedAt).toBeInstanceOf(Date);
  });

  it("drops pending key and bootstrap delivery after emergency revocation", async () => {
    const id = await seedDevice();
    await prisma.relayDevice.update({
      where: { id },
      data: {
        operatorKeyGrant: JSON.stringify({ ephemeralPublicKey: "ab".repeat(32), sealed: "ciphertext" }),
        operatorKeyCompletionGrant: JSON.stringify({ ephemeralPublicKey: "cd".repeat(32), sealed: "proof" }),
        operatorKeyDeliveryAuthorization: "delivery",
        operatorKeyDeliveryExpiresAt: new Date(Date.now() + 60_000),
        bootstrapAuthorization: "bootstrap",
        bootstrapAuthorizationExpiresAt: new Date(Date.now() + 60_000),
      },
    });

    await revokeRelayDevice(id);

    const device = await prisma.relayDevice.findUniqueOrThrow({ where: { id } });
    expect(device.operatorKeyGrant).toBeNull();
    expect(device.operatorKeyCompletionGrant).toBeNull();
    expect(device.operatorKeyDeliveryAuthorization).toBeNull();
    expect(device.bootstrapAuthorization).toBeNull();
  });

  /**
   * Câu thông báo phải nhắc xoay khóa vùng operator. Thu hồi không với tới được ciphertext mà
   * chiếc máy đó đã lấy về — ai bấm xong mà tưởng đã an toàn thì sẽ bỏ nốt việc quan trọng hơn.
   */
  it("nhắc xoay khóa vùng operator sau khi thu hồi", async () => {
    const result = await revokeRelayDevice(await seedDevice());

    expect(result.message).toContain("VAULT_KEY_OPERATOR");
  });

  it("ghi AuditLog", async () => {
    await revokeRelayDevice(await seedDevice());

    const log = await prisma.auditLog.findFirstOrThrow({
      where: { action: "RELAY_DEVICE_REVOKED" },
    });
    expect(log.actorId).toBe("test-admin");
  });

  it("thu hồi lần hai thì báo đã thu hồi rồi, không đổi mốc cũ", async () => {
    const id = await seedDevice();
    await revokeRelayDevice(id);
    const first = await prisma.relayDevice.findUniqueOrThrow({ where: { id } });

    const again = await revokeRelayDevice(id);

    expect(again.ok).toBe(false);
    const after = await prisma.relayDevice.findUniqueOrThrow({ where: { id } });
    expect(after.revokedAt).toEqual(first.revokedAt);
  });

  it("báo lỗi khi không tìm thấy máy", async () => {
    const result = await revokeRelayDevice("khong-co-that");

    expect(result.ok).toBe(false);
    expect(result.message).toContain("Không tìm thấy");
  });
});

/**
 * Xóa người dùng thì đăng ký máy của họ mất theo (`onDelete: Cascade`) — hỏng về hướng ĐÓNG.
 * Nếu hàng ở lại thì trong sổ còn một chiếc máy không thuộc về ai, và cột `userId` trỏ vào
 * khoảng không.
 */
describe("quan hệ với User", () => {
  it("xóa người dùng thì máy của họ rời sổ theo", async () => {
    const { publicKeyHex } = generateRelayDeviceKeyPair();
    await register({ name: "Laptop Dell", userId: OPERATOR_ID, publicKey: publicKeyHex });

    await prisma.user.delete({ where: { id: OPERATOR_ID } });

    expect(await prisma.relayDevice.count()).toBe(0);
  });
});
