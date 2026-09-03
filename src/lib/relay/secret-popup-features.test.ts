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

describe("secret window", () => {
  const source = readFileSync(PANEL_FILE, "utf8");

  it("keeps noopener out of the features string because it makes window.open return null", () => {
    const features = source.match(/const SECRET_WINDOW_FEATURES\s*=\s*"([^"]*)"/);

    expect(features, "SECRET_WINDOW_FEATURES was not found in the panel").not.toBeNull();
    expect(
      features?.[1],
      "`noopener` in features makes window.open() return null, which the panel reads as a " +
        "blocked popup and breaks every password request. Use `disownPopup()` to sever the " +
        "opener while the window is still about:blank and retain its handle for navigation.",
    ).not.toMatch(/noopener/);
  });

  it("still severs the opener through another mechanism", () => {
    // Bỏ `noopener` mà không thay bằng gì là để hở `window.opener` — test trên một mình sẽ nghiệm
    // thu đúng cái sơ hở đó.
    expect(source, "disownPopup() is missing, so the new window can reach back into this page").toMatch(
      /disownPopup\(win\)/,
    );
  });
});
