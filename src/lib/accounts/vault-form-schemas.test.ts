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
  it("accepts Reddit with a proxy and no separate nick password", () => {
    expect(validatePlatformAccountFields("REDDIT", REDDIT_OK, CREATING)).toBeNull();
  });

  it("rejects Reddit without a proxy and explains the consequence", () => {
    const message = validatePlatformAccountFields("REDDIT", { proxyId: "" }, CREATING);
    expect(message).toContain("home IP");
  });

  it("rejects a Reddit nick password because Reddit signs in through Google", () => {
    const message = validatePlatformAccountFields(
      "REDDIT",
      { ...REDDIT_OK, passwordEnc: "v1.aa.bb.cc" },
      CREATING,
    );
    expect(message).toContain("Google");
  });

  /** Luật của Reddit áp cho CẢ đường sửa: gửi lên một mật khẩu là sai ở mọi ngữ cảnh. */
  it("rejects a Reddit nick password during updates too", () => {
    const message = validatePlatformAccountFields(
      "REDDIT",
      { ...REDDIT_OK, passwordEnc: "v1.aa.bb.cc" },
      { creating: false },
    );
    expect(message).not.toBeNull();
  });

  it("does not treat whitespace as a value", () => {
    expect(validatePlatformAccountFields("REDDIT", { proxyId: "   " }, CREATING)).not.toBeNull();
  });

  it("rejects both null and undefined proxy IDs for Reddit", () => {
    expect(validatePlatformAccountFields("REDDIT", { proxyId: null }, CREATING)).not.toBeNull();
    expect(validatePlatformAccountFields("REDDIT", {}, CREATING)).not.toBeNull();
  });

  it("does not require a proxy for Facebook", () => {
    expect(
      validatePlatformAccountFields("FACEBOOK", { passwordEnc: "v1.aa.bb.cc" }, CREATING),
    ).toBeNull();
  });

  it("requires a Facebook nick password during creation", () => {
    expect(validatePlatformAccountFields("FACEBOOK", {}, CREATING)).not.toBeNull();
  });

  /**
   * Đường sửa: ô bí mật để trống nghĩa là *giữ nguyên*, không phải *không có*. Chấm luật "phải có"
   * ở đây là chặn mọi lượt sửa karma của nick Facebook — đúng một luật được phép lệch giữa hai
   * đường, và nó đi qua cờ `creating` chứ không qua hai bản sao.
   */
  it("accepts a blank Facebook password during updates", () => {
    expect(validatePlatformAccountFields("FACEBOOK", {}, { creating: false })).toBeNull();
  });

  /**
   * TikTok (19/08/2026) đứng giữa hai nền tảng cũ: bắt buộc proxy như Reddit, nhưng CÓ mật khẩu
   * riêng như Facebook. Ca dễ trượt nhất là để nó rơi vào nhánh cuối cùng của hàm — nhánh đó
   * viết cho Facebook và sẽ đòi mật khẩu, tức chặn mọi nick TikTok đăng nhập bằng số điện thoại.
   */
  it("accepts TikTok with a proxy even without a nick password", () => {
    expect(validatePlatformAccountFields("TIKTOK", { proxyId: "proxy-1" }, CREATING)).toBeNull();
  });

  it("rejects TikTok without a proxy and explains the consequence", () => {
    const message = validatePlatformAccountFields("TIKTOK", { proxyId: "" }, CREATING);
    expect(message).toContain("home IP");
  });

  it("allows a TikTok nick password unlike Reddit", () => {
    expect(
      validatePlatformAccountFields(
        "TIKTOK",
        { proxyId: "proxy-1", passwordEnc: "v1.aa.bb.cc" },
        CREATING,
      ),
    ).toBeNull();
  });

  it("requires a TikTok proxy during updates too", () => {
    expect(
      validatePlatformAccountFields("TIKTOK", { proxyId: "" }, { creating: false }),
    ).not.toBeNull();
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
  status: "ALIVE",
  karma: "0",
  emailPasswordEnc: CIPHERTEXT,
};
const REVISION = "2026-09-03T08:30:00.123Z";
const UPDATE_FORM = { ...BASE_FORM, id: "acc-1", revision: REVISION };

const REDDIT_FORM = { ...BASE_FORM, platform: "REDDIT", proxyId: "proxy-1" };
const FACEBOOK_FORM = { ...BASE_FORM, platform: "FACEBOOK", passwordEnc: CIPHERTEXT };
const TIKTOK_FORM = { ...BASE_FORM, platform: "TIKTOK", proxyId: "proxy-1" };

describe("accountCreateSchema applies platform-specific rules", () => {
  it("does not parse a Reddit nick without a proxy", () => {
    const result = accountCreateSchema.safeParse({ ...REDDIT_FORM, proxyId: "" });
    expect(result.success).toBe(false);
  });

  /**
   * Ca quan trọng nhất của cả bản này: trước 07/08/2026 nó KHÔNG parse được, và chính điều đó
   * làm nút "Tạo profile trên máy này" thành nút không bao giờ hiện ra — id profile chỉ có sau
   * khi nick tồn tại.
   */
  it("creates a Reddit nick without a browser profile ID", () => {
    const result = accountCreateSchema.safeParse(REDDIT_FORM);

    expect(result.success).toBe(true);
    if (result.success) expect(result.data.antidetectProfileId).toBeUndefined();
  });

  it("rejects a Reddit nick that includes a nick password", () => {
    const result = accountCreateSchema.safeParse({ ...REDDIT_FORM, passwordEnc: CIPHERTEXT });
    expect(result.success).toBe(false);
  });

  it("parses a Facebook nick without a proxy or browser profile", () => {
    const result = accountCreateSchema.safeParse(FACEBOOK_FORM);
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.proxyId).toBeUndefined();
      expect(result.data.antidetectProfileId).toBeUndefined();
    }
  });

  it("rejects a Facebook nick without a nick password", () => {
    const result = accountCreateSchema.safeParse({ ...FACEBOOK_FORM, passwordEnc: "" });
    expect(result.success).toBe(false);
  });

  /**
   * Ca này canh đúng lỗi đã xảy ra thật: giao diện mới gửi lên `platform="TIKTOK"` trong khi
   * `accountCreateSchema` mới chỉ khai `["REDDIT","FACEBOOK"]`, nên nút tạo profile im lặng
   * không tạo được gì. Enum ở schema và giá trị form gửi lên phải khớp — đây là chỗ canh.
   */
  it("parses TikTok as the third platform in the schema enum", () => {
    const result = accountCreateSchema.safeParse(TIKTOK_FORM);
    expect(result.success).toBe(true);
    if (result.success) expect(result.data.platform).toBe("TIKTOK");
  });

  it("does not parse a TikTok nick without a proxy", () => {
    const result = accountCreateSchema.safeParse({ ...TIKTOK_FORM, proxyId: "" });
    expect(result.success).toBe(false);
  });

  it("parses a TikTok nick that includes a nick password", () => {
    const result = accountCreateSchema.safeParse({ ...TIKTOK_FORM, passwordEnc: CIPHERTEXT });
    expect(result.success).toBe(true);
  });
});

