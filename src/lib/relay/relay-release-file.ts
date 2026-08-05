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
import { statSync } from "node:fs";
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

/** Dung lượng cho người đọc. */
export function formatFileSize(bytes: number): string {
  return bytes < 1024 * 1024
    ? `${(bytes / 1024).toFixed(1)} KB`
    : `${(bytes / 1024 / 1024).toFixed(1)} MB`;
}
