/**
 * Luật theo nền tảng: **proxy** (Reddit bắt buộc) và **mật khẩu nick** (Reddit phải trống).
 *
 * Hàm thuần nên test được không cần database. Hai chỗ dễ trượt nhất:
 *
 * 1. Nới quá tay ở proxy — mục tiêu là bỏ ràng buộc CHO FACEBOOK, không phải bỏ ràng buộc. Nới
 *    nhầm sang Reddit là nick Reddit chạy bằng IP nhà mà không có gì báo.
 * 2. Luật mật khẩu chạy **ngược** với mọi luật khác trong file: với Reddit, *có* giá trị mới là
 *    sai. Nick Reddit đăng nhập bằng Google nên không tồn tại mật khẩu riêng, và một chuỗi bịa ra
 *    cho qua ràng buộc vẫn phải được canh giữ y như bí mật thật.
 *
 * `antidetectProfileId` **đã rời khỏi luật này** (07/08/2026) — nó chỉ có được sau khi nick tồn
 * tại, nên ép lúc tạo là dựng một vòng luẩn quẩn. Nay chấm ở `describeAccountReadiness()`.
 */
import { describe, expect, it } from "vitest";
import {
  accountCreateSchema,
  accountUpdateSchema,
  accountUpdateSchemaFor,
  validatePlatformAccountFields,
} from "./vault-form-schemas";

/** Nick Reddit hợp lệ: có proxy, KHÔNG mật khẩu riêng. */
const REDDIT_OK = { proxyId: "proxy-1" };
const CREATING = { creating: true };

describe("validatePlatformAccountFields", () => {
  it("Reddit có proxy và không mật khẩu riêng thì cho qua", () => {
    expect(validatePlatformAccountFields("REDDIT", REDDIT_OK, CREATING)).toBeNull();
  });

  it("Reddit thiếu proxy thì chặn, và nói rõ hậu quả", () => {
    const message = validatePlatformAccountFields("REDDIT", { proxyId: "" }, CREATING);
    expect(message).toContain("IP nhà");
  });

  it("Reddit KHÔNG được có mật khẩu nick — nó đăng nhập bằng Google", () => {
    const message = validatePlatformAccountFields(
      "REDDIT",
      { ...REDDIT_OK, passwordEnc: "v1.aa.bb.cc" },
      CREATING,
    );
    expect(message).toContain("Google");
  });

  /** Luật của Reddit áp cho CẢ đường sửa: gửi lên một mật khẩu là sai ở mọi ngữ cảnh. */
  it("Reddit có mật khẩu thì chặn cả khi đang sửa", () => {
    const message = validatePlatformAccountFields(
      "REDDIT",
      { ...REDDIT_OK, passwordEnc: "v1.aa.bb.cc" },
      { creating: false },
    );
    expect(message).not.toBeNull();
  });

  it("khoảng trắng không tính là có giá trị", () => {
    expect(validatePlatformAccountFields("REDDIT", { proxyId: "   " }, CREATING)).not.toBeNull();
  });

  it("null và undefined đều bị chặn cho Reddit", () => {
    expect(validatePlatformAccountFields("REDDIT", { proxyId: null }, CREATING)).not.toBeNull();
    expect(validatePlatformAccountFields("REDDIT", {}, CREATING)).not.toBeNull();
  });

  it("Facebook không bị đòi proxy", () => {
    expect(
      validatePlatformAccountFields("FACEBOOK", { passwordEnc: "v1.aa.bb.cc" }, CREATING),
    ).toBeNull();
  });

  it("Facebook PHẢI có mật khẩu nick lúc tạo", () => {
    expect(validatePlatformAccountFields("FACEBOOK", {}, CREATING)).not.toBeNull();
  });

  /**
   * Đường sửa: ô bí mật để trống nghĩa là *giữ nguyên*, không phải *không có*. Chấm luật "phải có"
   * ở đây là chặn mọi lượt sửa karma của nick Facebook — đúng một luật được phép lệch giữa hai
   * đường, và nó đi qua cờ `creating` chứ không qua hai bản sao.
   */
  it("Facebook để trống mật khẩu lúc SỬA thì cho qua", () => {
    expect(validatePlatformAccountFields("FACEBOOK", {}, { creating: false })).toBeNull();
  });
});

/**
 * Một chuỗi ciphertext hợp lệ về hình dạng — đúng thứ cầu nối gửi lên từ GĐ3.
 *
 * Ghi cứng chứ không gọi `encryptCredential`: bài test này là test thuần, không có khóa và
 * không cần khóa. Phép kiểm ở schema cũng vậy — nó chỉ hỏi "có phải mật khẩu dạng trần không".
 */
const CIPHERTEXT = "v1.AQEBAQEBAQEBAQEB.4G1OxOuMekYYp6mys6sG8w.AIik0-U";

/** Ô chung của mọi nền tảng. `passwordEnc` KHÔNG nằm ở đây — nó khác nhau theo nền tảng. */
const BASE_FORM = {
  username: "nick-1",
  emailAddress: "a@example.com",
  personaId: "persona-1",
  status: "ALIVE",
  karma: "0",
  emailPasswordEnc: CIPHERTEXT,
};

const REDDIT_FORM = { ...BASE_FORM, platform: "REDDIT", proxyId: "proxy-1" };
const FACEBOOK_FORM = { ...BASE_FORM, platform: "FACEBOOK", passwordEnc: CIPHERTEXT };

