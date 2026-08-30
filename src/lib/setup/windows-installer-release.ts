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
 * Khoá vẫn cố định để giữ tương thích với client cũ, nhưng bộ đọc không tự coi object hiện tại là
 * bản đang dùng: R2 chỉ được mở khi metadata và kích cỡ khớp tuple được cấu hình rõ ràng ở môi
 * trường triển khai. Đánh đổi còn lại phải nói thẳng: khoá publish vẫn mutable và không tự tạo
 * đường lùi về bản trước từ phía máy chủ.
 */
import { createReadStream, createWriteStream, existsSync, statSync } from "node:fs";
import { mkdtemp, rm } from "node:fs/promises";
import { createHash } from "node:crypto";
import os from "node:os";
import path from "node:path";
import { Readable } from "node:stream";
import { Transform } from "node:stream";
import { pipeline } from "node:stream/promises";
import type { ReadableStream as NodeReadableStream } from "node:stream/web";
import { getObject, headObject } from "@/lib/r2/r2-client";
import { readR2Config, RELAY_RELEASE_R2_ENV, type R2Config } from "@/lib/r2/r2-config";
import {
  WINDOWS_INSTALLER_FILE_NAME,
  openWindowsInstaller,
  readWindowsInstallerFile,
} from "./windows-installer-file";
import {
  emptyWindowsInstallerReleaseMetadata,
  parseWindowsInstallerReleaseMetadata,
  type WindowsInstallerReleaseMetadata,
} from "./windows-installer-release-metadata";

/**
 * The currently approved Browser draft tuple. A syntactically complete but stale R2 object must
 * remain unavailable after a Browser contract or Relay-floor change. Update this tuple only during
 * a new release freeze, together with the plan manifest and evidence.
 */
export const EXPECTED_WINDOWS_INSTALLER_VERSION = "0.3.13";
export const EXPECTED_WINDOWS_INSTALLER_CANDIDATE_ID = "20260830-browser-0.3.13-relay-16";

/**
 * Deployment-owned approval binding for the mutable installer key.
 *
 * The value is a JSON object of the form `{ "sizeBytes": number, "metadata": { ... } }`, where
 * `metadata` contains the canonical hyphenated R2 metadata keys. It is deliberately not generated
 * from the object being read: without an explicit binding, a draft or legacy object is present but
 * unavailable. This is an operational approval input, not a substitute for a signed pointer.
 */
export const WINDOWS_INSTALLER_APPROVED_TUPLE_ENV =
  "MKT_WINDOWS_INSTALLER_APPROVED_TUPLE_JSON";

export interface WindowsInstallerApprovedTuple {
  sizeBytes: number;
  metadata: WindowsInstallerReleaseMetadata;
}

/** Một khoá cố định trong ngăn phát hành — xem lý lẽ ở đầu file. */
export const WINDOWS_INSTALLER_R2_KEY = WINDOWS_INSTALLER_FILE_NAME;

/** Phiên bản MKT Browser, dạng chuỗi tự do (semver). Máy chủ chỉ hiển thị, không so sánh. */
export { WINDOWS_INSTALLER_METADATA_KEYS } from "./windows-installer-release-metadata";
export const WINDOWS_INSTALLER_VERSION_METADATA_KEY = "browser-version";

/**
 * Bản cầu nối mà gói cài này **mang sẵn trong ruột**. Số nguyên, so sánh được.
 *
 * ## Vì sao phải cất, khi số hiệu trình duyệt đã có sẵn
 *
 * Hai con số trả lời hai câu khác nhau, và ghép chúng làm một là đúng cái đã đẻ ra lỗi tệ nhất
 * của đợt pilot: MKT Browser 0.3.1 mang cầu nối bản 12 trong khi sàn đã lên 13, nên máy vừa cài
 * xong là bị từ chối. Không chỗ nào trong hệ thống biết được điều đó, vì không chỗ nào cất con
 * số này.
 *
 * Có nó rồi thì trang chuẩn bị nói được **đúng** việc phải làm: bản trong ruột cũ hơn thì bảo tải
 * thêm gói cầu nối, bằng hoặc mới hơn thì im — thay vì bắt mọi người làm một bước thừa mãi mãi
 * chỉ vì trang không biết.
 *
 * `null` = gói phát hành trước khi có khoá này, hoặc phát hành từ đĩa. Đọc `null` thành "không
 * biết" và giữ lời dặn thận trọng, đừng đọc thành "khớp rồi".
 */
