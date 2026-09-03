/**
 * Máy chủ tìm gói cài ở đâu, và nói gì khi không có.
 *
 * Trạng thái *"chưa có gói"* là trạng thái **bình thường** trên Railway — `.exe` dựng trên máy
 * Windows, ảnh Docker dựng trên Linux. Nên nó phải là một nhánh dữ liệu có tên, không phải một
 * ngoại lệ ném ra từ `statSync`: trang tải cần in được chỗ đã tìm để người sửa biết đặt file vào
 * đâu, mà một exception thì chỉ còn cách hiện "lỗi máy chủ".
 */
import { createHash } from "node:crypto";
import { mkdtempSync, mkdirSync, rmSync, utimesSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { RELAY_RELEASE_R2_ENV } from "../r2/r2-config";
import { RELAY_VERSION } from "./relay-endpoints";
import { writeRelayArtifactMetadata } from "./relay-release-metadata";
import {
  RELAY_ARCHIVE_NAME,
  readRelayRelease,
  relayArchiveChecksum,
  relayDownloadFileName,
} from "./relay-release-file";

const homes: string[] = [];

function makeReleaseDir(): string {
  const dir = mkdtempSync(path.join(tmpdir(), "mkttool-release-"));
  homes.push(dir);
  process.env.RELAY_RELEASE_DIR = dir;
  return dir;
}

function writeArtifact(dir: string, contents: string, version = RELAY_VERSION): void {
  const archive = path.join(dir, RELAY_ARCHIVE_NAME);
  writeFileSync(archive, contents);
  writeRelayArtifactMetadata(dir, {
    version,
    sizeBytes: Buffer.byteLength(contents),
    sha256: createHash("sha256").update(contents).digest("hex"),
  });
}

// Bộ test này đo **nhánh đĩa**. Máy chạy nó có thể đã khai ngăn R2 trong môi trường của mình, và
// khi đó `readRelayRelease` sẽ đi hỏi qua mạng — bài test hoặc treo, hoặc đo nhầm thứ khác.
beforeEach(() => {
  for (const name of Object.values(RELAY_RELEASE_R2_ENV)) delete process.env[name];
});

afterEach(() => {
  delete process.env.RELAY_RELEASE_DIR;
  for (const dir of homes.splice(0)) rmSync(dir, { recursive: true, force: true });
});

describe("readRelayRelease", () => {
  it("reports an empty directory and the exact path checked", async () => {
    const dir = makeReleaseDir();
    const release = await readRelayRelease();

    expect(release.available).toBe(false);
    // Câu trên trang tải in thẳng đường dẫn này ra. Sai nó là chỉ người sửa đi nhầm thư mục.
    if (!release.available) expect(release.expectedPath).toBe(path.join(dir, RELAY_ARCHIVE_NAME));
  });

  it("returns the package size and packaging time", async () => {
    const dir = makeReleaseDir();
    writeArtifact(dir, "x".repeat(2048), RELAY_VERSION - 1);

    const release = await readRelayRelease();
    expect(release.available).toBe(true);
    if (release.available) {
      expect(release.sizeBytes).toBe(2048);
      expect(release.version).toBe(RELAY_VERSION - 1);
      // Nới một giây thay vì so thẳng với `Date.now()`. Mốc sửa file trên NTFS có độ phân giải
      // mịn hơn mili giây và được LÀM TRÒN khi thành `Date`, còn `Date.now()` thì CẮT — nên mtime
      // của một file vừa ghi xong hoàn toàn có thể lớn hơn `Date.now()` gọi ngay sau đó đúng 1 ms.
      // Đã đỏ thật vì lý do này (06/08/2026). Thứ phép kiểm này quan tâm là "mốc lấy từ file chứ
      // không phải bịa ra", chứ không phải độ chính xác mili giây.
      expect(release.builtAt.getTime()).toBeLessThanOrEqual(Date.now() + 1_000);
    }
  });

  it("does not treat a directory with the package name as a package", async () => {
    // `statSync` qua được cả thư mục, và nhánh sau sẽ đem nó đi stream — đường hỏng đó ra lỗi
    // EISDIR giữa lúc trình duyệt đang tải, tức người dùng nhận một file rỗng mà không báo gì.
    const dir = makeReleaseDir();
    mkdirSync(path.join(dir, RELAY_ARCHIVE_NAME));

    expect((await readRelayRelease()).available).toBe(false);
  });

  it("includes the version in the download name but not the disk name", () => {
    // Hai tên khác nhau có chủ ý: đường dẫn cố định để route và bộ build không phải hẹn nhau
    // theo phiên bản, còn thư mục Downloads thì cần phân biệt được các bản nằm cạnh nhau.
    expect(relayDownloadFileName(RELAY_VERSION)).toBe(`MKTTool-Relay-v${RELAY_VERSION}.zip`);
    expect(RELAY_ARCHIVE_NAME).not.toContain(String(RELAY_VERSION));
  });
});

describe("relayArchiveChecksum", () => {
  /** SHA-256 của chuỗi "hello" — hằng số công khai, không tính lại bằng chính thư viện đang đo. */
  const HELLO_SHA256 = "2cf24dba5fb0a30e26e83b2ac5b9e29e1b161e5c1fa7425e73043362938b9824";

  it("computes the standard SHA-256 hash", async () => {
    const dir = makeReleaseDir();
    writeArtifact(dir, "hello");

    // So với hằng số ngoài đời, không so với `createHash` gọi lại lần nữa: một phép so như thế
    // vẫn xanh kể cả khi cả hai bên cùng dùng sai thuật toán.
    expect(await relayArchiveChecksum()).toBe(HELLO_SHA256);
  });

  it("returns no hash when no package exists", async () => {
    makeReleaseDir();
    expect(await relayArchiveChecksum()).toBeNull();
  });

  it("changes the hash when a new package replaces the old file at the same path", async () => {
    // Đây là đường **nâng cấp**: cùng tên file, nội dung khác. Ô đệm mà chỉ khóa theo đường dẫn
    // sẽ trả số của bản cũ, và người cài đối chiếu thấy lệch rồi kết luận file tải hỏng — trong
    // khi file hoàn toàn đúng và thứ sai là con số trên trang.
    const dir = makeReleaseDir();
    const file = path.join(dir, RELAY_ARCHIVE_NAME);
    writeArtifact(dir, "hello");
    const before = await relayArchiveChecksum();

    // Cùng độ dài để phép kiểm không đi qua được chỉ nhờ cỡ file đổi; đẩy mốc sửa lên một phút
    // vì hai lượt ghi liên tiếp có thể rơi vào cùng một mốc thời gian của hệ thống tệp.
    writeFileSync(file, "world");
    const later = new Date(Date.now() + 60_000);
    utimesSync(file, later, later);

    expect(await relayArchiveChecksum()).not.toBe(before);
  });

  it("returns the same string for repeated calls on the same file", async () => {
    const dir = makeReleaseDir();
    writeArtifact(dir, "hello");

    // Lượt sau đi qua ô đệm. Trang tải vẽ lại ở mỗi lượt xem, nên nếu ô đệm trả sai thì mỗi
    // người xem một con số khác nhau — thứ còn tệ hơn là không hiện gì.
    expect(await relayArchiveChecksum()).toBe(await relayArchiveChecksum());
  });

  it("rejects an artifact without version metadata", async () => {
    const dir = makeReleaseDir();
    writeFileSync(path.join(dir, RELAY_ARCHIVE_NAME), "hello");
    await expect(readRelayRelease()).rejects.toThrow(/artifact metadata/i);
  });
});
