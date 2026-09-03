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
import { clearRelayReleaseR2MetadataCache } from "./relay-release-r2-metadata-cache";
import { RELAY_VERSION } from "./relay-endpoints";
import {
  checksumOf,
  readRelayReleaseR2Config,
  RELAY_COMPATIBILITY_ARTIFACT_KINDS,
  relayCompatibilityManifestR2Key,
  relayCompatibilityArtifactR2Key,
  relayCompatibilityRevocationsR2Key,
  relayReleaseR2Key,
  versionOf,
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
  // Ngăn nhớ metadata R2 sống ở cấp module, nên một lần đọc thành công ở bài trước sẽ trả lời thay
  // cho bài sau và che mất đúng thứ bài sau đang canh.
  clearRelayReleaseR2MetadataCache();
});

afterEach(() => {
  for (const name of Object.values(RELAY_RELEASE_R2_ENV)) delete process.env[name];
  vi.unstubAllGlobals();
});

describe("readRelayReleaseR2Config", () => {
  it("returns null when unconfigured so the caller reads from disk", () => {
    expect(readRelayReleaseR2Config({})).toBeNull();
  });

  it("throws for partial configuration instead of silently disabling R2", () => {
    // Đây là người đang cố bật tính năng mà gõ sót. Lặng lẽ lùi về đĩa đúng là cách để họ tin
    // rằng máy chủ đang phục vụ gói từ R2 trong khi nó không hề.
    expect(() =>
      readRelayReleaseR2Config({ [RELAY_RELEASE_R2_ENV.bucket]: "mkttool-relay" }),
    ).toThrow(/khai thi\u1ebfu/);
  });

  it("uses dedicated variables instead of borrowing backup-bucket variables", () => {
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

  it("accepts a correctly shaped hash", () => {
    expect(checksumOf(info({ sha256: REAL_SHA256 }))).toBe(REAL_SHA256);
  });

  it("normalizes the hash to lowercase", () => {
    expect(checksumOf(info({ sha256: REAL_SHA256.toUpperCase() }))).toBe(REAL_SHA256);
  });

  it("treats a malformed hash as missing", () => {
    expect(checksumOf(info({ sha256: "not a hash" }))).toBeNull();
    expect(checksumOf(info({ sha256: "abc123" }))).toBeNull();
  });

  it("returns null without metadata", () => {
    expect(checksumOf(info({}))).toBeNull();
  });
});

describe("versionOf", () => {
  const info = (metadata: Record<string, string>) => ({
    sizeBytes: 1,
    lastModified: new Date(),
    metadata,
  });

  it("reads a positive artifact version from metadata", () => {
    expect(versionOf(info({ "relay-version": "7" }))).toBe(7);
  });

  it("rejects missing and malformed versions", () => {
    expect(versionOf(info({}))).toBeNull();
    expect(versionOf(info({ "relay-version": "v7" }))).toBeNull();
    expect(versionOf(info({ "relay-version": "0" }))).toBeNull();
  });
});

describe("immutable compatibility manifest object", () => {
  it("is versioned beside the Relay artifact without sharing its bytes", () => {
    expect(relayCompatibilityManifestR2Key(12)).toBe("MKTTool-Relay-v12.compatibility.json");
    expect(relayCompatibilityManifestR2Key(12)).not.toBe(relayReleaseR2Key(12));
    expect(() => relayCompatibilityManifestR2Key(0)).toThrow("positive integer");
  });

  it("uses separate immutable objects for revocations and managed artifacts", () => {
    expect(relayCompatibilityRevocationsR2Key(12)).toBe(
      "MKTTool-Relay-v12.compatibility-revocations.json",
    );
    expect(relayCompatibilityArtifactR2Key(12, "control-contract")).toBe(
      "MKTTool-Compatibility-v12-control-contract.artifact",
    );
    expect(() => relayCompatibilityRevocationsR2Key(0)).toThrow("positive integer");
  });

  it("publishes the licensed engine through the authenticated compatibility channel", () => {
    expect(RELAY_COMPATIBILITY_ARTIFACT_KINDS).toContain("engine");
    expect(relayCompatibilityArtifactR2Key(12, "engine")).toBe(
      "MKTTool-Compatibility-v12-engine.artifact",
    );
  });
});

describe("readRelayRelease - R2 source", () => {
  it("queries R2 instead of disk when fully configured", async () => {
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
            "x-amz-meta-relay-version": String(RELAY_VERSION),
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
      expect(release.version).toBe(RELAY_VERSION);
    }

    const [url, init] = fetchImpl.mock.calls[0]!;
    expect(String(url)).toContain(`/mkttool-relay/${relayReleaseR2Key(RELAY_VERSION)}`);
    expect(init!.method).toBe("HEAD");
  });

  it("reports an empty bucket and identifies the exact bucket checked", async () => {
    configureR2();
    vi.stubGlobal("fetch", vi.fn(async () => new Response(null, { status: 404 })));

    const release = await readRelayRelease();

    expect(release.available).toBe(false);
    if (!release.available) {
      expect(release.expectedPath).toContain("mkttool-relay");
      expect(release.expectedPath).toContain(relayReleaseR2Key(RELAY_VERSION));
      // Chỗ đã tìm in ra cho người sửa, nhưng KHÔNG kèm chìa.
      expect(release.expectedPath).not.toContain("secret");
    }
  });

  it("throws when R2 rejects the request instead of reporting no package", async () => {
    configureR2();
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => new Response("<Code>AccessDenied</Code>", { status: 403 })),
    );

    await expect(readRelayRelease()).rejects.toThrow(/AccessDenied/);
  });

  it("rejects an object whose version metadata differs from the immutable name", async () => {
    configureR2();
    vi.stubGlobal(
      "fetch",
      vi.fn(async () =>
        new Response(null, {
          status: 200,
          headers: {
            "content-length": "10",
            "x-amz-meta-sha256": REAL_SHA256,
            "x-amz-meta-relay-version": String(RELAY_VERSION - 1),
          },
        }),
      ),
    );

    await expect(readRelayRelease()).rejects.toThrow(/reports artifact version/);
  });
});
