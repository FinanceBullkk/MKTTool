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
  it("nêu đúng email bị từ chối", () => {
    const message = signInErrorMessage("EMAIL_NOT_ALLOWED:anhhao9a2.xt@gmail.com", context);

    // Email phải xuất hiện nguyên vẹn: gõ nhầm một chữ và đăng nhập nhầm tài khoản Google
    // khác là hai ca gặp nhiều nhất, và chỉ nhìn ra khi thấy đúng chuỗi máy chủ đã đọc.
    expect(message).toContain("anhhao9a2.xt@gmail.com");
    expect(message).toContain("admin@mkttool.local");
    expect(message).not.toContain("ALLOWED_EMAILS");

    // Mã thô không được lọt ra màn hình — đó chính là thứ người dùng đã nhìn thấy lần đầu.
    expect(message).not.toContain("EMAIL_NOT_ALLOWED:");
  });

  it("giữ chi tiết cấu hình ở diagnostic server, không đưa cho operator", () => {
    const message = signInErrorMessage("invalid_code", context);

    expect(message).toContain("admin@mkttool.local");
    expect(message).not.toContain("GOOGLE_CLIENT_SECRET");
    expect(message).not.toContain("auth:check");
    expect(signInErrorDiagnostic("invalid_code")).toContain("GOOGLE_CLIENT_SECRET");
  });

  it("đổi state_not_found thành hướng thử lại, không hiện host hoặc tên biến", () => {
    const message = signInErrorMessage("state_not_found", context);

    expect(message).toContain("đăng nhập lại");
    expect(message).not.toContain("BETTER_AUTH_URL");
    expect(message).not.toContain("state not found");
    expect(signInErrorDiagnostic("state_not_found")).toContain("BETTER_AUTH_URL");
  });

  it("không hiện câu kỹ thuật dài bị Better Auth nối bằng gạch dưới", () => {
    const mangled = "Khong_tao_duoc_tai_khoan_vi_mot_ly_do_nao_do_rat_dai_dong_khong_doc_noi";

    const message = signInErrorMessage(mangled, context);
    expect(message).toContain("Không thể hoàn tất");
    expect(message).not.toContain("Khong tao duoc tai khoan");
  });

  it("mã lạ chỉ nằm trong diagnostic server", () => {
    expect(signInErrorMessage("mot_ma_moi_toanh", context)).not.toContain("mot_ma_moi_toanh");
    expect(signInErrorDiagnostic("mot_ma_moi_toanh")).toContain("mot_ma_moi_toanh");
  });

  it("lấy email vừa dùng từ câu do proxy gửi nhưng không hiện cả câu kỹ thuật", () => {
    const message = signInErrorMessage("EMAIL_NOT_ALLOWED", {
      ...context,
      description: "Tài khoản operator@example.com không còn quyền dùng công cụ này.",
    });

    expect(message).toContain("operator@example.com");
    expect(message).toContain("admin@mkttool.local");
  });
});
