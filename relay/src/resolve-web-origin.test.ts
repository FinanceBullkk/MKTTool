/**
 * Nguồn web mà cầu nối tin — đọc **độc lập** với phần cấu hình còn lại.
 *
 * Đây là mảnh gỡ thế bí của cả luồng cài: web app chỉ cấu hình hộ được nếu nó nói chuyện được
 * với cầu nối, mà nói chuyện được thì cần CORS, mà CORS cần nguồn tin. Nếu nguồn tin chỉ có khi
 * cấu hình đã ĐỦ thì chiếc máy vừa cài — nơi chưa có gì cả — không bao giờ ra khỏi vạch xuất phát.
 *
 * Nên nguồn tin lấy từ bản build, file cấu hình chỉ ghi đè.
 */
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { BUILT_IN_WEB_ORIGIN } from "../../src/lib/relay/relay-endpoints";
import { resolveWebOrigin } from "./relay-config";
import { CONFIG_FILE } from "./relay-home";

/** Giá trị nung vào bản build này, sau khi đã qua cửa kiểm. */
const BAKED = new URL(BUILT_IN_WEB_ORIGIN).origin;

const homes: string[] = [];

function makeHome(contents?: string): string {
  const dir = mkdtempSync(path.join(tmpdir(), "mkttool-origin-"));
  homes.push(dir);
  if (contents !== undefined) writeFileSync(path.join(dir, CONFIG_FILE), contents, "utf8");
  return dir;
}

afterEach(() => {
  for (const dir of homes.splice(0)) rmSync(dir, { recursive: true, force: true });
});

describe("resolveWebOrigin", () => {
  it("chưa có file cấu hình vẫn ra nguồn tin — đây là ca của máy vừa cài", () => {
    expect(resolveWebOrigin(makeHome())).toBe(BAKED);
  });

  it("file cấu hình rỗng ô webOrigin thì dùng bản build", () => {
    const home = makeHome(JSON.stringify({ deviceId: "abc", webOrigin: "" }));
    expect(resolveWebOrigin(home)).toBe(BAKED);
  });

  it("khai webOrigin thì ghi đè bản build — đường đổi domain mà không phải build lại", () => {
    const home = makeHome(JSON.stringify({ webOrigin: "https://moi.example.com" }));
    expect(resolveWebOrigin(home)).toBe("https://moi.example.com");
  });

  it("bỏ dấu / cuối, vì header Origin của trình duyệt không có nó", () => {
    const home = makeHome(JSON.stringify({ webOrigin: "https://moi.example.com/" }));
    expect(resolveWebOrigin(home)).toBe("https://moi.example.com");
  });

  it("webOrigin gõ bậy thì LÙI VỀ bản build, không làm cầu nối câm", () => {
    // Một ô gõ nhầm mà khóa luôn đường sửa nó từ xa là một chiếc máy phải đi tới tận nơi mới cứu.
    const home = makeHome(JSON.stringify({ webOrigin: "khong-phai-dia-chi" }));
    expect(resolveWebOrigin(home)).toBe(BAKED);
  });

  it("webOrigin kèm đường dẫn cũng bị bỏ qua", () => {
    // Dán cả đường dẫn vào là kiểu hỏng CORS khó đoán nhất — không câu lỗi nào chỉ về đây.
    const home = makeHome(JSON.stringify({ webOrigin: "https://moi.example.com/relay-devices" }));
    expect(resolveWebOrigin(home)).toBe(BAKED);
  });

  it("file cấu hình hỏng JSON cũng lùi về bản build", () => {
    expect(resolveWebOrigin(makeHome("{ hỏng"))).toBe(BAKED);
  });
});
