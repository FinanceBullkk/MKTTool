/**
 * Bản cầu nối mà máy chủ này đang phát hành: nó nằm đâu, có thật không, nặng bao nhiêu.
 *
 * ## Hai nguồn, và máy chủ tự biết mình đang dùng nguồn nào
 *
 * | Nguồn | Khi nào | Dùng ở đâu |
 * |---|---|---|
 * | **R2** | Có khai `RELAY_RELEASE_R2_*` | Railway — xem [relay-release-r2.ts](relay-release-r2.ts) |
 * | **Đĩa** | Không khai gì | Máy dev, ngay sau `npm run relay:build` |
 *
 * Đĩa là nhánh mặc định có chủ ý: người vừa build xong muốn mở thử trang tải mà không phải dựng
 * một ngăn R2 trước.
 *
 * ## Vì sao gói không nằm trong git
 *
 * File nặng 87 MB và **dựng lại được** từ mã nguồn bằng `npm run relay:build`. Commit nó vào git
 * là cộng 87 MB vào lịch sử cho **mỗi** lần phát hành, vĩnh viễn, để đổi lấy một thứ mà một lệnh
 * build tái tạo được.
 *
 * ## "Chưa có gói" là một nhánh dữ liệu, không phải một ngoại lệ
 *
 * Cả hai nguồn đều có trạng thái *chưa phát hành bản nào*, và nó **bình thường** chứ không phải
 * lỗi. Trang tải cần in được chỗ đã tìm để người sửa biết đặt file vào đâu — mà một exception ném
 * ra thì chỉ còn cách hiện "lỗi máy chủ".
 */
import { createHash } from "node:crypto";
import { createReadStream, statSync } from "node:fs";
import path from "node:path";
import { Readable } from "node:stream";
import { type R2Config } from "../r2/r2-config";
import { RELAY_VERSION } from "./relay-endpoints";
import { readRelayArtifactMetadata } from "./relay-release-metadata";
import {
  readCachedRelayRelease,
  writeCachedRelayRelease,
} from "./relay-release-r2-metadata-cache";
import {
  checksumOf,
  describeR2Location,
  headRelayRelease,
  openRelayReleaseStream,
  readRelayReleaseR2Config,
  versionOf,
} from "./relay-release-r2";

/**
 * Tên gói trên đĩa, **cố định** — đường dẫn không đổi theo phiên bản.
 *
 * Thứ tải về là `.zip` ba file (`.exe`, `setup.bat`, `install-relay.ps1`) chứ không phải `.exe`
 * trần: `setup.bat` tìm hai file kia **cạnh chính nó**, nên đưa người ta mỗi `.exe` là đưa một
 * bộ cài chắc chắn hỏng.
 */
export const RELAY_ARCHIVE_NAME = "MKTTool-Relay.zip";

/**
 * Tên file lúc **tải xuống** — có kèm số phiên bản.
 *
 * Tách khỏi tên trên đĩa có chủ ý: đường dẫn cố định thì route và bộ build không phải hẹn nhau
 * theo phiên bản, còn thư mục Downloads của người dùng thì cần phân biệt được ba gói nằm cạnh
 * nhau. Một chồng `MKTTool-Relay.zip`, `(1)`, `(2)` là cách chắc chắn để cài lại đúng bản cũ.
 */
export function relayDownloadFileName(version: number): string {
  return `MKTTool-Relay-v${version}.zip`;
}

/** Thư mục chứa bản phát hành trên đĩa. Mặc định là chỗ `npm run relay:build` ghi ra. */
export function relayReleaseDir(): string {
  return process.env.RELAY_RELEASE_DIR?.trim() || path.join(process.cwd(), "relay", "dist");
}

export function relayArchivePath(): string {
  return path.join(relayReleaseDir(), RELAY_ARCHIVE_NAME);
}

export type RelayReleaseSource = "disk" | "r2";

