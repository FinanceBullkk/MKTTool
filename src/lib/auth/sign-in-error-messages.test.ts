/**
 * Thông báo cho một lần đăng nhập hỏng.
 *
 * Chuỗi dùng trong test lấy từ **luồng thật đã chạy**, không phải bịa: đăng nhập bằng một
 * email ngoài danh sách trắng ngày 05/08/2026 và đọc lại `?error=` trên thanh địa chỉ. Đó là
 * điểm mấu chốt của file này — hai lần trước đoán sai đường đi của Better Auth, và cả hai lần
 * đều chỉ lộ ra khi bấm thử chứ không lộ ra khi đọc code.
 */
import { describe, expect, it } from "vitest";
import { signInErrorMessage } from "./sign-in-error-messages";

describe("signInErrorMessage", () => {
  it("nêu đúng email bị từ chối", () => {
    const message = signInErrorMessage("EMAIL_NOT_ALLOWED:anhhao9a2.xt@gmail.com");

    // Email phải xuất hiện nguyên vẹn: gõ nhầm một chữ và đăng nhập nhầm tài khoản Google
    // khác là hai ca gặp nhiều nhất, và chỉ nhìn ra khi thấy đúng chuỗi máy chủ đã đọc.
    expect(message).toContain("anhhao9a2.xt@gmail.com");
    expect(message).toContain("ALLOWED_EMAILS");

    // Mã thô không được lọt ra màn hình — đó chính là thứ người dùng đã nhìn thấy lần đầu.
    expect(message).not.toContain("EMAIL_NOT_ALLOWED:");
  });

  it("giải thích `invalid_code` là GOOGLE_CLIENT_SECRET sai", () => {
    // Mã này là cách duy nhất secret sai lộ ra — `npm run auth:check` không kiểm được nó.
    expect(signInErrorMessage("invalid_code")).toContain("GOOGLE_CLIENT_SECRET");
  });

  it("KHÔNG bẻ gạch dưới của mã thật thành dấu cách", () => {
    // Đường lùi un-mangle chỉ áp cho chuỗi dài. Mã thật cũng có gạch dưới, và biến
    // `state_not_found` thành "state not found" là làm hỏng thứ đang đúng.
    const message = signInErrorMessage("state_not_found");

    expect(message).toContain("localhost");
    expect(message).not.toContain("state not found");
  });

  it("trả dấu cách lại cho câu dài bị Better Auth nối bằng gạch dưới", () => {
    // `callback.mjs` làm `result.error.split(" ").join("_")`, nên mọi APIError ném từ tầng
    // dưới tới đây dưới dạng một câu đã bị nối — in nguyên thì gần như không đọc nổi.
    const mangled = "Khong_tao_duoc_tai_khoan_vi_mot_ly_do_nao_do_rat_dai_dong_khong_doc_noi";

    expect(signInErrorMessage(mangled)).toContain("Khong tao duoc tai khoan");
  });

  it("mã lạ thì in nguyên ra, không nuốt thành 'có lỗi xảy ra'", () => {
    // Bản nâng cấp Better Auth có thể thêm mã mới, và lúc đó chuỗi gốc là manh mối duy nhất.
    expect(signInErrorMessage("mot_ma_moi_toanh")).toContain("mot_ma_moi_toanh");
  });

  it("ưu tiên câu do máy chủ gửi kèm", () => {
    expect(signInErrorMessage("EMAIL_NOT_ALLOWED", "Câu cụ thể từ proxy.ts")).toBe(
      "Câu cụ thể từ proxy.ts",
    );
  });
});