describe("accountCreateSchema gắn luật theo nền tảng", () => {
  it("nick Reddit thiếu proxy thì không parse được", () => {
    const result = accountCreateSchema.safeParse({ ...REDDIT_FORM, proxyId: "" });
    expect(result.success).toBe(false);
  });

  /**
   * Ca quan trọng nhất của cả bản này: trước 07/08/2026 nó KHÔNG parse được, và chính điều đó
   * làm nút "Tạo profile trên máy này" thành nút không bao giờ hiện ra — id profile chỉ có sau
   * khi nick tồn tại.
   */
  it("nick Reddit KHÔNG có id profile vẫn tạo được", () => {
    const result = accountCreateSchema.safeParse(REDDIT_FORM);

    expect(result.success).toBe(true);
    if (result.success) expect(result.data.antidetectProfileId).toBeUndefined();
  });

  it("nick Reddit gửi kèm mật khẩu nick thì bị chặn", () => {
    const result = accountCreateSchema.safeParse({ ...REDDIT_FORM, passwordEnc: CIPHERTEXT });
    expect(result.success).toBe(false);
  });

  it("nick Facebook thiếu proxy và profile vẫn parse được", () => {
    const result = accountCreateSchema.safeParse(FACEBOOK_FORM);
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.proxyId).toBeUndefined();
      expect(result.data.antidetectProfileId).toBeUndefined();
    }
  });

  it("nick Facebook thiếu mật khẩu nick thì bị chặn", () => {
    const result = accountCreateSchema.safeParse({ ...FACEBOOK_FORM, passwordEnc: "" });
    expect(result.success).toBe(false);
  });
});

describe("accountUpdateSchemaFor chấm theo nền tảng đọc từ DB", () => {
  // Form sửa không gửi `platform` lên (nền tảng cố định sau khi tạo), nên luật phải được
  // nạp từ ngoài vào. Quên nạp là đường sửa lỏng hơn đường tạo.
  it("sửa nick Reddit mà xóa trắng proxy thì bị chặn", () => {
    const result = accountUpdateSchemaFor("REDDIT").safeParse({
      ...BASE_FORM,
      id: "acc-1",
      antidetectProfileId: "profile-1",
      proxyId: "",
    });
    expect(result.success).toBe(false);
  });

  it("sửa nick Facebook mà xóa trắng cả hai thì cho qua", () => {
    const result = accountUpdateSchemaFor("FACEBOOK").safeParse({
      ...BASE_FORM,
      id: "acc-1",
      antidetectProfileId: "",
      proxyId: "",
    });
    expect(result.success).toBe(true);
  });

  /** Dán id profile bằng tay vẫn là đường lùi hợp lệ — cho máy chạy cầu nối bản cũ. */
  it("sửa nick Reddit vẫn dán được id profile bằng tay", () => {
    const result = accountUpdateSchemaFor("REDDIT").safeParse({
      ...BASE_FORM,
      id: "acc-1",
      antidetectProfileId: "profile-go-tay",
      proxyId: "proxy-1",
    });
    expect(result.success).toBe(true);
  });
});

/**
 * Ranh giới của GĐ3 nhìn từ phía schema: máy chủ nhận ciphertext, không nhận mật khẩu.
 *
 * Kiểu hỏng phải chặn không phải người dùng gõ sai, mà là **form bị sửa hỏng một ngày nào đó**
 * rồi bí mật đi thẳng vào database chưa mã hóa — im lặng, cho tới ngày ai đó mở bản sao lưu ra
 * đọc. Chặn ở đây thì nó hỏng ồn ào ngay lần lưu đầu tiên.
 */
describe("ô bí mật phải là ciphertext", () => {
  it("từ chối mật khẩu dạng trần, kèm câu nói rõ ai phải mã hóa", () => {
    const result = accountCreateSchema.safeParse({
      ...FACEBOOK_FORM,
      passwordEnc: "mat-khau-tran",
    });

    expect(result.success).toBe(false);
    expect(result.success ? "" : result.error.issues[0].message).toContain("cầu nối");
  });

  it("từ chối chuỗi đúng tiền tố nhưng sai độ dài IV", () => {
    const result = accountCreateSchema.safeParse({
      ...FACEBOOK_FORM,
      passwordEnc: "v1.AAAA.4G1OxOuMekYYp6mys6sG8w.AIik0-U",
    });

    expect(result.success).toBe(false);
  });

  /** Mật khẩu Google cũng phải qua cầu nối — nó mới là thứ mở được nick Reddit. */
  it("từ chối mật khẩu Google dạng trần của nick Reddit", () => {
    const result = accountCreateSchema.safeParse({
      ...REDDIT_FORM,
      emailPasswordEnc: "mat-khau-tran",
    });

    expect(result.success).toBe(false);
  });

  it("TOTP secret để trống vẫn hợp lệ — nick chưa bật 2FA", () => {
    expect(accountCreateSchema.safeParse({ ...REDDIT_FORM, totpSecretEnc: "" }).success).toBe(true);
  });

  /** Sửa nick: cả ba ô để trống nghĩa là giữ nguyên, nên không cần cầu nối để sửa karma. */
  it("sửa nick: ba ô bí mật để trống thì parse được", () => {
    const result = accountUpdateSchema.safeParse({
      ...BASE_FORM,
      id: "acc-1",
      passwordEnc: "",
      emailPasswordEnc: "",
      totpSecretEnc: "",
    });

    expect(result.success).toBe(true);
  });
});
