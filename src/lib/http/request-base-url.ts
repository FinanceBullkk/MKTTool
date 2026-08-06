/**
 * Dựng địa chỉ gốc của app từ một `Request` — dùng để chuyển hướng người dùng quay về giao diện.
 *
 * ## Vì sao không dùng thẳng `request.url`
 *
 * **Next chuẩn hóa `request.url` về host của chính máy chủ, luôn là `localhost:3000`**, bất kể
 * trình duyệt đang mở bằng địa chỉ nào. Đo được 02/08/2026 dưới máy dev (xem `same-origin-guard.ts`)
 * và vấp lại trên máy chủ thật 06/08/2026 ở luồng OAuth Facebook: kết nối chạy đúng, lưu xong,
 * rồi ném người dùng sang `https://localhost:3000/facebook?connected=…` — giao thức lấy từ
 * `x-forwarded-proto` của Railway ghép với host nội bộ trong container. Trình duyệt gặp `https`
 * trỏ vào máy mình, nơi không có TLS, nên báo `ERR_SSL_PROTOCOL_ERROR`.
 *
 * Kiểu hỏng đó tệ hơn nó trông: **việc đã làm xong và đã lưu**, chỉ màn hình cuối là đỏ. Người
 * dùng đọc màn hình đỏ sẽ bấm lại từ đầu — tức làm lần thứ hai một việc đã thành công.
 *
 * Header `Host` mới là thứ trình duyệt thật sự gửi, và cũng là thứ Next đối chiếu cho server action.
 */

/**
 * Giao thức người dùng thật sự đang dùng.
 *
 * Không đọc được từ `request.url`: sau lớp proxy của Railway, request tới app bằng HTTP nội bộ dù
 * người dùng gõ HTTPS. `x-forwarded-proto` là chỗ lớp proxy ghi lại giao thức gốc.
 *
 * Không có header đó thì đoán theo môi trường, và đoán về phía **an toàn hơn**: production mặc
 * định `https`. Ghép cứng `http://` nghĩa là mọi lượt chuyển hướng đẩy người dùng sang kênh không
 * mã hóa — kèm theo cookie phiên của họ.
 */
export function requestProtocol(request: Request): string {
  const forwarded = request.headers.get("x-forwarded-proto");
  if (forwarded) return forwarded.split(",")[0].trim();
  return process.env.NODE_ENV === "production" ? "https" : "http";
}

/**
 * Địa chỉ gốc của app theo đúng thứ trình duyệt đang mở, ví dụ `https://mkttool.example.com`.
 *
 * Thiếu header `Host` thì lùi về `request.url` — không lý tưởng, nhưng còn hơn ném ra chuỗi rỗng
 * rồi để `new URL()` nổ ở một chỗ không liên quan. Trình duyệt luôn gửi `Host`, nên nhánh này chỉ
 * chạm tới khi request không đến từ trình duyệt.
 */
export function appBaseUrl(request: Request): string {
  const host = request.headers.get("host");
  return host ? `${requestProtocol(request)}://${host}` : request.url;
}

/**
 * Dựng một địa chỉ trong app, kèm tham số truy vấn.
 *
 * Gom vào đây thay vì để mỗi route tự `new URL(...)` rồi tự `searchParams.set(...)`: hai route
 * của cùng luồng OAuth trước đây làm hai kiểu, và cái làm sai là cái không ai đọc lại.
 */
export function appUrl(
  request: Request,
  path: string,
  params: Record<string, string> = {},
): URL {
  const url = new URL(path, appBaseUrl(request));
  for (const [key, value] of Object.entries(params)) url.searchParams.set(key, value);
  return url;
}
