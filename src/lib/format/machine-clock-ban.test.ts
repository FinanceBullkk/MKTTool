/**
 * Chặn tái phạm: không chỗ nào trong `src/` được đọc hay ghi thời gian theo GIỜ MÁY nữa.
 *
 * Vì sao cần một test quét mã nguồn thay vì chỉ tin vào code review: kiểu hỏng này KHÔNG
 * làm test nào đỏ. `new Date().getHours()` chạy ngon trên mọi máy — nó chỉ trả lời sai với
 * người ngồi múi giờ khác, và trả lời sai một cách im lặng. Không có gì để bắt ngoài việc
 * cấm thẳng cả họ hàm.
 *
 * Thay bằng gì: các hàm trong [vietnamese-date-format.ts](./vietnamese-date-format.ts),
 * hoặc `wallClockIn` / `instantFromWallClock` của [team-timezone.ts](./team-timezone.ts)
 * nếu cần tự dựng phép tính mới.
 *
 * Cần một ngoại lệ thật thì thêm vào MIỄN_TRỪ kèm lý do — sửa test là một quyết định có
 * chủ ý, đúng như mong muốn.
 */
import { readFileSync, readdirSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const SRC_DIR = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..");

/**
 * Họ hàm đọc/ghi theo múi giờ của máy đang chạy.
 *
 * KHÔNG cấm `getTime`, `getMilliseconds`, `toISOString` hay bất cứ hàm `*UTC*` nào — chúng
 * không phụ thuộc múi giờ máy nên vô hại.
 */
const BANNED_METHODS = [
  "getFullYear",
  "getMonth",
  "getDate",
  "getDay",
  "getHours",
  "getMinutes",
  "getSeconds",
  "setFullYear",
  "setMonth",
  "setDate",
  "setHours",
  "setMinutes",
  "setSeconds",
  "getTimezoneOffset",
  "toLocaleDateString",
  "toLocaleTimeString",
  "toLocaleString",
];

/** Đúng dấu chấm rồi tên hàm rồi ngoặc — để `getDateRange(` không bị bắt oan. */
const BANNED_PATTERN = new RegExp(`\\.(?:${BANNED_METHODS.join("|")})\\s*\\(`, "g");

/**
 * Miễn trừ, kèm lý do. Hiện chỉ có chính file này — nó buộc phải chứa tên các hàm bị cấm
 * thì mới cấm được chúng.
 */
const MIEN_TRU = new Set<string>(["lib/format/machine-clock-ban.test.ts"]);

function sourceFiles(dir: string): string[] {
  return readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) return sourceFiles(full);
    return /\.tsx?$/.test(entry.name) ? [full] : [];
  });
}

describe("cấm đọc giờ theo máy", () => {
  it("không file nào trong src/ gọi họ hàm ngày giờ theo giờ máy", () => {
    const viPham: string[] = [];

    for (const file of sourceFiles(SRC_DIR)) {
      const relative = path.relative(SRC_DIR, file).replace(/\\/g, "/");
      if (MIEN_TRU.has(relative)) continue;

      const source = readFileSync(file, "utf8");
      for (const match of source.matchAll(BANNED_PATTERN)) {
        const line = source.slice(0, match.index).split("\n").length;
        viPham.push(`${relative}:${line} — ${match[0]}`);
      }
    }

    expect(
      viPham,
      "Dùng hàm trong vietnamese-date-format.ts thay vì đọc giờ theo máy:\n" + viPham.join("\n"),
    ).toEqual([]);
  });

  // Bản thân phép quét cũng phải chứng minh nó còn bắt được — một regex hỏng thì mãi mãi
  // xanh, và đó là kiểu test tệ nhất: nó dạy người đọc tin vào thứ không còn kiểm gì.
  it("phép quét thật sự bắt được chuỗi vi phạm", () => {
    expect("date.getHours()").toMatch(BANNED_PATTERN);
    expect("value.toLocaleDateString('vi-VN')").toMatch(BANNED_PATTERN);
    expect("start.setHours(0, 0, 0, 0)").toMatch(BANNED_PATTERN);
  });

  it("phép quét không bắt oan hàm UTC và hàm tên gần giống", () => {
    expect("date.getUTCHours()").not.toMatch(BANNED_PATTERN);
    expect("date.getTime()").not.toMatch(BANNED_PATTERN);
    expect("buildGetDateRange()").not.toMatch(BANNED_PATTERN);
  });
});
