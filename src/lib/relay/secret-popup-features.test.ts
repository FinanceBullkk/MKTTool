/**
 * Chặn `noopener` quay lại chuỗi features của cửa sổ bí mật.
 *
 * ## Kiểu hỏng này im lặng tuyệt đối
 *
 * Theo đặc tả HTML, `noopener` nằm trong tham số features làm `window.open()` **trả về `null`** —
 * đúng giá trị mà bộ chặn popup trả về. Panel không phân biệt được hai chuyện đó, nên mọi cú bấm
 * "Mật khẩu nick" đều rơi vào nhánh *"trình duyệt chặn cửa sổ bật lên"* và **không ai lấy được
 * mật khẩu nữa**, kèm một câu chỉ sai hướng hoàn toàn.
 *
 * Nó sống nguyên một giai đoạn trong nhánh này: typecheck xanh, lint xanh, 770 test xanh, và
 * phần nghiệm thu bằng mắt thì phải chờ cầu nối chạy thật nên chưa ai bấm thử. Thêm `noopener`
 * vào là phản xạ đúng ở mọi chỗ khác của web — nên nó sẽ được thêm lại, và phải có thứ đỏ lên.
 *
 * ## Vì sao là phép kiểm hình dạng mã nguồn
 *
 * Cùng lý do với `relay-import-boundary.test.ts`. Bộ test chạy trong môi trường `node`, không có
 * `window`; mà panel là component `"use client"` kéo theo cả server action lẫn React, nên import
 * nó vào đây là dựng nửa cái web app chỉ để đọc một hằng số. Đọc thẳng mã nguồn nhắm đúng vào
 * thứ cần canh, không kèm gì khác.
 */
import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

const PANEL_FILE = path.join(
  process.cwd(),
  "src",
  "app",
  "accounts",
  "[id]",
  "account-vault-actions-panel.tsx",
);

describe("cửa sổ bí mật", () => {
  const source = readFileSync(PANEL_FILE, "utf8");

  it("chuỗi features không chứa noopener — nó làm window.open trả null", () => {
    const features = source.match(/const SECRET_WINDOW_FEATURES\s*=\s*"([^"]*)"/);

    expect(features, "không tìm thấy SECRET_WINDOW_FEATURES trong panel").not.toBeNull();
    expect(
      features?.[1],
      "`noopener` trong features làm window.open() trả về null, và panel đọc null là 'popup bị " +
        "chặn' — tức mọi cú bấm mật khẩu đều hỏng. Muốn cắt opener thì dùng `disownPopup()`, " +
        "nó cắt lúc cửa sổ còn ở about:blank mà vẫn giữ được handle để điều hướng.",
    ).not.toMatch(/noopener/);
  });

  it("vẫn cắt đường opener bằng cách khác", () => {
    // Bỏ `noopener` mà không thay bằng gì là để hở `window.opener` — test trên một mình sẽ nghiệm
    // thu đúng cái sơ hở đó.
    expect(source, "thiếu disownPopup(): cửa sổ mở ra vẫn với ngược lại được trang này").toMatch(
      /disownPopup\(win\)/,
    );
  });
});