export const WINDOWS_INSTALLER_RELAY_VERSION_METADATA_KEY = "bundled-relay-version";

/** Đọc số bản cầu nối trong metadata. Rác hay thiếu đều thành `null`, không bao giờ thành số bịa. */
export function parseBundledRelayVersion(raw: string | undefined): number | null {
  if (raw === undefined) return null;
  const parsed = Number(raw);
  return Number.isSafeInteger(parsed) && parsed > 0 ? parsed : null;
}

export interface WindowsInstallerRelease {
  available: boolean;
  source?: "r2" | "disk";
  sizeBytes?: number;
  /** Mốc phát hành. Trên đĩa là mốc sửa file; trên R2 là mốc ghi object. */
  publishedAt?: Date;
  version: string | null;
  /** Bản cầu nối nằm sẵn trong gói cài. `null` là **chưa biết**, không phải "khớp". */
  bundledRelayVersion: number | null;
  checksum: string | null;
  bundledRelaySha256: string | null;
  payloadManifestSha256: string | null;
  payloadFileCount: number | null;
  candidateId: string | null;
  browserSourceSha: string | null;
  browserSourceTree: string | null;
  engineKind: string | null;
  engineChannel: string | null;
  engineVersion: string | null;
  engineSha256: string | null;
  signingStatus: WindowsInstallerReleaseMetadata["signingStatus"];
  signingExceptionExpiresAt: string | null;
  /** Bytes can exist without a complete tuple; such a release is never served by the route. */
  metadataComplete: boolean;
  metadataMissing: string[];
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
  if (!info) {
    const metadata = emptyWindowsInstallerReleaseMetadata();
    return { available: false, expectedPath, ...metadataToReleaseFields(metadata) };
  }

  const nowMs = Date.now();
  const metadata = parseWindowsInstallerReleaseMetadata(info.metadata, { now: nowMs });
  const staleFields = staleReleaseFields(metadata, info.sizeBytes, nowMs);

  return {
    available: true,
    source: "r2",
    sizeBytes: info.sizeBytes,
    publishedAt: info.lastModified,
    ...metadataToReleaseFields(metadata, staleFields),
    expectedPath,
  };
}

function readFromDisk(): WindowsInstallerRelease {
  const file = readWindowsInstallerFile();
  const metadata = emptyWindowsInstallerReleaseMetadata();
  if (!file.available) {
    return { available: false, expectedPath: file.path, ...metadataToReleaseFields(metadata) };
  }

  const stat = statSync(file.path);
  return {
    available: true,
    source: "disk",
    sizeBytes: stat.size,
    publishedAt: stat.mtime,
    ...metadataToReleaseFields(metadata),
    expectedPath: file.path,
  };
}

function metadataToReleaseFields(
  metadata: WindowsInstallerReleaseMetadata,
  staleFields: string[] = [],
): Pick<
  WindowsInstallerRelease,
  | "version"
  | "bundledRelayVersion"
  | "checksum"
  | "bundledRelaySha256"
  | "payloadManifestSha256"
  | "payloadFileCount"
  | "candidateId"
  | "browserSourceSha"
  | "browserSourceTree"
  | "engineKind"
  | "engineChannel"
  | "engineVersion"
  | "engineSha256"
  | "signingStatus"
  | "signingExceptionExpiresAt"
  | "metadataComplete"
  | "metadataMissing"
> {
  return {
    version: metadata.browserVersion,
    bundledRelayVersion: metadata.bundledRelayVersion,
    checksum: metadata.installerSha256,
    bundledRelaySha256: metadata.bundledRelaySha256,
    payloadManifestSha256: metadata.payloadManifestSha256,
    payloadFileCount: metadata.payloadFileCount,
    candidateId: metadata.candidateId,
    browserSourceSha: metadata.browserSourceSha,
    browserSourceTree: metadata.browserSourceTree,
    engineKind: metadata.engineKind,
    engineChannel: metadata.engineChannel,
    engineVersion: metadata.engineVersion,
    engineSha256: metadata.engineSha256,
    signingStatus: metadata.signingStatus,
    signingExceptionExpiresAt: metadata.signingExceptionExpiresAt,
    metadataComplete: metadata.metadataComplete && staleFields.length === 0,
    metadataMissing: [...metadata.metadataMissing, ...staleFields],
  };
}