describe("accountUpdateSchemaFor applies the platform read from the database", () => {
  // Form sửa không gửi `platform` lên (nền tảng cố định sau khi tạo), nên luật phải được
  // nạp từ ngoài vào. Quên nạp là đường sửa lỏng hơn đường tạo.
  it("rejects clearing the proxy from a Reddit nick", () => {
    const result = accountUpdateSchemaFor("REDDIT").safeParse({
      ...UPDATE_FORM,
      antidetectProfileId: "profile-1",
      proxyId: "",
    });
    expect(result.success).toBe(false);
  });

  it("accepts clearing both browser fields from a Facebook nick", () => {
    const result = accountUpdateSchemaFor("FACEBOOK").safeParse({
      ...UPDATE_FORM,
      antidetectProfileId: "",
      proxyId: "",
    });
    expect(result.success).toBe(true);
  });

  /** Dán id profile bằng tay vẫn là đường lùi hợp lệ — cho máy chạy cầu nối bản cũ. */
  it("still accepts a manually pasted browser profile ID for Reddit", () => {
    const result = accountUpdateSchemaFor("REDDIT").safeParse({
      ...UPDATE_FORM,
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
describe("secret fields require ciphertext", () => {
  it("rejects a plaintext password and identifies Relay as the encryptor", () => {
    const result = accountCreateSchema.safeParse({
      ...FACEBOOK_FORM,
      passwordEnc: "mat-khau-tran",
    });

    expect(result.success).toBe(false);
    expect(result.success ? "" : result.error.issues[0].message).toContain("Relay");
  });

  it("rejects a value with the correct prefix but an invalid IV length", () => {
    const result = accountCreateSchema.safeParse({
      ...FACEBOOK_FORM,
      passwordEnc: "v1.AAAA.4G1OxOuMekYYp6mys6sG8w.AIik0-U",
    });

    expect(result.success).toBe(false);
  });

  /** Mật khẩu Google cũng phải qua cầu nối — nó mới là thứ mở được nick Reddit. */
  it("rejects a plaintext Google password for a Reddit nick", () => {
    const result = accountCreateSchema.safeParse({
      ...REDDIT_FORM,
      emailPasswordEnc: "mat-khau-tran",
    });

    expect(result.success).toBe(false);
  });

  it("accepts a blank TOTP secret when 2FA is not enabled", () => {
    expect(accountCreateSchema.safeParse({ ...REDDIT_FORM, totpSecretEnc: "" }).success).toBe(true);
  });

  /** Sửa nick: cả ba ô để trống nghĩa là giữ nguyên, nên không cần cầu nối để sửa karma. */
  it("parses an update with all three secret fields blank", () => {
    const result = accountUpdateSchema.safeParse({
      ...UPDATE_FORM,
      passwordEnc: "",
      emailPasswordEnc: "",
      totpSecretEnc: "",
    });

    expect(result.success).toBe(true);
  });

  it("requires an ISO revision from the opened page when updating a nick", () => {
    const missing = accountUpdateSchema.safeParse({ ...BASE_FORM, id: "acc-1" });
    const invalid = accountUpdateSchema.safeParse({ ...UPDATE_FORM, revision: "not-a-date" });
    const valid = accountUpdateSchema.safeParse(UPDATE_FORM);

    expect(missing.success).toBe(false);
    expect(invalid.success).toBe(false);
    expect(valid.success).toBe(true);
    if (valid.success) expect(valid.data.revision).toEqual(new Date(REVISION));
  });
});
