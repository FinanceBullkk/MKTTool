/**
 * Thông báo cho một lần đăng nhập hỏng.
 *
 * Chuỗi dùng trong test lấy từ **luồng thật đã chạy**, không phải bịa: đăng nhập bằng một
 * email ngoài danh sách trắng ngày 05/08/2026 và đọc lại `?error=` trên thanh địa chỉ. Đó là
 * điểm mấu chốt của file này — hai lần trước đoán sai đường đi của Better Auth, và cả hai lần
 * đều chỉ lộ ra khi bấm thử chứ không lộ ra khi đọc code.
 */
import { describe, expect, it } from "vitest";
import { signInErrorDiagnostic, signInErrorMessage } from "./sign-in-error-messages";

const context = { adminContactEmail: "admin@mkttool.local" };

describe("signInErrorMessage", () => {
  it("names the rejected email address", () => {
    const message = signInErrorMessage("EMAIL_NOT_ALLOWED:anhhao9a2.xt@gmail.com", context);

    // Email phải xuất hiện nguyên vẹn: gõ nhầm một chữ và đăng nhập nhầm tài khoản Google
    // khác là hai ca gặp nhiều nhất, và chỉ nhìn ra khi thấy đúng chuỗi máy chủ đã đọc.
    expect(message).toContain("anhhao9a2.xt@gmail.com");
    expect(message).toContain("admin@mkttool.local");
    expect(message).not.toContain("ALLOWED_EMAILS");

    // Mã thô không được lọt ra màn hình — đó chính là thứ người dùng đã nhìn thấy lần đầu.
    expect(message).not.toContain("EMAIL_NOT_ALLOWED:");
  });

  it("keeps configuration details in server diagnostics and away from operators", () => {
    const message = signInErrorMessage("invalid_code", context);

    expect(message).toContain("admin@mkttool.local");
    expect(message).not.toContain("GOOGLE_CLIENT_SECRET");
    expect(message).not.toContain("auth:check");
    expect(signInErrorDiagnostic("invalid_code")).toContain("GOOGLE_CLIENT_SECRET");
  });

  it("turns state_not_found into retry guidance without exposing hosts or variables", () => {
    const message = signInErrorMessage("state_not_found", context);

    expect(message).toContain("sign in again");
    expect(message).not.toContain("BETTER_AUTH_URL");
    expect(message).not.toContain("state not found");
    expect(signInErrorDiagnostic("state_not_found")).toContain("BETTER_AUTH_URL");
  });

  it("does not display a long technical message mangled by Better Auth", () => {
    const mangled = "Could_not_create_an_account_because_of_a_long_unreadable_technical_failure";

    const message = signInErrorMessage(mangled, context);
    expect(message).toContain("could not be completed");
    expect(message).not.toContain("Could not create an account");
  });

  it("keeps unknown codes in server diagnostics only", () => {
    expect(signInErrorMessage("brand_new_code", context)).not.toContain("brand_new_code");
    expect(signInErrorDiagnostic("brand_new_code")).toContain("brand_new_code");
  });

  it("extracts the attempted email from proxy text without displaying the full technical message", () => {
    const message = signInErrorMessage("EMAIL_NOT_ALLOWED", {
      ...context,
      description: "Account operator@example.com is no longer allowed to use this tool.",
    });

    expect(message).toContain("operator@example.com");
    expect(message).toContain("admin@mkttool.local");
  });
});
