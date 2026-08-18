/**
 * Gói cài MKT Browser đọc được từ đĩa, và nói đúng chỗ đã tìm khi không có.
 *
 * Trước 18/08/2026 máy chủ **chỉ** biết đường đĩa, và trên production đường đó không bao giờ có
 * file: ảnh chạy là Docker Linux dựng từ repo, `release/` không nằm trong repo, `.exe` dựng trên
 * Windows. Nên thẻ tải luôn hiện "chưa phát hành" và không có chỗ nào khác trong công cụ để lấy
 * MKT Browser — bước đầu tiên của hướng dẫn onboard không có nút nào để bấm.
 *
 * Bài này giữ đường đĩa (đường của máy dev) đúng như nó phải chạy. Đường R2 cần một ngăn thật nên
 * không kiểm ở đây; thứ nối hai đầu là hằng số dùng chung giữa bộ đọc và bộ phát hành, nên chúng
 * không lệch được.
 */
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

const { readWindowsInstallerRelease } = await import("./windows-installer-release");

let thuMuc: string;
const bienCu = process.env.MKT_BROWSER_INSTALLER_PATH;

beforeEach(() => {
  thuMuc = mkdtempSync(path.join(os.tmpdir(), "mkt-installer-"));
});

afterEach(() => {
  if (bienCu === undefined) delete process.env.MKT_BROWSER_INSTALLER_PATH;
  else process.env.MKT_BROWSER_INSTALLER_PATH = bienCu;
  rmSync(thuMuc, { recursive: true, force: true });
});

describe("readWindowsInstallerRelease — đường đĩa", () => {
  it("đọc được gói nằm ở đường đã khai", async () => {
    const duongDan = path.join(thuMuc, "MKTBrowser-win-x64.exe");
    writeFileSync(duongDan, Buffer.alloc(2048, 7));
    process.env.MKT_BROWSER_INSTALLER_PATH = duongDan;

    const release = await readWindowsInstallerRelease();

    expect(release.available).toBe(true);
    expect(release.source).toBe("disk");
    expect(release.sizeBytes).toBe(2048);
    expect(release.publishedAt).toBeInstanceOf(Date);
    // Đĩa không có chỗ cất số hiệu và mã băm — đó là đường dev, không phải đường phát hành.
    expect(release.version).toBeNull();
    expect(release.checksum).toBeNull();
  });

  it("không có file thì nói ra ĐÃ TÌM Ở ĐÂU, không chỉ nói là không có", async () => {
    const duongDan = path.join(thuMuc, "khong-ton-tai.exe");
    process.env.MKT_BROWSER_INSTALLER_PATH = duongDan;

    const release = await readWindowsInstallerRelease();

    expect(release.available).toBe(false);
    // Thiếu câu này thì người quản trị chỉ biết "chưa có gói" mà không biết đặt file vào đâu, và
    // đó đúng là trạng thái đã kéo dài nhiều tháng.
    expect(release.expectedPath).toBe(duongDan);
  });
});
