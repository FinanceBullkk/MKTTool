import { describe, expect, it } from "vitest";
import { SECRET_REVEAL_PATH, renderSecretPage } from "./secret-page";

/**
 * Trang này không có bộ test giao diện — repo cố ý không dựng hạ tầng render component. Nên
 * phần canh được ở đây là **những tính chất mà mất đi thì mất an toàn**, không phải bố cục.
 */
describe("trang hiện bí mật", () => {
  const html = renderSecretPage();

  it("xóa vé khỏi thanh địa chỉ ngay khi mở", () => {
    // Vé sống 30 giây và dùng một lần, nhưng một chuỗi bí mật nằm nguyên trên thanh địa chỉ là
    // thứ lọt vào ảnh chụp màn hình và vào buổi share màn hình.
    expect(html).toContain("history.replaceState");
  });

  it("gửi vé về đúng đường cùng nguồn của cầu nối", () => {
    expect(html).toContain(`fetch("${SECRET_REVEAL_PATH}"`);
  });

  it("không gọi ra bất cứ địa chỉ ngoài nào", () => {
    // Cầu nối không có kết nối ra ngoài (QĐ 5). Một dòng `fetch("https://…")` lọt vào đây là
    // đục thủng đúng tính chất đó, ở đúng trang có mật khẩu trên màn hình.
    expect(html).not.toMatch(/https?:\/\//);
  });

  it("không nhúng thư viện ngoài nào", () => {
    expect(html).not.toContain("<script src");
    expect(html).not.toContain("<link ");
  });

  it("nói cho người dùng biết tab sẽ tự đóng, và cho đường giữ mở", () => {
    // Tab đóng đột ngột lúc đang chép dở khó chịu hơn cả không tự đóng.
    expect(html).toContain("tự đóng sau");
    expect(html).toContain("Giữ mở");
  });

  it("không có vé thì nói rõ vì sao và phải làm gì", () => {
    expect(html).toContain("Không có vé trong địa chỉ");
  });
});
