import { describe, expect, it } from "vitest";
import {
  type EmailAccessEnv,
  type EmailAccessList,
  isEmailAllowed,
  normalizeEmail,
  readAdminContactEmail,
  readEmailAccessList,
  roleForEmail,
} from "./allowed-emails";

/** Cấu hình tối thiểu hợp lệ, dùng lại cho các test không quan tâm nội dung danh sách. */
function env(allowed: string, admins: string): EmailAccessEnv {
  return { ALLOWED_EMAILS: allowed, ADMIN_EMAILS: admins };
}

describe("normalizeEmail", () => {
  it("bỏ khoảng trắng và hạ chữ thường", () => {
    expect(normalizeEmail("  Ban@Gmail.COM  ")).toBe("ban@gmail.com");
  });

  it("KHÔNG bỏ dấu chấm kiểu Gmail — hai email khác nhau vẫn phải khác nhau", () => {
    // Nếu chuẩn hóa theo mẹo Gmail thì hai chuỗi này thành một, và danh sách trắng
    // âm thầm rộng hơn thứ người viết nhìn thấy.
    expect(normalizeEmail("a.b@gmail.com")).not.toBe(normalizeEmail("ab@gmail.com"));
  });

  it("KHÔNG cắt phần sau dấu cộng", () => {
    expect(normalizeEmail("ban+test@gmail.com")).toBe("ban+test@gmail.com");
  });
});

describe("readEmailAccessList", () => {
  it("đọc được danh sách bình thường", () => {
    const list = readEmailAccessList(env("a@x.com, b@y.com", "a@x.com"));
    expect(list.allowed).toEqual(["a@x.com", "b@y.com"]);
    expect(list.admins).toEqual(["a@x.com"]);
  });

  it("chuẩn hóa cả hai danh sách", () => {
    const list = readEmailAccessList(env(" A@X.com ,B@Y.com", " A@X.com "));
    expect(list.allowed).toEqual(["a@x.com", "b@y.com"]);
    expect(list.admins).toEqual(["a@x.com"]);
  });

  it("bỏ qua mục rỗng do thừa dấu phẩy", () => {
    const list = readEmailAccessList(env("a@x.com,,b@y.com,", "a@x.com"));
    expect(list.allowed).toEqual(["a@x.com", "b@y.com"]);
  });

  it("thiếu ALLOWED_EMAILS thì NÉM LỖI, không trả về danh sách rỗng", () => {
    // Hỏng đóng: danh sách rỗng rất dễ bị một nhánh code sau này hiểu thành "cho qua hết".
    expect(() => readEmailAccessList(env("", "a@x.com"))).toThrow(/Thiếu ALLOWED_EMAILS/);
  });

  it("thiếu ADMIN_EMAILS thì ném lỗi", () => {
    expect(() => readEmailAccessList(env("a@x.com", ""))).toThrow(/Thiếu ADMIN_EMAILS/);
  });

  it("biến hoàn toàn không tồn tại cũng ném lỗi, không phải undefined lọt xuống dưới", () => {
    expect(() => readEmailAccessList({})).toThrow(/Thiếu ALLOWED_EMAILS/);
  });

  it("admin không nằm trong danh sách cho phép thì ném lỗi nêu đích danh email đó", () => {
    expect(() => readEmailAccessList(env("a@x.com", "sep@y.com"))).toThrow(/sep@y\.com/);
  });
});

describe("readAdminContactEmail", () => {
  it("dùng admin đầu tiên đã chuẩn hóa, không dựng một danh sách liên hệ riêng", () => {
    expect(readAdminContactEmail(env("admin@x.com, b@y.com", " ADMIN@X.com , b@y.com"))).toBe(
      "admin@x.com",
    );
  });
});

describe("isEmailAllowed", () => {
  const list: EmailAccessList = { allowed: ["a@x.com", "b@y.com"], admins: ["a@x.com"] };

  it("cho qua email trong danh sách", () => {
    expect(isEmailAllowed("a@x.com", list)).toBe(true);
  });

  it("cho qua kể cả khi Google trả về chữ hoa hoặc kèm khoảng trắng", () => {
    expect(isEmailAllowed("  B@Y.COM ", list)).toBe(true);
  });

  it("từ chối email lạ", () => {
    expect(isEmailAllowed("nguoila@z.com", list)).toBe(false);
  });

  it("từ chối chuỗi rỗng", () => {
    expect(isEmailAllowed("", list)).toBe(false);
  });

  it("từ chối email chỉ khớp một phần", () => {
    // Chặn kiểu tấn công dựa vào so khớp lỏng: "a@x.com.kevin.net" không phải "a@x.com".
    expect(isEmailAllowed("a@x.com.nguoila.net", list)).toBe(false);
    expect(isEmailAllowed("xa@x.com", list)).toBe(false);
  });
});

describe("roleForEmail", () => {
  const list: EmailAccessList = { allowed: ["a@x.com", "b@y.com"], admins: ["a@x.com"] };

  it("email trong danh sách admin là ADMIN", () => {
    expect(roleForEmail("a@x.com", list)).toBe("ADMIN");
  });

  it("email được phép nhưng không phải admin là OPERATOR", () => {
    expect(roleForEmail("b@y.com", list)).toBe("OPERATOR");
  });

  it("so khớp không phân biệt hoa thường", () => {
    expect(roleForEmail("A@X.COM", list)).toBe("ADMIN");
  });

  it("email lạ là OPERATOR chứ không phải ADMIN — mặc định là quyền thấp nhất", () => {
    expect(roleForEmail("nguoila@z.com", list)).toBe("OPERATOR");
  });
});
