import { describe, expect, it } from "vitest";
import { renderStatusPage } from "./relay-status-page";

const PUBLIC_KEY = "f3".repeat(32);

function page(overrides: Partial<Parameters<typeof renderStatusPage>[0]> = {}) {
  return renderStatusPage({
    publicKeyHex: PUBLIC_KEY,
    home: "C:\\MKTTool\\relay",
    problems: [],
    antidetectReady: true,
    config: { deviceId: "device-abc", webOrigin: "https://web.example", hasMultizenToken: true },
    ...overrides,
  });
}

describe("trang trạng thái của cầu nối", () => {
  it("hiện khóa công khai để người cài chép sang sổ đăng ký", () => {
    expect(page()).toContain(PUBLIC_KEY);
  });

  it("hiện mã máy và nguồn web — hai giá trị sai thì hỏng theo kiểu khó đoán nhất", () => {
    const html = page();

    expect(html).toContain("device-abc");
    expect(html).toContain("https://web.example");
  });

  it("liệt kê từng mục còn thiếu kèm mẫu file cấu hình", () => {
    const html = page({
      problems: [{ field: "deviceId", message: "Thiếu deviceId — mã chiếc máy này." }],
      config: null,
    });

    expect(html).toContain("Thiếu deviceId");
    expect(html).toContain("CHƯA ĐỦ");
    // Mẫu phải nằm ngay trên trang: người sửa lỗi lúc 11 giờ đêm không đọc tài liệu bàn giao.
    expect(html).toContain("serverPublicKey");
  });

  it('chưa điền token thì nói đúng thế, KHÔNG nói "không nối được MultiZen"', () => {
    // Hai câu đó dẫn người đọc đi hai hướng khác hẳn nhau: một bên là điền vào file cấu hình,
    // bên kia là đi mở ứng dụng MultiZen lên.
    const html = page({ antidetectReady: null });

    expect(html).toContain("chưa điền");
    expect(html).not.toContain("KHÔNG nối được");
  });

  it("nói rõ khi chưa điền token MultiZen", () => {
    const html = page({
      config: { deviceId: "d", webOrigin: "https://w.example", hasMultizenToken: false },
    });

    expect(html).toContain("chưa mở được profile");
  });

  it("thoát HTML trong dữ liệu — đường dẫn và mã máy là dữ liệu, không phải mã", () => {
    const html = page({
      config: {
        deviceId: '<img src=x onerror="alert(1)">',
        webOrigin: "https://w.example",
        hasMultizenToken: true,
      },
    });

    expect(html).not.toContain("<img src=x");
    expect(html).toContain("&lt;img");
  });
});