export type RelayRelease =
  | {
      available: true;
      source: RelayReleaseSource;
      /** Byte. Route dùng làm `content-length` để trình duyệt vẽ được thanh tiến trình. */
      sizeBytes: number;
      /** Lúc file được ghi ra — tức lúc phát hành. */
      builtAt: Date;
      version: number;
      /**
       * Mã băm nếu nguồn đã mang sẵn nó (R2 đính vào metadata lúc phát hành). `null` với nguồn
       * đĩa — ở đó `relayArchiveChecksum` tự băm lấy.
       */
      checksum: string | null;
      /** Đường dẫn trên đĩa. Vắng mặt với nguồn R2 — ở đó không có file cục bộ nào. */
      path?: string;
    }
  | {
      available: false;
      /** Chỗ máy chủ đã tìm, in ra để người sửa biết phải đặt file vào đâu. */
      expectedPath: string;
    };

/**
 * Xem bản phát hành có sẵn sàng không.
 *
 * Bất đồng bộ vì nhánh R2 phải hỏi qua mạng — một request `HEAD`, không kéo nội dung về.
 */
export async function readRelayRelease(
  version?: number,
  /** Tín hiệu hủy. Bên gọi bỏ cuộc thì request R2 dừng theo, không để lại request mồ côi. */
  signal?: AbortSignal,
): Promise<RelayRelease> {
  const r2 = readRelayReleaseR2Config();
  return r2 ? readFromR2(r2, version ?? RELAY_VERSION, signal) : readRelayReleaseFromDisk(version);
}

async function readFromR2(
  config: R2Config,
  requestedVersion: number,
  signal?: AbortSignal,
): Promise<RelayRelease> {
  // Metadata của một version là bất biến, nên câu trả lời còn hạn dùng được luôn. Xem
  // [relay-release-r2-metadata-cache.ts](relay-release-r2-metadata-cache.ts) để biết vì sao ngăn
  // nhớ này tồn tại và vì sao nó vẫn có hạn.
  const cached = readCachedRelayRelease(config, requestedVersion);
  if (cached) return cached;

  // Lỗi mạng và lỗi cấu hình KHÔNG được biến thành "chưa có gói": hai chuyện đó dẫn tới hai việc
  // phải làm khác hẳn nhau, và câu "chưa phát hành bản nào" sẽ cử người quản trị đi build lại một
  // gói vốn đã nằm sẵn trên R2. Ném lên để trang hiện đúng lỗi.
  const info = await headRelayRelease(config, requestedVersion, undefined, signal);
  if (!info) return { available: false, expectedPath: describeR2Location(config, requestedVersion) };
  const artifactVersion = versionOf(info);
  if (artifactVersion === null) {
    throw new Error(`Relay release v${requestedVersion} has no valid artifact version metadata.`);
  }
  if (artifactVersion !== requestedVersion) {
    throw new Error(
      `Relay release object v${requestedVersion} reports artifact version ${artifactVersion}.`,
    );
  }

  const release: RelayRelease = {
    available: true,
    source: "r2",
    sizeBytes: info.sizeBytes,
    builtAt: info.lastModified,
    version: artifactVersion,
    checksum: checksumOf(info),
  };
  writeCachedRelayRelease(config, requestedVersion, release);
  return release;
}

/**
 * Đọc thẳng từ đĩa, bỏ qua ngăn R2.
 *
 * Bộ phát hành (`npm run relay:publish`) cần đúng đường này: thứ nó sắp đẩy đi là gói **vừa
 * build**, không phải gói đang nằm trên R2 — mà máy build thì có khai ngăn R2 (nó cần token ghi),
 * nên `readRelayRelease` ở đó sẽ đi đọc chính cái nó sắp ghi đè.
 */
export function readRelayReleaseFromDisk(requestedVersion?: number): RelayRelease {
  const filePath = relayArchivePath();

  try {
    const stats = statSync(filePath);
    // Một thư mục trùng tên cũng qua được `statSync`, và nhánh sau sẽ cố stream nó.
    if (!stats.isFile()) return { available: false, expectedPath: filePath };

    const metadata = readRelayArtifactMetadata(relayReleaseDir());
    if (!metadata) throw new Error(`Relay artifact metadata is missing or invalid beside ${filePath}.`);
    if (metadata.sizeBytes !== stats.size) {
      throw new Error(`Relay artifact metadata does not match the archive size beside ${filePath}.`);
    }
    if (requestedVersion !== undefined && metadata.version !== requestedVersion) {
      return { available: false, expectedPath: `${filePath} (version ${requestedVersion})` };
    }

    return {
      available: true,
      source: "disk",
      sizeBytes: stats.size,
      builtAt: stats.mtime,
      version: metadata.version,
      checksum: metadata.sha256,
      path: filePath,
    };
  } catch (error) {
    if (error instanceof Error && error.message.startsWith("Relay artifact metadata")) throw error;
    return { available: false, expectedPath: filePath };
  }
}