const RELEASE_TUPLE_METADATA_FIELDS = [
  "candidateId",
  "browserVersion",
  "installerSha256",
  "bundledRelayVersion",
  "bundledRelaySha256",
  "payloadManifestSha256",
  "payloadFileCount",
  "browserSourceSha",
  "browserSourceTree",
  "engineKind",
  "engineChannel",
  "engineVersion",
  "engineSha256",
  "signingStatus",
  "signingExceptionExpiresAt",
] as const satisfies readonly (keyof WindowsInstallerReleaseMetadata)[];

function isPositiveByteCount(value: unknown): value is number {
  return Number.isSafeInteger(value) && Number(value) > 0;
}

function signingExceptionIsCurrent(
  release: WindowsInstallerRelease,
  now: Date | number = Date.now(),
): boolean {
  if (release.signingStatus !== "unsigned-internal-exception") return true;
  const expiresAt = release.signingExceptionExpiresAt;
  const timestamp = typeof expiresAt === "string" ? Date.parse(expiresAt) : Number.NaN;
  return Number.isFinite(timestamp) && timestamp > nowMilliseconds(now);
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function stringRecord(value: unknown): Record<string, string> | null {
  if (!isRecord(value)) return null;
  const entries = Object.entries(value);
  if (entries.some(([, item]) => typeof item !== "string")) return null;
  return Object.fromEntries(entries) as Record<string, string>;
}

function nowMilliseconds(value: Date | number = Date.now()): number {
  const milliseconds = value instanceof Date ? value.getTime() : value;
  return Number.isFinite(milliseconds) ? milliseconds : Date.now();
}

/**
 * Read the deployment-owned approval tuple without exposing the raw environment value. Invalid or
 * missing configuration is represented as a safe marker so the setup UI can explain why a present
 * object remains blocked.
 */
export function readWindowsInstallerApprovedTuple(
  env: NodeJS.ProcessEnv = process.env,
  now: Date | number = Date.now(),
): { tuple: WindowsInstallerApprovedTuple | null; issue: string | null } {
  const raw = env[WINDOWS_INSTALLER_APPROVED_TUPLE_ENV]?.trim();
  if (!raw) return { tuple: null, issue: "missing-approved-release-tuple" };

  let decoded: unknown;
  try {
    decoded = JSON.parse(raw);
  } catch {
    return { tuple: null, issue: "invalid-approved-release-tuple" };
  }
  if (!isRecord(decoded)) return { tuple: null, issue: "invalid-approved-release-tuple" };

  const sizeBytes = decoded.sizeBytes;
  const metadata = stringRecord(decoded.metadata);
  if (!isPositiveByteCount(sizeBytes) || !metadata) {
    return { tuple: null, issue: "invalid-approved-release-tuple" };
  }

  const parsed = parseWindowsInstallerReleaseMetadata(metadata, {
    now: nowMilliseconds(now),
  });
  if (!parsed.metadataComplete) {
    return { tuple: null, issue: "invalid-approved-release-tuple" };
  }
  return { tuple: { sizeBytes, metadata: parsed }, issue: null };
}

function metadataMatches(
  left: WindowsInstallerReleaseMetadata,
  right: WindowsInstallerReleaseMetadata,
): boolean {
  return RELEASE_TUPLE_METADATA_FIELDS.every((field) => left[field] === right[field]);
}

function metadataMatchesRelease(
  metadata: WindowsInstallerReleaseMetadata,
  release: WindowsInstallerRelease,
): boolean {
  return (
    metadata.candidateId === release.candidateId &&
    metadata.browserVersion === release.version &&
    metadata.installerSha256 === release.checksum &&
    metadata.bundledRelayVersion === release.bundledRelayVersion &&
    metadata.bundledRelaySha256 === release.bundledRelaySha256 &&
    metadata.payloadManifestSha256 === release.payloadManifestSha256 &&
    metadata.payloadFileCount === release.payloadFileCount &&
    metadata.browserSourceSha === release.browserSourceSha &&
    metadata.browserSourceTree === release.browserSourceTree &&
    metadata.engineKind === release.engineKind &&
    metadata.engineChannel === release.engineChannel &&
    metadata.engineVersion === release.engineVersion &&
    metadata.engineSha256 === release.engineSha256 &&
    metadata.signingStatus === release.signingStatus &&
    metadata.signingExceptionExpiresAt === release.signingExceptionExpiresAt
  );
}

function staleReleaseFields(
  metadata: WindowsInstallerReleaseMetadata,
  sizeBytes: unknown,
  now: Date | number = Date.now(),
): string[] {
  const stale: string[] = [];
  if (metadata.browserVersion !== EXPECTED_WINDOWS_INSTALLER_VERSION) {
    stale.push("stale-browser-version");
  }
  if (metadata.candidateId !== EXPECTED_WINDOWS_INSTALLER_CANDIDATE_ID) {
    stale.push("stale-candidate-id");
  }
  if (metadata.bundledRelayVersion !== 16) {
    stale.push("stale-bundled-relay-version");
  }

  if (!isPositiveByteCount(sizeBytes)) stale.push("invalid-installer-size");

  const approval = readWindowsInstallerApprovedTuple(process.env, now);
  if (approval.issue) {
    stale.push(approval.issue);
  } else if (
    approval.tuple &&
    (!isPositiveByteCount(sizeBytes) ||
      approval.tuple.sizeBytes !== sizeBytes ||
      !metadataMatches(metadata, approval.tuple.metadata))
  ) {
    stale.push("unapproved-release-tuple");
  }

  return stale;
}

/** Mở luồng đọc gói cài, từ đúng nguồn mà `readWindowsInstallerRelease` đã chọn. */
export async function openWindowsInstallerStream(
  release: WindowsInstallerRelease,
): Promise<{ stream: ReadableStream<Uint8Array>; sizeBytes: number }> {
  if (!release.available || !release.metadataComplete) {
    throw new Error("The Windows installer has no complete release metadata.");
  }
  if (!signingExceptionIsCurrent(release)) {
    throw new Error("The unsigned Windows installer exception is missing or expired.");
  }
  if (!isPositiveByteCount(release.sizeBytes)) {
    throw new Error("The Windows installer metadata has no positive byte size.");
  }

  if (release.source === "r2") {
    const config = readWindowsInstallerR2Config();
    if (!config) throw new Error("The release bucket is no longer configured.");
    return spoolVerifiedR2Installer(config, release);
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

/**
 * Spool the mutable-key GET before returning a response stream. HEAD metadata is only a snapshot;
 * comparing the complete GET bytes to that snapshot closes the overwrite/cache race without
 * buffering a ~145 MB installer in the web process heap.
 */
async function spoolVerifiedR2Installer(
  config: R2Config,
  release: WindowsInstallerRelease,
): Promise<{ stream: ReadableStream<Uint8Array>; sizeBytes: number }> {
  const temporaryDirectory = await mkdtemp(path.join(os.tmpdir(), "mkt-installer-r2-"));
  const temporaryFile = path.join(temporaryDirectory, WINDOWS_INSTALLER_FILE_NAME);
  try {
    const remote = await getObject({ config, key: WINDOWS_INSTALLER_R2_KEY });
    const remoteNow = Date.now();
    const remoteMetadata = parseWindowsInstallerReleaseMetadata(remote.info.metadata, {
      now: remoteNow,
    });
    if (
      !isPositiveByteCount(remote.info.sizeBytes) ||
      !remoteMetadata.metadataComplete ||
      remote.info.sizeBytes !== release.sizeBytes ||
      !metadataMatchesRelease(remoteMetadata, release)
    ) {
      throw new Error("The installer tuple changed between metadata inspection and byte retrieval.");
    }

    const hash = createHash("sha256");
    let byteCount = 0;
    const digesting = new Transform({
      transform(chunk: Buffer, _encoding, callback) {
        byteCount += chunk.length;
        hash.update(chunk);
        callback(null, chunk);
      },
    });
    await pipeline(
      Readable.fromWeb(remote.body as unknown as NodeReadableStream),
      digesting,
      createWriteStream(temporaryFile, { flags: "wx" }),
    );
    const actualChecksum = hash.digest("hex");
    if (byteCount !== release.sizeBytes || actualChecksum !== release.checksum) {
      throw new Error("The installer bytes do not match the release metadata.");
    }

    const opened = createReadStream(temporaryFile);
    let cleaned = false;
    const cleanup = (): void => {
      if (cleaned) return;
      cleaned = true;
      void rm(temporaryDirectory, { recursive: true, force: true });
    };
    opened.once("close", cleanup);
    opened.once("error", cleanup);
    return {
      stream: Readable.toWeb(opened) as ReadableStream<Uint8Array>,
      sizeBytes: byteCount,
    };
  } catch (error) {
    await rm(temporaryDirectory, { recursive: true, force: true }).catch(() => undefined);
    throw new Error(
      `The Windows installer could not be verified before download: ${
        error instanceof Error ? error.message : String(error)
      }`,
    );
  }
}
