/**
 * Luật "proxy + profile antidetect: Reddit bắt buộc, Facebook không".
 *
 * Hàm thuần nên test được không cần database. Đây là chỗ dễ nới quá tay nhất của thay đổi này:
 * mục tiêu là bỏ ràng buộc CHO FACEBOOK, không phải bỏ ràng buộc. Nới nhầm sang Reddit là nick
 * Reddit chạy bằng IP nhà mà không có gì báo — đúng thứ cả công cụ sinh ra để tránh.
 */
import { describe, expect, it } from "vitest";
import {
  accountCreateSchema,
  accountUpdateSchemaFor,
  validatePlatformIdentityFields,
} from "./vault-form-schemas";

const FULL = { antidetectProfileId: "profile-1", proxyId: "proxy-1" };

describe("validatePlatformIdentityFields", () => {
  it("Reddit đủ cả hai thì cho qua", () => {
    expect(validatePlatformIdentityFields("REDDIT", FULL)).toBeNull();
  });

  it("Reddit thiếu profile antidetect thì chặn", () => {
    const message = validatePlatformIdentityFields("REDDIT", { ...FULL, antidetectProfileId: "" });
    expect(message).toContain("profile antidetect");
  });

  it("Reddit thiếu proxy thì chặn, và nói rõ hậu quả", () => {
    const message = validatePlatformIdentityFields("REDDIT", { ...FULL, proxyId: "" });
    expect(message).toContain("IP nhà");
  });

  it("khoảng trắng không tính là có giá trị", () => {
    expect(validatePlatformIdentityFields("REDDIT", { ...FULL, proxyId: "   " })).not.toBeNull();
  });

  it("null và undefined đều bị chặn cho Reddit", () => {
    expect(validatePlatformIdentityFields("REDDIT", { proxyId: null })).not.toBeNull();
    expect(validatePlatformIdentityFields("REDDIT", {})).not.toBeNull();
  });

  it("Facebook bỏ trống cả hai thì cho qua", () => {
    expect(validatePlatformIdentityFields("FACEBOOK", {})).toBeNull();
  });

  it("Facebook khai đủ cũng cho qua — không bắt buộc khác với không cho phép", () => {
    expect(validatePlatformIdentityFields("FACEBOOK", FULL)).toBeNull();
  });
});

const BASE_FORM = {
  username: "nick-1",
  emailAddress: "a@example.com",
  personaId: "persona-1",
  status: "ALIVE",
  karma: "0",
  password: "mat-khau",
  emailPassword: "mat-khau-email",
};

describe("accountCreateSchema gắn luật theo nền tảng", () => {
  it("nick Reddit thiếu proxy thì không parse được", () => {
    const result = accountCreateSchema.safeParse({ ...BASE_FORM, platform: "REDDIT" });
    expect(result.success).toBe(false);
  });

  it("nick Reddit đủ hai trường thì parse được", () => {
    const result = accountCreateSchema.safeParse({ ...BASE_FORM, platform: "REDDIT", ...FULL });
    expect(result.success).toBe(true);
  });

  it("nick Facebook thiếu cả hai vẫn parse được", () => {
    const result = accountCreateSchema.safeParse({ ...BASE_FORM, platform: "FACEBOOK" });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.proxyId).toBeUndefined();
      expect(result.data.antidetectProfileId).toBeUndefined();
    }
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
});
