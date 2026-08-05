/**
 * Máy chủ tìm gói cài ở đâu, và nói gì khi không có.
 *
 * Trạng thái *"chưa có gói"* là trạng thái **bình thường** trên Railway — `.exe` dựng trên máy
 * Windows, ảnh Docker dựng trên Linux. Nên nó phải là một nhánh dữ liệu có tên, không phải một
 * ngoại lệ ném ra từ `statSync`: trang tải cần in được chỗ đã tìm để người sửa biết đặt file vào
 * đâu, mà một exception thì chỉ còn cách hiện "lỗi máy chủ".
 */
import { mkdtempSync, mkdirSync, rmSync, utimesSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { RELAY_VERSION } from "./relay-endpoints";
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

describe("relayArchiveChecksum", () => {
  /** SHA-256 của chuỗi "hello" — hằng số công khai, không tính lại bằng chính thư viện đang đo. */
  const HELLO_SHA256 = "2cf24dba5fb0a30e26e83b2ac5b9e29e1b161e5c1fa7425e73043362938b9824";

  it("băm đúng chuẩn SHA-256", async () => {
    const dir = makeReleaseDir();
    writeFileSync(path.join(dir, RELAY_ARCHIVE_NAME), "hello");

    // So với hằng số ngoài đời, không so với `createHash` gọi lại lần nữa: một phép so như thế
    // vẫn xanh kể cả khi cả hai bên cùng dùng sai thuật toán.
    expect(await relayArchiveChecksum()).toBe(HELLO_SHA256);
  });

  it("chưa có gói thì không có mã băm", async () => {
    makeReleaseDir();
    expect(await relayArchiveChecksum()).toBeNull();
  });

  it("thay gói mới vào đúng đường dẫn cũ thì mã băm phải đổi theo", async () => {
    // Đây là đường **nâng cấp**: cùng tên file, nội dung khác. Ô đệm mà chỉ khóa theo đường dẫn
    // sẽ trả số của bản cũ, và người cài đối chiếu thấy lệch rồi kết luận file tải hỏng — trong
    // khi file hoàn toàn đúng và thứ sai là con số trên trang.
    const dir = makeReleaseDir();
    const file = path.join(dir, RELAY_ARCHIVE_NAME);

    writeFileSync(file, "hello");
    const before = await relayArchiveChecksum();

    // Cùng độ dài để phép kiểm không đi qua được chỉ nhờ cỡ file đổi; đẩy mốc sửa lên một phút
    // vì hai lượt ghi liên tiếp có thể rơi vào cùng một mốc thời gian của hệ thống tệp.
    writeFileSync(file, "world");
    const later = new Date(Date.now() + 60_000);
    utimesSync(file, later, later);

    expect(await relayArchiveChecksum()).not.toBe(before);
  });

  it("gọi lại trên cùng một file trả về cùng một chuỗi", async () => {
    const dir = makeReleaseDir();
    writeFileSync(path.join(dir, RELAY_ARCHIVE_NAME), "hello");

    // Lượt sau đi qua ô đệm. Trang tải vẽ lại ở mỗi lượt xem, nên nếu ô đệm trả sai thì mỗi
    // người xem một con số khác nhau — thứ còn tệ hơn là không hiện gì.
    expect(await relayArchiveChecksum()).toBe(await relayArchiveChecksum());
  });
});
