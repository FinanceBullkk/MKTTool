/**
 * Bản `.exe` cầu nối mà máy chủ này đang phát hành: nó nằm đâu, có thật không, nặng bao nhiêu.
 *
 * ## Vì sao đọc từ đĩa chứ không nhúng vào mã nguồn
 *
 * File nặng 87 MB và **dựng lại được** từ mã nguồn bằng `npm run relay:build`. Commit nó vào git
 * là cộng 87 MB vào lịch sử cho **mỗi** lần phát hành, vĩnh viễn, để đổi lấy một thứ mà một lệnh
 * build tái tạo được.
 *
 * ## Trên Railway (GĐ5) thư mục này chưa có gì
 *
 * `.exe` dựng trên một máy Windows; ảnh Docker của web app dựng trên Linux và không chứa nó.
 * Nên trạng thái *"chưa có file"* là trạng thái **bình thường**, không phải lỗi — và trang tải
 * phải nói ra điều đó bằng câu người đọc làm được gì, chứ không phải một trang 404.
 *
 * Biến `RELAY_RELEASE_DIR` để trỏ sang chỗ khác (ví dụ một volume gắn vào container, nơi quản
 * trị viên tải `.exe` lên sau mỗi lần phát hành).
 */
import { createHash } from "node:crypto";
import { createReadStream, statSync } from "node:fs";
import path from "node:path";
import { RELAY_VERSION } from "./relay-endpoints";

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
export function relayDownloadFileName(): string {
  return `MKTTool-Relay-v${RELAY_VERSION}.zip`;
}

/** Thư mục chứa bản phát hành. Mặc định là chỗ `npm run relay:build` ghi ra. */
export function relayReleaseDir(): string {
  return process.env.RELAY_RELEASE_DIR?.trim() || path.join(process.cwd(), "relay", "dist");
}

export function relayArchivePath(): string {
  return path.join(relayReleaseDir(), RELAY_ARCHIVE_NAME);
}

export type RelayRelease =
  | {
      available: true;
      path: string;
      /** Byte. Route dùng làm `content-length` để trình duyệt vẽ được thanh tiến trình. */
      sizeBytes: number;
      /** Lúc file được ghi ra — tức lúc build, thứ gần nhất với "phát hành ngày nào". */
      builtAt: Date;
      version: number;
    }
  | {
      available: false;
      /** Chỗ máy chủ đã tìm, in ra để người sửa biết phải đặt file vào đâu. */
      expectedPath: string;
    };

/**
 * Xem bản phát hành có sẵn sàng không.
 *
 * Đồng bộ có chủ ý: `statSync` một file cục bộ là chuyện của micro giây, và đổi lấy việc trang
 * server component gọi thẳng được mà không kéo theo một lớp `await` nào.
 */
export function readRelayRelease(): RelayRelease {
  const filePath = relayArchivePath();

  try {
    const stats = statSync(filePath);
    // Một thư mục trùng tên cũng qua được `statSync`, và nhánh sau sẽ cố stream nó.
    if (!stats.isFile()) return { available: false, expectedPath: filePath };

    return {
      available: true,
      path: filePath,
      sizeBytes: stats.size,
      builtAt: stats.mtime,
      version: RELAY_VERSION,
    };
  } catch {
    return { available: false, expectedPath: filePath };
  }
}

/**
 * Bộ nhớ đệm mã băm, đúng **một ô**.
 *
 * Máy chủ chỉ phát hành một gói tại một thời điểm, nên giữ lịch sử là phình bộ nhớ theo số lần
 * phát hành để đổi lấy một lượt băm mà không ai đợi. Khóa gồm cả cỡ file lẫn mốc sửa: thay gói
 * mới vào đúng đường dẫn cũ — chính là cách nâng cấp — thì khóa đổi và ô cũ bị đè.
 */
let cachedChecksum: { key: string; digest: string } | null = null;

/**
 * Mã băm SHA-256 của gói tải, dạng hex thường. `null` khi chưa có gói.
 *
 * ## Nó chứng minh được gì, và KHÔNG chứng minh được gì
 *
 * **Được:** file tải về nguyên vẹn. 32 MB qua một đường mạng chập chờn đứt giữa chừng là chuyện
 * có thật, và một file `.zip` cụt thường vẫn giải nén ra được vài file — tức hỏng theo kiểu khó
 * nhận ra nhất. Cũng trả lời được câu *"đồng nghiệp gửi tôi một file qua chat, có đúng bản của
 * team không"*.
 *
 * **Không được:** đây **không phải chữ ký số**. Mã băm nằm cùng máy chủ với file, nên ai chiếm
 * được máy chủ thì đổi được cả hai. Chống được tai nạn và nhầm lẫn, không chống được kẻ đã vào
 * tới trong. Muốn có tính chất kia thì phải mua chứng chỉ ký mã — xem ghi chú ở trang tải.
 *
 * Băm theo dòng chứ không đọc cả file vào bộ nhớ, và bất đồng bộ: một lượt băm 32 MB đồng bộ là
 * khóa vòng lặp sự kiện của cả tiến trình web trong vài trăm mili giây.
 */
export async function relayArchiveChecksum(): Promise<string | null> {
  const release = readRelayRelease();
  if (!release.available) return null;

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
