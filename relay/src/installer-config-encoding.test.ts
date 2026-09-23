/**
 * Bộ cài phải ghi `relay-config.json` **không kèm BOM**.
 *
 * ## Vì sao là phép kiểm mã nguồn, không phải phép chạy thật
 *
 * Cùng lối với [machine-clock-ban.test.ts](../../src/lib/format/machine-clock-ban.test.ts) và
 * [guarded-entry-points.test.ts](../../src/lib/auth/guarded-entry-points.test.ts): có những kiểu
 * hỏng **không làm test nào đỏ**, nên phải cấm thẳng ở tầng hình dạng.
 *
 * Chạy thật bộ cài thì đúng hơn nhưng nó `Start-Process` con cầu nối ở bước cuối — tức chiếm cổng
 * 47821 giữa lúc bộ nghiệm thu `.exe` đang cần chính cổng đó. Đổi một phép kiểm tất định lấy một
 * phép kiểm phải dọn tiến trình là lỗ.
 *
 * ## Chuyện đã xảy ra
 *
 * Bản đầu của bộ cài dùng `Set-Content -Encoding utf8`. Trên **Windows PowerShell 5.1** cờ đó ghi
 * kèm BOM, `JSON.parse` nghẹn ngay ký tự đầu, và cầu nối báo *"không phải JSON hợp lệ"* — cho một
 * file mà mở bằng mắt thì đúng cú pháp từng dấu phẩy. Người đọc câu đó đi soi dấu ngoặc chứ không
 * ai nghĩ tới ba byte vô hình. Chết ở đúng lượt cài đầu tiên trên máy thật (06/08/2026).
 *
 * Cầu nối nay cũng tự bỏ BOM khi đọc (`readConfigText`). Hai lớp, và cần cả hai: lớp kia đỡ cho
 * người dùng mở file bằng Notepad, lớp này đỡ cho chính bộ cài.
 */
import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

const SOURCE = readFileSync(path.join(process.cwd(), "relay", "install-relay.ps1"), "utf8");

/**
 * Mã đã bỏ chú thích.
 *
 * Bắt buộc, không phải cho gọn: chỗ sửa lỗi này để lại một dòng chú thích *nhắc đừng dùng*
 * `Set-Content -Encoding utf8`, và phép kiểm bên dưới khớp ngay vào đúng câu nhắc đó. Test đỏ vì
 * lời cảnh báo về chính thứ nó đang cấm là kiểu đỏ giả khó chịu nhất — nó dạy người sau rằng cách
 * làm test xanh là xóa lời giải thích đi.
 */
const INSTALLER = SOURCE.replace(/<#[\s\S]*?#>/g, "").replace(/^\s*#.*$/gm, "");

describe("bộ cài ghi relay-config.json", () => {
  it("dùng UTF8Encoding KHÔNG BOM", () => {
    expect(INSTALLER).toMatch(/New-Object\s+Text\.UTF8Encoding\s+\$false/);
  });

  it("KHÔNG dùng Set-Content -Encoding utf8 — cờ đó kèm BOM trên PowerShell 5.1", () => {
    expect(INSTALLER).not.toMatch(/Set-Content[^\r\n]*-Encoding\s+utf8/i);
  });

  it("KHÔNG dùng Out-File cho file cấu hình — cùng cái bẫy", () => {
    expect(INSTALLER).not.toMatch(/\$configFile[^\r\n]*Out-File|Out-File[^\r\n]*\$configFile/i);
  });

  it("bật cầu nối hỏng thì KHÔNG kéo cả lượt cài thành thất bại", () => {
    // Windows chặn chạy file lạ tải từ mạng; người dùng bấm "Không chạy" là `Start-Process` ném
    // `The operation was canceled by the user`. Ba bước thật đã xong từ trước, nên báo "cài đặt
    // thất bại" ở đó là cử người đi cài lại một thứ đã cài đúng. Đã vấp thật trên máy thứ hai
    // (06/08/2026).
    expect(INSTALLER).toMatch(/try\s*\{\s*Start-RelayProcess\s*\}\s*catch/);
  });

  it("gỡ Mark-of-the-Web khỏi bản đã chép", () => {
    // Không gỡ thì Windows hỏi lại ở MỖI lần chạy, kể cả lượt tự bật cùng máy — mà lượt đó chạy
    // ngầm nên người dùng chỉ thấy "không có cầu nối", không thấy hộp nào để bấm.
    expect(INSTALLER).toMatch(/Unblock-File[^\r\n]*\$targetExe/);
    expect(INSTALLER).toMatch(/Unblock-File[^\r\n]*\$targetLauncher/);
  });

  it("vẫn không ghi đè file cấu hình đã có", () => {
    // Ghi đè ở đường nâng cấp là xóa mất khóa vùng operator của máy đó — thứ không có ở đâu khác
    // để lấy lại. Nằm ở đây vì nó là tính chất của cùng một đoạn code.
    expect(INSTALLER).toMatch(/if\s*\(\s*Test-Path\s+\$configFile\s*\)/);
  });
});

describe("the installer script file itself", () => {
  it("keeps its own UTF-8 byte order mark", () => {
    // The mirror image of the bug above, on the same file: Windows PowerShell 5.1 reads a BOM-less
    // .ps1 in the machine ANSI code page. The installer still installs correctly, so nothing turns
    // red — only every non-ASCII line the operator reads becomes mojibake, on the one screen they
    // have. The packaging script guards this as well, but that guard fires only when someone
    // packages a release. The W02 rename dropped the mark and stayed green through a full suite
    // run (10 August 2026), which is exactly why the check belongs here too.
    expect(SOURCE.charCodeAt(0)).toBe(0xfeff);
  });
});
