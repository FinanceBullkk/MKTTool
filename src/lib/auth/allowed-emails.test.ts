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
  it("trims whitespace and lowercases the address", () => {
    expect(normalizeEmail("  Ban@Gmail.COM  ")).toBe("ban@gmail.com");
  });

  it("does NOT remove Gmail-style dots, so distinct addresses remain distinct", () => {
    // Nếu chuẩn hóa theo mẹo Gmail thì hai chuỗi này thành một, và danh sách trắng
    // âm thầm rộng hơn thứ người viết nhìn thấy.
    expect(normalizeEmail("a.b@gmail.com")).not.toBe(normalizeEmail("ab@gmail.com"));
  });

  it("does NOT remove plus-addressing suffixes", () => {
    expect(normalizeEmail("ban+test@gmail.com")).toBe("ban+test@gmail.com");
  });
});

describe("readEmailAccessList", () => {
  it("reads a normal access list", () => {
    const list = readEmailAccessList(env("a@x.com, b@y.com", "a@x.com"));
    expect(list.allowed).toEqual(["a@x.com", "b@y.com"]);
    expect(list.admins).toEqual(["a@x.com"]);
  });

  it("normalizes both lists", () => {
    const list = readEmailAccessList(env(" A@X.com ,B@Y.com", " A@X.com "));
    expect(list.allowed).toEqual(["a@x.com", "b@y.com"]);
    expect(list.admins).toEqual(["a@x.com"]);
  });

  it("ignores empty entries created by extra commas", () => {
    const list = readEmailAccessList(env("a@x.com,,b@y.com,", "a@x.com"));
    expect(list.allowed).toEqual(["a@x.com", "b@y.com"]);
  });

  it("THROWS when ALLOWED_EMAILS is missing instead of returning an empty list", () => {
    // Hỏng đóng: danh sách rỗng rất dễ bị một nhánh code sau này hiểu thành "cho qua hết".
    expect(() => readEmailAccessList(env("", "a@x.com"))).toThrow(/ALLOWED_EMAILS is missing/);
  });

  it("throws when ADMIN_EMAILS is missing", () => {
    expect(() => readEmailAccessList(env("a@x.com", ""))).toThrow(/ADMIN_EMAILS is missing/);
  });

  it("throws when the variables do not exist instead of passing undefined through", () => {
    expect(() => readEmailAccessList({})).toThrow(/ALLOWED_EMAILS is missing/);
  });

  it("names an administrator address that is missing from the allowlist", () => {
    expect(() => readEmailAccessList(env("a@x.com", "sep@y.com"))).toThrow(/sep@y\.com/);
  });
});

describe("readAdminContactEmail", () => {
  it("uses the first normalized administrator instead of a separate contact list", () => {
    expect(readAdminContactEmail(env("admin@x.com, b@y.com", " ADMIN@X.com , b@y.com"))).toBe(
      "admin@x.com",
    );
  });
});

describe("isEmailAllowed", () => {
  const list: EmailAccessList = { allowed: ["a@x.com", "b@y.com"], admins: ["a@x.com"] };

  it("allows an address in the list", () => {
    expect(isEmailAllowed("a@x.com", list)).toBe(true);
  });

  it("allows an address when Google returns uppercase letters or whitespace", () => {
    expect(isEmailAllowed("  B@Y.COM ", list)).toBe(true);
  });

  it("rejects an unknown address", () => {
    expect(isEmailAllowed("outsider@z.com", list)).toBe(false);
  });

  it("rejects an empty string", () => {
    expect(isEmailAllowed("", list)).toBe(false);
  });

  it("rejects an address that matches only partially", () => {
    // Chặn kiểu tấn công dựa vào so khớp lỏng: "a@x.com.kevin.net" không phải "a@x.com".
    expect(isEmailAllowed("a@x.com.outsider.net", list)).toBe(false);
    expect(isEmailAllowed("xa@x.com", list)).toBe(false);
  });
});

describe("roleForEmail", () => {
  const list: EmailAccessList = { allowed: ["a@x.com", "b@y.com"], admins: ["a@x.com"] };

  it("returns ADMIN for an address in the administrator list", () => {
    expect(roleForEmail("a@x.com", list)).toBe("ADMIN");
  });

  it("returns OPERATOR for an allowed non-administrator address", () => {
    expect(roleForEmail("b@y.com", list)).toBe("OPERATOR");
  });

  it("matches case-insensitively", () => {
    expect(roleForEmail("A@X.COM", list)).toBe("ADMIN");
  });

  it("defaults an unknown address to OPERATOR rather than ADMIN", () => {
    expect(roleForEmail("outsider@z.com", list)).toBe("OPERATOR");
  });
});
