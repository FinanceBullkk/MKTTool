/**
 * Máy chủ lấy gói cầu nối từ ngăn R2 (QĐ 12).
 *
 * Ba tính chất được canh ở đây, và cả ba đều là chỗ hỏng-trong-im-lặng:
 *
 *  1. **Khai đủ bốn biến thì đổi nguồn thật**, chứ không phải vẫn lặng lẽ đọc đĩa — trên Railway
 *     đĩa luôn rỗng, nên nhầm nhánh nghĩa là trang tải nói "chưa có gói" vĩnh viễn.
 *  2. **Mã băm rác bị chặn ở cửa.** Một chuỗi sai hình dạng đi tới trang tải sẽ được người cài đem
 *     đối chiếu, thấy lệch, rồi kết luận file hỏng — trong khi file hoàn toàn đúng.
 *  3. **Lỗi mạng KHÔNG được hóa thành "chưa có gói".** Hai chuyện đó dẫn tới hai việc phải làm
 *     khác hẳn nhau, và câu sai sẽ cử người quản trị đi build lại một gói đã nằm sẵn trên R2.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { RELAY_RELEASE_R2_ENV } from "../r2/r2-config";
import { readRelayRelease } from "./relay-release-file";
import {
  RELAY_RELEASE_R2_KEY,
  checksumOf,
  readRelayReleaseR2Config,
} from "./relay-release-r2";

/** SHA-256 của chuỗi "hello" — hằng số công khai, đúng hình dạng 64 ký tự hex. */
const REAL_SHA256 = "2cf24dba5fb0a30e26e83b2ac5b9e29e1b161e5c1fa7425e73043362938b9824";

function configureR2(): void {
  process.env[RELAY_RELEASE_R2_ENV.accountId] = "acc123";
  process.env[RELAY_RELEASE_R2_ENV.bucket] = "mkttool-relay";
  process.env[RELAY_RELEASE_R2_ENV.accessKeyId] = "key";
  process.env[RELAY_RELEASE_R2_ENV.secretAccessKey] = "secret";
}

beforeEach(() => {
  for (const name of Object.values(RELAY_RELEASE_R2_ENV)) delete process.env[name];
});

afterEach(() => {
  for (const name of Object.values(RELAY_RELEASE_R2_ENV)) delete process.env[name];
  vi.unstubAllGlobals();
});

describe("readRelayReleaseR2Config", () => {
  it("không khai gì — null, nghĩa là đọc từ đĩa", () => {
    expect(readRelayReleaseR2Config({})).toBeNull();
  });

  it("khai một nửa thì NÉM, không lặng lẽ coi như tắt", () => {
    // Đây là người đang cố bật tính năng mà gõ sót. Lặng lẽ lùi về đĩa đúng là cách để họ tin
    // rằng máy chủ đang phục vụ gói từ R2 trong khi nó không hề.
    expect(() =>
      readRelayReleaseR2Config({ [RELAY_RELEASE_R2_ENV.bucket]: "mkttool-relay" }),
    ).toThrow(/khai thiếu/);
  });

  it("dùng bộ biến RIÊNG, không mượn biến của ngăn sao lưu", () => {
    // Gộp hai ngăn là để một chìa mở được cả bản sao lưu lẫn gói cài — mở rộng thiệt hại của một
    // lần chiếm máy chủ chứ không thu hẹp nó.
    const backupEnv = {
      R2_ACCOUNT_ID: "acc",
      R2_BUCKET: "mkttool-backup",
      R2_ACCESS_KEY_ID: "key",
      R2_SECRET_ACCESS_KEY: "secret",
    };
    expect(readRelayReleaseR2Config(backupEnv)).toBeNull();
  });
});

describe("checksumOf", () => {
  const info = (metadata: Record<string, string>) => ({
    sizeBytes: 1,
    lastModified: new Date(),
    metadata,
  });

  it("nhận mã băm đúng hình dạng", () => {
    expect(checksumOf(info({ sha256: REAL_SHA256 }))).toBe(REAL_SHA256);
  });

  it("chuẩn hóa về chữ thường", () => {
    expect(checksumOf(info({ sha256: REAL_SHA256.toUpperCase() }))).toBe(REAL_SHA256);
  });

  it("chuỗi sai hình dạng bị coi như KHÔNG có", () => {
    expect(checksumOf(info({ sha256: "không phải mã băm" }))).toBeNull();
    expect(checksumOf(info({ sha256: "abc123" }))).toBeNull();
  });

  it("không có metadata thì null", () => {
    expect(checksumOf(info({}))).toBeNull();
  });
});

describe("readRelayRelease — nguồn R2", () => {
  it("khai đủ thì hỏi R2 chứ không đọc đĩa", async () => {
    configureR2();
    // Khai đủ tham số để `mock.calls` mang kiểu đọc được — `vi.fn` không tham số suy ra tuple rỗng.
    const fetchImpl = vi.fn((_url: string | URL | Request, _init?: RequestInit) =>
      Promise.resolve(
        new Response(null, {
          status: 200,
          headers: {
            "content-length": "34078720",
            "last-modified": "Thu, 06 Aug 2026 06:36:14 GMT",
            "x-amz-meta-sha256": REAL_SHA256,
          },
        }),
      ),
    );
    vi.stubGlobal("fetch", fetchImpl);

    const release = await readRelayRelease();

    expect(release.available).toBe(true);
    if (release.available) {
      expect(release.source).toBe("r2");
      expect(release.sizeBytes).toBe(34078720);
      // Mã băm tới từ metadata — máy chủ KHÔNG kéo 32 MB về để tự băm ở mỗi lượt mở trang.
      expect(release.checksum).toBe(REAL_SHA256);
    }

    const [url, init] = fetchImpl.mock.calls[0]!;
    expect(String(url)).toContain(`/mkttool-relay/${RELAY_RELEASE_R2_KEY}`);
    expect(init!.method).toBe("HEAD");
  });

  it("ngăn rỗng — nói chưa có, và chỉ đúng ngăn đã tìm", async () => {
    configureR2();
    vi.stubGlobal("fetch", vi.fn(async () => new Response(null, { status: 404 })));

    const release = await readRelayRelease();

    expect(release.available).toBe(false);
    if (!release.available) {
      expect(release.expectedPath).toContain("mkttool-relay");
      expect(release.expectedPath).toContain(RELAY_RELEASE_R2_KEY);
      // Chỗ đã tìm in ra cho người sửa, nhưng KHÔNG kèm chìa.
      expect(release.expectedPath).not.toContain("secret");
    }
  });

  it("R2 từ chối thì NÉM, không hóa thành 'chưa có gói'", async () => {
    configureR2();
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => new Response("<Code>AccessDenied</Code>", { status: 403 })),
    );

    await expect(readRelayRelease()).rejects.toThrow(/AccessDenied/);
  });
});
