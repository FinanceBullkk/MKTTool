/**
 * Đường xác thực dành cho **máy dựng**, chỉ mở đúng một tuyến: tải một bản Relay đã phát hành.
 *
 * ## Vì sao không mượn cookie phiên
 *
 * Trước đây bộ dựng installer dán cookie phiên của một người thật vào biến môi trường. Nó chạy
 * được, và sai theo bốn cách khác nhau:
 *
 * 1. **Cấp quá tay.** Cookie phiên mở cả kho danh tính. Máy dựng cần đúng một việc: tải một file
 *    zip đã phát hành, theo số phiên bản.
 * 2. **Hết hạn.** Phiên có hạn, nên build gãy vào một lúc ngẫu nhiên với lỗi 401 trông hệt như
 *    lỗi deploy — và người đi sửa sẽ đi tìm nhầm chỗ.
 * 3. **Ghi sai sổ.** Nhật ký ghi tên một con người cho việc mà máy làm.
 * 4. **Dễ vỡ.** Gỡ người đó khỏi `ALLOWED_EMAILS` là build chết, dù việc gỡ chẳng liên quan gì.
 *
 * Token riêng thì không dính cái nào: nó không phải ai cả, không hết hạn, và mở đúng một tuyến.
 *
 * ## Nó KHÔNG giữ bí mật nào
 *
 * Gói `.exe` này không chứa bí mật (xem route tải). Lớp gác ở đó chỉ làm hai việc khiêm tốn: không
 * rải sẵn một bản cho người ngoài mang về mổ xẻ, và giữ đúng một đường tải. Token này thay được
 * lớp gác đó cho máy móc mà **không** nới rộng thứ gì phía sau — nó không dựng ra `Actor`, nên
 * không tầng nào ở dưới có thể nhầm nó thành một con người.
 */
import { timingSafeEqual } from "node:crypto";

export const RELEASE_DOWNLOAD_TOKEN_ENV = "RELAY_RELEASE_DOWNLOAD_TOKEN";

/**
 * Độ dài tối thiểu. Ngắn hơn thì **dừng hẳn**, không lặng lẽ chấp nhận.
 *
 * Một token yếu nguy hiểm hơn không có token: không khai gì thì tuyến vẫn đóng sau lớp đăng nhập,
 * còn khai `"test"` thì nó mở cho bất kỳ ai đoán ra — mà không có gì kêu lên.
 */
export const MIN_RELEASE_DOWNLOAD_TOKEN_LENGTH = 32;

/**
 * Đọc token đã khai. `null` khi không khai — lúc đó xác thực bằng token đơn giản là **không có**,
 * và tuyến vẫn phục vụ người đã đăng nhập như cũ. Máy dev không phải cấu hình gì thêm.
 */
export function readReleaseDownloadToken(): string | null {
  const value = process.env[RELEASE_DOWNLOAD_TOKEN_ENV]?.trim();
  if (!value) return null;
  if (value.length < MIN_RELEASE_DOWNLOAD_TOKEN_LENGTH) {
    throw new Error(
      `${RELEASE_DOWNLOAD_TOKEN_ENV} must contain at least ${MIN_RELEASE_DOWNLOAD_TOKEN_LENGTH} characters. ` +
        `Generate one with: node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"`,
    );
  }
  return value;
}

/**
 * Header `Authorization` có khớp token đã khai không.
 *
 * So sánh **hằng thời gian**, và kiểm độ dài trước vì `timingSafeEqual` ném lỗi khi hai vế lệch
 * độ dài. Cùng một lối đã dùng ở `packages/mcp-server/src/HttpTransport.ts` bên MKT Browser —
 * chép lối chứ không nghĩ ra lối mới, để hai bên không lệch nhau về sau.
 */
export function releaseDownloadTokenMatches(authorizationHeader: string | null): boolean {
  const token = readReleaseDownloadToken();
  if (!token) return false;

  const expected = Buffer.from(`Bearer ${token}`);
  const got = Buffer.from(authorizationHeader ?? "");
  return got.length === expected.length && timingSafeEqual(got, expected);
}