/**
 * Mở luồng đọc gói để stream về trình duyệt.
 *
 * Luồng chứ không phải buffer: 32 MB trong heap cho **mỗi** lượt tải cùng lúc là cách để tiến
 * trình web chết vì hết bộ nhớ trên gói Railway nhỏ, và triệu chứng sẽ là "web tự khởi động lại"
 * chứ không phải "tải hỏng".
 */
export async function openRelayArchive(
  release: Extract<RelayRelease, { available: true }>,
  startByte = 0,
): Promise<ReadableStream<Uint8Array>> {
  if (release.source === "disk" && release.path) {
    return Readable.toWeb(
      createReadStream(release.path, { start: startByte }),
    ) as ReadableStream<Uint8Array>;
  }

  const config = readRelayReleaseR2Config();
  if (!config) {
    throw new Error(
      "The R2 bucket for Relay packages is no longer configured. Restore the release configuration before downloading.",
    );
  }
  return openRelayReleaseStream(config, release.version, startByte);
}

/**
 * Bộ nhớ đệm mã băm của nguồn đĩa, đúng **một ô**.
 *
 * Máy chủ chỉ phát hành một gói tại một thời điểm, nên giữ lịch sử là phình bộ nhớ theo số lần
 * phát hành để đổi lấy một lượt băm mà không ai đợi. Khóa gồm cả cỡ file lẫn mốc sửa: thay gói
 * mới vào đúng đường dẫn cũ — chính là cách nâng cấp — thì khóa đổi và ô cũ bị đè.
 */
let cachedChecksum: { key: string; digest: string } | null = null;

/**
 * Mã băm SHA-256 của gói tải, dạng hex thường. `null` khi chưa có gói.
 *
 * Nguồn R2 mang sẵn mã băm trong metadata (băm một lần lúc phát hành). Nguồn đĩa thì băm tại chỗ,
 * theo dòng chứ không đọc cả file vào bộ nhớ — một lượt băm 32 MB đồng bộ là khóa vòng lặp sự kiện
 * của cả tiến trình web trong vài trăm mili giây.
 *
 * Truyền sẵn `release` để khỏi hỏi nguồn hai lần; bỏ trống thì tự đọc (bộ build dùng đường này).
 *
 * ## Nó chứng minh được gì, và KHÔNG chứng minh được gì
 *
 * **Được:** file tải về nguyên vẹn. 32 MB qua một đường mạng chập chờn đứt giữa chừng là chuyện
 * có thật, và một file `.zip` cụt thường vẫn giải nén ra được vài file — tức hỏng theo kiểu khó
 * nhận ra nhất. Cũng trả lời được câu *"đồng nghiệp gửi tôi một file qua chat, có đúng bản của
 * team không"*.
 *
 * **Không được:** đây **không phải chữ ký số**. Mã băm đi cùng đường với file, nên ai chiếm được
 * chỗ chứa thì đổi được cả hai. Chống được tai nạn và nhầm lẫn, không chống được kẻ đã vào tới
 * trong. Muốn có tính chất kia thì phải mua chứng chỉ ký mã — xem ghi chú ở trang tải.
 */
export async function relayArchiveChecksum(known?: RelayRelease): Promise<string | null> {
  const release = known ?? (await readRelayRelease());
  if (!release.available) return null;
  if (release.source === "r2" && release.checksum) return release.checksum;
  if (!release.path) return null;

  const key = `${release.path}:${release.sizeBytes}:${release.builtAt.getTime()}`;
  if (cachedChecksum?.key === key) return cachedChecksum.digest;

  const hash = createHash("sha256");
  for await (const chunk of createReadStream(release.path)) {
    hash.update(chunk as Buffer);
  }

  const digest = hash.digest("hex");
  cachedChecksum = { key, digest };
  return digest;
}

/** Dung lượng cho người đọc. */
export function formatFileSize(bytes: number): string {
  return bytes < 1024 * 1024
    ? `${(bytes / 1024).toFixed(1)} KB`
    : `${(bytes / 1024 / 1024).toFixed(1)} MB`;
}
