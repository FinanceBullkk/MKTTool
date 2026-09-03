/**
 * Ranh giới của GĐ3, canh bằng cách quét mã nguồn: **máy chủ không mở khóa vùng operator.**
 *
 * ## Vì sao là một bài test chứ không phải một lượt grep lúc nghiệm thu
 *
 * Kế hoạch GĐ3 ghi việc cuối là *"kiểm bằng grep: không còn chỗ nào trên máy chủ giải mã cột
 * vùng operator"*. Một lượt grep chứng minh được hôm nay, và **chỉ hôm nay**. Ngày mai ai đó
 * thêm một tính năng "xuất danh sách nick kèm mật khẩu" là ranh giới mất, mọi test khác vẫn
 * xanh, và không có gì báo — vì mã đó *chạy đúng*, chỉ là nó phá bỏ điều kiện mà cả phase dựng
 * lên.
 *
 * Cùng lối với `machine-clock-ban.test.ts` (cấm họ hàm giờ máy) và `guarded-entry-points.test.ts`
 * (bắt mọi lối vào phải có gác): kiểu hỏng nào **không làm test nào đỏ** thì phải có một phép
 * kiểm hình dạng mã nguồn nhắm thẳng vào nó.
 *
 * ## Nó cấm gì
 *
 * Đúng một thứ: `loadVaultKey("operator")` trong mã chạy trên máy chủ. Đó là cửa duy nhất để
 * lấy khóa vùng operator ra trong tiến trình web — chặn được cửa đó là chặn được cả nhóm hành
 * vi, mà không phải liệt kê từng cách gọi `decryptCredential`.
 *
 * Cầu nối ở GĐ4 không nằm trong diện này: nó đọc khóa từ file cấu hình của chính máy đó và
 * truyền thẳng vào `decryptCredential`, không đi qua bộ nạp khóa của máy chủ.
 *
 * ## Nó quét cả chú thích, và đó là chủ ý
 *
 * Bài test không phân biệt mã với comment. Tách ra được, nhưng bộ tách comment lại là thêm một
 * đoạn mã có thể sai — và sai theo hướng bỏ sót. Cái giá của việc không tách chỉ là phải viết
 * *"khóa vùng operator"* thay vì dán nguyên lời gọi vào chú thích, tức là gần như không có giá.
 */
import { readFileSync, readdirSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

/** Cửa duy nhất lấy khóa vùng operator trong tiến trình máy chủ. */
const FORBIDDEN = /loadVaultKey\(\s*["']operator["']\s*\)/;

/**
 * Ai được phép gọi, và vì sao.
 *
 * Chỉ có test và script vận hành. **Test** phải đóng vai cầu nối để dựng dữ liệu và để chứng
 * minh "khóa server không mở được cột này" — không có khóa thì không kiểm được gì. **Script**
 * chạy bằng tay trên máy có khóa, không phải một lối vào HTTP: `vault:rekey` bắt buộc phải mở
 * được cả vùng operator để xoay nó, và `vault:smoke` phải đối chiếu được hai vùng.
 *
 * Danh sách này cố ý ngắn và cố ý phải sửa bằng tay: thêm một dòng vào đây là một quyết định
 * có người đọc, không phải một dòng trôi qua trong diff.
 */
const ALLOWED = [/\.test\.ts$/, /^scripts[\\/]/];

/** Mọi file mã nguồn dưới một thư mục, bỏ qua thư mục build. */
function collectSourceFiles(root: string, relative = ""): string[] {
  const files: string[] = [];

  for (const entry of readdirSync(path.join(root, relative), { withFileTypes: true })) {
    const next = path.join(relative, entry.name);
    if (entry.isDirectory()) {
      if (entry.name === "node_modules" || entry.name === ".next") continue;
      files.push(...collectSourceFiles(root, next));
      continue;
    }
    if (/\.(ts|tsx)$/.test(entry.name)) files.push(next);
  }

  return files;
}

describe("the server has no path to open the operator key domain", () => {
  it("allows only tests and scripts to call loadVaultKey(\"operator\")", () => {
    const root = process.cwd();
    const files = [
      ...collectSourceFiles(root, "src"),
      ...collectSourceFiles(root, "scripts"),
    ];

    const offenders = files.filter((file) => {
      if (ALLOWED.some((pattern) => pattern.test(file))) return false;
      return FORBIDDEN.test(readFileSync(path.join(root, file), "utf8"));
    });

    expect(offenders).toEqual([]);
  });

  /**
   * Bài test trên chỉ đáng tin khi mẫu tìm kiếm của nó thật sự bắt được thứ nó nói là bắt.
   * Không có phép kiểm này thì một lần sửa regex hỏng biến nó thành một bài test luôn xanh —
   * đúng kiểu hỏng tệ nhất của một phép kiểm an toàn.
   */
  it("matches equivalent call formatting", () => {
    expect(FORBIDDEN.test('loadVaultKey("operator")')).toBe(true);
    expect(FORBIDDEN.test("loadVaultKey('operator')")).toBe(true);
    expect(FORBIDDEN.test('loadVaultKey( "operator" )')).toBe(true);
    expect(FORBIDDEN.test('loadVaultKey("server")')).toBe(false);
  });

  /** Và phải thật sự có file để quét — đường dẫn sai thì danh sách rỗng cũng "đạt". */
  it("scans real source files", () => {
    expect(collectSourceFiles(process.cwd(), "src").length).toBeGreaterThan(50);
  });
});
