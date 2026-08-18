/**
 * Mọi đường dẫn trong luồng chuẩn bị phải trỏ tới chỗ người dùng **làm được việc**.
 *
 * ## Vì sao một phép kiểm chỉ để canh mấy cái link
 *
 * Ngày 18/08/2026 có ba chỗ chỉ operator sang `/relay-devices` để ghi máy vào sổ — một trang mà
 * `registerRelayDevice` là `adminAction`, nên operator bấm vào không làm được gì. Thẻ hướng dẫn đã
 * chuyển sang `/setup` từ trước đó. Nặng nhất là câu từ chối ở thẻ kho bí mật: nó hiện **đúng lúc**
 * người ta bị chặn, và nó chỉ sai đường ra — tệ hơn một câu không chỉ gì, vì người đọc tin nó.
 *
 * Không phép kiểm nào đỏ, vì không phép kiểm nào canh link. TypeScript thấy một chuỗi hợp lệ; bộ
 * test thấy một component render ra. Thứ duy nhất phát hiện là một người thật đi hết đường đó, và
 * người thật đầu tiên đi hết nó là bốn tháng sau khi trang được viết.
 *
 * Đọc hình dạng mã nguồn thay vì render: cái sai không nằm trong một nhánh nào để dựng lại, nó nằm
 * ở **giá trị hằng** người ta gõ vào. Cùng lối với `relay-paths-are-wired.test.ts`.
 */
import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

function doc(...segments: string[]): string {
  return readFileSync(path.join(process.cwd(), ...segments), "utf8");
}

/** Những chỗ nói với operator "đi tải cầu nối đi". */
const NOI_CHI_DUONG_TAI = [
  ["src", "lib", "setup", "setup-state-machine.ts"],
  ["src", "components", "relay", "relay-outdated-notice.tsx"],
  ["src", "components", "vault", "antidetect-profile-card.tsx"],
];

describe("đường dẫn trong luồng chuẩn bị", () => {
  it.each(NOI_CHI_DUONG_TAI)("%s/%s/%s/%s không còn chỉ sang trang tải cũ", (...segments) => {
    const source = doc(...segments);
    expect(
      source.includes("/relay-download"),
      `${segments.join("/")} vẫn trỏ tới "/relay-download". Phần tải đã về "/setup#download" — ` +
        "trang cũ chỉ còn là đường chuyển tiếp, nên link này bắt người dùng đi thêm một nhịp " +
        "chuyển hướng để tới đúng chỗ vốn có thể tới thẳng.",
    ).toBe(false);
    expect(source).toContain("/setup#download");
  });

  it("phần tải có đúng mốc neo mà mọi link kia đang trỏ tới", () => {
    // Không có `id="download"` thì mọi `#download` ở trên rơi vào đầu trang, và người tới từ dải
    // "cầu nối bản cũ" phải tự dò xuống — im lặng, không có gì hỏng để mà thấy.
    expect(doc("src", "components", "setup", "relay-download-section.tsx")).toContain('id="download"');
  });

  it("trang tải cũ vẫn tồn tại, chỉ chuyển tiếp", () => {
    // Xóa hẳn thì địa chỉ nằm trong tài liệu vận hành và trong tin nhắn cũ ăn 404, và người đọc
    // kết luận công cụ hỏng chứ không kết luận là trang đã dọn đi chỗ khác.
    const page = doc("src", "app", "relay-download", "page.tsx");
    expect(page).toContain("redirect");
    expect(page).toContain("/setup#download");
  });

  it("KHÔNG đụng vào đường tải artifact — MKT Browser ghim đúng địa chỉ đó", () => {
    // `relay-release.json` bên MKTBrowser ghim `/api/relay/download/vN`. Đổi hay bỏ đường này là
    // làm hỏng mọi lượt dựng trình cài, và hỏng ở một repo khác.
    expect(doc("src", "components", "setup", "relay-download-section.tsx")).toContain(
      "/api/relay/download/v",
    );
  });
});
