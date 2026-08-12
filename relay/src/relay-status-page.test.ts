import { describe, expect, it } from "vitest";
import { renderStatusPage } from "./relay-status-page";

const PUBLIC_KEY = "f3".repeat(32);

function page(overrides: Partial<Parameters<typeof renderStatusPage>[0]> = {}) {
  return renderStatusPage({
    publicKeyHex: PUBLIC_KEY,
    home: "C:\\MKTTool\\relay",
    problems: [],
    antidetectReady: true,
    webOrigin: "https://web.example",
    config: {
      deviceId: "device-abc",
      webOrigin: "https://web.example",
      hasMktBrowserToken: true,
      mktBrowserTokenSource: "mkt-browser-data",
    },
    ...overrides,
  });
}

describe("trang trạng thái của cầu nối", () => {
  it("hiện khóa công khai để người cài chép sang sổ đăng ký", () => {
    expect(page()).toContain(PUBLIC_KEY);
  });

  /**
   * Trang này từng nói khóa riêng nằm trong `relay-device-key.json`. Sau MKB-03 Phase 03 thì file
   * đó chỉ còn là bia mộ 93 byte, còn khóa nằm trong kho DPAPI — nên câu cũ chỉ người ta đi sao
   * lưu đúng cái file KHÔNG chứa gì. Bắt gặp ngay sau lượt di trú thật đầu tiên, 12/08/2026.
   *
   * Và phần quan trọng hơn tên thư mục: kho DPAPI gắn với **tài khoản Windows**, nên chép nó đi
   * chỗ khác không mở ra được. Người đọc phải biết đó không phải một bản sao lưu, trước khi họ
   * tin là mình đã có một bản.
   */
  it("chỉ đúng chỗ khóa riêng đang nằm, và nói rõ nó KHÔNG sao lưu được bằng cách chép file", () => {
    const html = page();

    expect(html).toContain("protected-secrets");
    expect(html).not.toContain("relay-device-key.json");
    expect(html).toMatch(/tài khoản Windows/);
    expect(html).toMatch(/không phải[\s\S]{0,40}bản sao lưu/);
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

  it('reports an unconfigured token instead of saying "cannot connect to MKT Browser"', () => {
    // Those messages lead to different actions: one means updating the config file, while the
    // other means opening MKT Browser.
    const html = page({
      antidetectReady: null,
      config: {
        deviceId: "device-abc",
        webOrigin: "https://web.example",
        hasMktBrowserToken: false,
        mktBrowserTokenSource: null,
      },
    });

    expect(html).toContain("discover its local token");
    expect(html).not.toContain("Cannot connect");
  });

  it("explains that profiles cannot be launched without an MKT Browser token", () => {
    const html = page({
      config: {
        deviceId: "d",
        webOrigin: "https://w.example",
        hasMktBrowserToken: false,
        mktBrowserTokenSource: null,
      },
    });

    expect(html).toContain("not found");
    expect(html).toContain("enable MCP");
  });

  it("does not ask an ordinary operator to copy an MCP token", () => {
    const html = page();

    expect(html).not.toContain('id="mkt-browser-token"');
    expect(html).toContain("discovered automatically from MKT Browser");
  });

  it("makes setup the primary journey and labels manual operator-key entry as recovery", () => {
    const html = page({
      problems: [{ field: "deviceId", message: "Missing device registration." }],
      config: null,
    });

    expect(html).toContain("https://web.example/setup");
    expect(html).toMatch(/recovery|legacy/i);
    expect(html).toMatch(/server[\s\S]{0,80}operator secret/i);
    expect(html).not.toContain("https://web.example/relay-devices");
  });

  it("thoát HTML trong dữ liệu — đường dẫn và mã máy là dữ liệu, không phải mã", () => {
    const html = page({
      config: {
        deviceId: '<img src=x onerror="alert(1)">',
        webOrigin: "https://w.example",
        hasMktBrowserToken: true,
        mktBrowserTokenSource: "mkt-browser-data",
      },
    });

    expect(html).not.toContain("<img src=x");
    expect(html).toContain("&lt;img");
  });
});
