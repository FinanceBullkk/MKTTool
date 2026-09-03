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

const { readWindowsInstallerRelease, parseBundledRelayVersion } = await import(
  "./windows-installer-release"
);
const { parseWindowsInstallerReleaseMetadata } = await import("./windows-installer-release-metadata");

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

describe("readWindowsInstallerRelease - disk path", () => {
  it("reads the package from the configured path", async () => {
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
    expect(release.metadataComplete).toBe(false);
  });

  it("reports where it looked when the file is missing", async () => {
    const duongDan = path.join(thuMuc, "missing.exe");
    process.env.MKT_BROWSER_INSTALLER_PATH = duongDan;

    const release = await readWindowsInstallerRelease();

    expect(release.available).toBe(false);
    // Thiếu câu này thì người quản trị chỉ biết "chưa có gói" mà không biết đặt file vào đâu, và
    // đó đúng là trạng thái đã kéo dài nhiều tháng.
    expect(release.expectedPath).toBe(duongDan);
  });
});

/**
 * Bản cầu nối trong ruột gói cài — con số mà nếu có từ trước đã chặn được lỗi tệ nhất của pilot.
 *
 * Ràng buộc quan trọng nhất không phải là đọc đúng số, mà là **rác không bao giờ thành số**. Trang
 * chuẩn bị so con số này với bản đang phát hành để quyết định có bảo người ta tải thêm hay không;
 * một `NaN` lọt qua thành phép so sánh `false` và trang lặng lẽ dặn thừa mãi mãi, còn một số bịa
 * lớn hơn thật thì trang bảo "khỏi tải" cho một gói mang cầu nối bị từ chối.
 */
describe("parseBundledRelayVersion", () => {
  it("reads a positive integer", () => {
    expect(parseBundledRelayVersion("15")).toBe(15);
  });

  it("treats missing metadata as unknown instead of zero", () => {
    // Gói 0.3.2 đã nằm trên ngăn trước khi có khoá này, nên nhánh `undefined` là nhánh chạy thật
    // cho tới lần phát hành kế tiếp — không phải nhánh phòng xa.
    expect(parseBundledRelayVersion(undefined)).toBeNull();
  });

  it.each(["", "fifteen", "15.5", "0", "-13", "1e999", "  "])(
    "does not convert invalid input into a number: %j",
    (raw) => {
      expect(parseBundledRelayVersion(raw)).toBeNull();
    },
  );

  it("returns an explicit null Relay version for a disk release", async () => {
    const file = path.join(thuMuc, "MKT-Browser-Setup.exe");
    writeFileSync(file, "mock installer");
    process.env.MKT_BROWSER_INSTALLER_PATH = file;

    const release = await readWindowsInstallerRelease();
    expect(release.available).toBe(true);
    expect(release.bundledRelayVersion).toBeNull();
  });
});

describe("parseWindowsInstallerReleaseMetadata", () => {
  const complete = {
    "candidate-id": "20260830-browser-0.3.13-relay-16",
    "browser-version": "0.3.13",
    sha256: "a".repeat(64),
    "bundled-relay-version": "16",
    "bundled-relay-sha256": "b".repeat(64),
    "payload-manifest-sha256": "f".repeat(64),
    "payload-file-count": "130",
    "browser-source-sha": "c".repeat(40),
    "browser-source-tree": "d".repeat(40),
    "engine-kind": "cloakbrowser",
    "engine-channel": "licensed-channel",
    "engine-version": "151.0.7922.108.2",
    "engine-sha256": "e".repeat(64),
    "signing-status": "unsigned-internal-exception",
    "signing-exception-expires-at": "2099-01-01T00:00:00.000Z",
  };

  it("accepts a complete, sanitized release tuple", () => {
    const parsed = parseWindowsInstallerReleaseMetadata(complete);
    expect(parsed.metadataComplete).toBe(true);
    expect(parsed.metadataMissing).toEqual([]);
    expect(parsed.browserVersion).toBe("0.3.13");
    expect(parsed.bundledRelayVersion).toBe(16);
    expect(parsed.signingStatus).toBe("unsigned-internal-exception");
    expect(parsed.signingExceptionExpiresAt).toBe("2099-01-01T00:00:00.000Z");
  });

  it("fails closed when any required field is absent or malformed", () => {
    const parsed = parseWindowsInstallerReleaseMetadata({ ...complete, sha256: "not-a-sha" });
    expect(parsed.metadataComplete).toBe(false);
    expect(parsed.metadataMissing).toContain("sha256");

    const noTuple = parseWindowsInstallerReleaseMetadata({});
    expect(noTuple.metadataComplete).toBe(false);
    expect(noTuple.metadataMissing.length).toBeGreaterThan(5);
  });

  it("requires an expiry for the unsigned internal exception", () => {
    const withoutExpiry = { ...complete } as Record<string, string>;
    delete withoutExpiry["signing-exception-expires-at"];
    const parsed = parseWindowsInstallerReleaseMetadata(withoutExpiry, {
      now: new Date("2030-01-01T00:00:00.000Z"),
    });
    expect(parsed.metadataComplete).toBe(false);
    expect(parsed.metadataMissing).toContain("signing-exception-expires-at");
  });

  it("blocks an unsigned tuple after its persisted expiry", () => {
    const parsed = parseWindowsInstallerReleaseMetadata(complete, {
      now: new Date("2100-01-01T00:00:00.000Z"),
    });
    expect(parsed.metadataComplete).toBe(false);
    expect(parsed.metadataMissing).toContain("expired-signing-exception");
    expect(parsed.signingExceptionExpiresAt).toBe("2099-01-01T00:00:00.000Z");
  });
});
