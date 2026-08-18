/**
 * Gói cài MKT Browser, phát hành cùng đường với gói cài cầu nối.
 *
 * ## Vì sao phải có file này
 *
 * Trước 18/08/2026 máy chủ chỉ tìm trình cài **trên đĩa của chính nó**, ở `release/`. Ảnh chạy là
 * Docker Linux dựng từ repo, mà `release/` không nằm trong repo và `.exe` thì dựng trên Windows —
 * nên trên production đường đó **không bao giờ có file**. Thẻ tải luôn hiện "chưa phát hành", và
 * không có chỗ nào khác trong công cụ để lấy MKT Browser.
 *
 * Phát hiện trong lúc chạy pilot, bởi chính người vừa viết hướng dẫn "cài MKT Browser trước" —
 * bước đầu tiên của hướng dẫn đó không có nút nào để bấm.
 *
 * ## Vì sao khoá cố định, khác gói cầu nối
 *
 * Gói cầu nối khoá theo phiên bản và **bất biến**, vì `relay-release.json` bên MKTBrowser ghim
 * đúng một URL kèm mã băm: đổi ruột dưới một địa chỉ đã ghim là làm hỏng mọi lượt dựng trình cài.
 *
 * Không ai ghim trình cài trình duyệt. Người ta chỉ muốn "bản đang dùng". Nên khoá ở đây cố định
 * và phiên bản đi trong metadata — máy chủ không phải biết trước số hiệu, và phát hành bản mới
 * không cần sửa một dòng mã nào trong MKTTool. Đánh đổi nói thẳng: publish là **ghi đè**, không có
 * đường lùi về bản trước từ phía máy chủ.
 */
import { existsSync, statSync } from "node:fs";
import { Readable } from "node:stream";
import { getObject, headObject } from "@/lib/r2/r2-client";
import { readR2Config, RELAY_RELEASE_R2_ENV, type R2Config } from "@/lib/r2/r2-config";
import { CHECKSUM_METADATA_KEY } from "@/lib/relay/relay-release-r2";
import {
  WINDOWS_INSTALLER_FILE_NAME,
  openWindowsInstaller,
  readWindowsInstallerFile,
} from "./windows-installer-file";

/** Một khoá cố định trong ngăn phát hành — xem lý lẽ ở đầu file. */
export const WINDOWS_INSTALLER_R2_KEY = WINDOWS_INSTALLER_FILE_NAME;

/** Phiên bản MKT Browser, dạng chuỗi tự do (semver). Máy chủ chỉ hiển thị, không so sánh. */
export const WINDOWS_INSTALLER_VERSION_METADATA_KEY = "browser-version";

export interface WindowsInstallerRelease {
  available: boolean;
  source?: "r2" | "disk";
  sizeBytes?: number;
  /** Mốc phát hành. Trên đĩa là mốc sửa file; trên R2 là mốc ghi object. */
  publishedAt?: Date;
  version?: string | null;
  checksum?: string | null;
  /** Chỗ đã tìm. Chỉ để hiện khi chưa có gói — không lộ chìa, chỉ lộ tên ngăn. */
  expectedPath: string;
}

export function readWindowsInstallerR2Config(
  env: NodeJS.ProcessEnv = process.env,
): R2Config | null {
  return readR2Config(env, RELAY_RELEASE_R2_ENV);
}

/**
 * Ngăn R2 nếu có khai, ngược lại là đĩa của máy chủ.
 *
 * Cùng thứ tự ưu tiên với gói cầu nối, và cùng một lý do giữ lại đường đĩa: máy dev chạy `npm run
 * dev` không khai ngăn nào, và bắt họ dựng cả một ngăn R2 chỉ để nhìn thấy cái nút là đổi một
 * bất tiện lấy một bất tiện lớn hơn.
 */
export async function readWindowsInstallerRelease(): Promise<WindowsInstallerRelease> {
  const config = readWindowsInstallerR2Config();
  return config ? readFromR2(config) : readFromDisk();
}

async function readFromR2(config: R2Config): Promise<WindowsInstallerRelease> {
  const expectedPath = `ngăn R2 "${config.bucket}", object "${WINDOWS_INSTALLER_R2_KEY}"`;
  // Lỗi mạng và lỗi cấu hình KHÔNG được biến thành "chưa có gói" — cùng lý lẽ với gói cầu nối:
  // hai chuyện đó dẫn tới hai việc phải làm khác hẳn nhau, và câu "chưa phát hành" sẽ cử người
  // quản trị đi dựng lại một gói vốn đã nằm sẵn trên ngăn.
  const info = await headObject({ config, key: WINDOWS_INSTALLER_R2_KEY });
  if (!info) return { available: false, expectedPath };

  return {
    available: true,
    source: "r2",
    sizeBytes: info.sizeBytes,
    publishedAt: info.lastModified,
    version: info.metadata[WINDOWS_INSTALLER_VERSION_METADATA_KEY] ?? null,
    checksum: info.metadata[CHECKSUM_METADATA_KEY] ?? null,
    expectedPath,
  };
}

function readFromDisk(): WindowsInstallerRelease {
  const file = readWindowsInstallerFile();
  if (!file.available) return { available: false, expectedPath: file.path };

  const stat = statSync(file.path);
  return {
    available: true,
    source: "disk",
    sizeBytes: stat.size,
    publishedAt: stat.mtime,
    // Trên đĩa không có chỗ nào cất số hiệu, và bịa ra một file `.version` cạnh nó chỉ để hiển
    // thị là thêm một thứ nữa có thể lệch. Đường đĩa là đường dev.
    version: null,
    checksum: null,
    expectedPath: file.path,
  };
}

/** Mở luồng đọc gói cài, từ đúng nguồn mà `readWindowsInstallerRelease` đã chọn. */
export async function openWindowsInstallerStream(
  release: WindowsInstallerRelease,
): Promise<{ stream: ReadableStream<Uint8Array>; sizeBytes: number }> {
  if (!release.available) throw new Error("The Windows installer is not available.");

  if (release.source === "r2") {
    const config = readWindowsInstallerR2Config();
    if (!config) throw new Error("The release bucket is no longer configured.");
    const { body } = await getObject({ config, key: WINDOWS_INSTALLER_R2_KEY });
    return { stream: body, sizeBytes: release.sizeBytes ?? 0 };
  }

  const file = readWindowsInstallerFile();
  if (!file.available || !existsSync(file.path)) {
    throw new Error("The Windows installer disappeared from disk between listing and reading.");
  }
  const opened = await openWindowsInstaller(file);
  return {
    stream: Readable.toWeb(opened.stream) as ReadableStream<Uint8Array>,
    sizeBytes: opened.sizeBytes,
  };
}
