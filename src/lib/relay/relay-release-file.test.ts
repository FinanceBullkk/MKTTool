/**
 * Máy chủ tìm gói cài ở đâu, và nói gì khi không có.
 *
 * Trạng thái *"chưa có gói"* là trạng thái **bình thường** trên Railway — `.exe` dựng trên máy
 * Windows, ảnh Docker dựng trên Linux. Nên nó phải là một nhánh dữ liệu có tên, không phải một
 * ngoại lệ ném ra từ `statSync`: trang tải cần in được chỗ đã tìm để người sửa biết đặt file vào
 * đâu, mà một exception thì chỉ còn cách hiện "lỗi máy chủ".
 */
import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { RELAY_VERSION } from "./relay-endpoints";
import {
  RELAY_ARCHIVE_NAME,
  readRelayRelease,
  relayDownloadFileName,
} from "./relay-release-file";

const homes: string[] = [];

function makeReleaseDir(): string {
  const dir = mkdtempSync(path.join(tmpdir(), "mkttool-release-"));
  homes.push(dir);
  process.env.RELAY_RELEASE_DIR = dir;
  return dir;
}

afterEach(() => {
  delete process.env.RELAY_RELEASE_DIR;
  for (const dir of homes.splice(0)) rmSync(dir, { recursive: true, force: true });
});

describe("readRelayRelease", () => {
  it("thư mục rỗng — nói chưa có, kèm ĐÚNG chỗ đã tìm", () => {
    const dir = makeReleaseDir();
    const release = readRelayRelease();

    expect(release.available).toBe(false);
    // Câu trên trang tải in thẳng đường dẫn này ra. Sai nó là chỉ người sửa đi nhầm thư mục.
    if (!release.available) expect(release.expectedPath).toBe(path.join(dir, RELAY_ARCHIVE_NAME));
  });

  it("có gói — trả dung lượng và mốc đóng gói", () => {
    const dir = makeReleaseDir();
    writeFileSync(path.join(dir, RELAY_ARCHIVE_NAME), "x".repeat(2048));

    const release = readRelayRelease();
    expect(release.available).toBe(true);
    if (release.available) {
      expect(release.sizeBytes).toBe(2048);
      expect(release.version).toBe(RELAY_VERSION);
      expect(release.builtAt.getTime()).toBeLessThanOrEqual(Date.now());
    }
  });

  it("một THƯ MỤC trùng tên không tính là gói", () => {
    // `statSync` qua được cả thư mục, và nhánh sau sẽ đem nó đi stream — đường hỏng đó ra lỗi
    // EISDIR giữa lúc trình duyệt đang tải, tức người dùng nhận một file rỗng mà không báo gì.
    const dir = makeReleaseDir();
    mkdirSync(path.join(dir, RELAY_ARCHIVE_NAME));

    expect(readRelayRelease().available).toBe(false);
  });

  it("tên lúc tải xuống mang số phiên bản, tên trên đĩa thì không", () => {
    // Hai tên khác nhau có chủ ý: đường dẫn cố định để route và bộ build không phải hẹn nhau
    // theo phiên bản, còn thư mục Downloads thì cần phân biệt được các bản nằm cạnh nhau.
    expect(relayDownloadFileName()).toBe(`MKTTool-Relay-v${RELAY_VERSION}.zip`);
    expect(RELAY_ARCHIVE_NAME).not.toContain(String(RELAY_VERSION));
  });
});
