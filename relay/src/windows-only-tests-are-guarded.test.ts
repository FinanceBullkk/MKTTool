/**
 * Bài test nào chạm kho bí mật **thật** thì phải tự bỏ qua khi không chạy trên Windows.
 *
 * `WindowsSecureStore` gọi DPAPI qua PowerShell, và `runDpapi` ném ngay khi
 * `process.platform !== "win32"`. CI của repo chạy `ubuntu-latest`, nên một file test quên chốt
 * này sẽ **xanh trên máy người viết và đỏ trên CI** — kiểu hỏng tốn nhiều thời gian nhất, vì nó
 * chỉ lộ ra sau khi đã mở PR.
 *
 * Chuyện này đã xảy ra thật ngày 12/08/2026: Phase 03 đổi ba file test sang gọi thẳng kho thật,
 * cả người viết lẫn người soát đều chạy trên Windows, và CI đỏ với 9 lỗi.
 *
 * ## Vì sao chốt bằng cách quét mã nguồn
 *
 * Cùng lý do với `guarded-entry-points.test.ts`: một quy ước mà không có gì canh thì nó mục. Đọc
 * mã nguồn dạng chuỗi là cách duy nhất thấy được "file này có chốt hay không" mà không phải chạy
 * nó trên Linux.
 *
 * ## Đường đúng khi bài test của bạn bị chốt này chặn
 *
 * Hỏi xem bài đó thật sự kiểm cái gì. Nếu kiểm **logic nghiệp vụ** — khóa đi vào kho chứ không
 * vào JSON, hai đường ghi không đạp lên nhau — thì tiêm `InMemorySecureStore` vào, và bài chạy
 * được ở mọi nền. Chỉ khi đang kiểm **chính DPAPI** mới cần `skipIf`, và khi đó nó thuộc về
 * `windows-secure-store.test.ts`.
 *
 * Thêm `skipIf` cho tiện là cách làm CI xanh mà đổi lại CI không còn canh gì cho phần đó nữa.
 */
import { readFileSync, readdirSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

const RELAY_SRC = path.join(process.cwd(), "relay", "src");
const REAL_STORE_IMPORT = /from\s+"\.\/windows-secure-store"/;
const PLATFORM_GUARD = /skipIf\(\s*process\.platform\s*!==\s*"win32"\s*\)/;

function testFiles(): string[] {
  return readdirSync(RELAY_SRC).filter((name) => name.endsWith(".test.ts"));
}

describe("test nào dùng kho bí mật thật thì phải chốt theo nền", () => {
  it("quét được ra file — phép kiểm không âm thầm quét vào chỗ trống", () => {
    // Thiếu phép kiểm này thì một lỗi đường dẫn biến cả bài thành xanh giả: quét 0 file thì 0 vi
    // phạm, và không có gì nói rằng nó vừa ngừng bảo vệ.
    expect(testFiles().length).toBeGreaterThan(5);
  });

  it.each(testFiles().map((name) => [name] as const))("%s", (name) => {
    const source = readFileSync(path.join(RELAY_SRC, name), "utf8");
    if (!REAL_STORE_IMPORT.test(source)) return;

    expect(
      PLATFORM_GUARD.test(source),
      `relay/src/${name} import WindowsSecureStore nhưng không có chốt nền.\n\n` +
        `Kho thật gọi DPAPI qua PowerShell và ném khi không phải Windows, nên file này sẽ đỏ\n` +
        `trên CI (ubuntu-latest) dù xanh trên máy bạn.\n\n` +
        `Nếu bài kiểm LOGIC NGHIỆP VỤ: tiêm InMemorySecureStore vào thay vì dựng kho thật —\n` +
        `bài chạy được ở mọi nền, và CI vẫn canh được phần đó.\n\n` +
        `Chỉ khi đang kiểm CHÍNH DPAPI mới dùng:\n` +
        `  describe.skipIf(process.platform !== "win32")(...)\n` +
        `  it.skipIf(process.platform !== "win32")(...)`,
    ).toBe(true);
  });
});
