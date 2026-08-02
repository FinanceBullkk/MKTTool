/**
 * Chặn lời gọi POST đến từ trang web khác.
 *
 * Next.js tự đối chiếu Origin/Host cho *server action*, nhưng KHÔNG làm điều đó cho
 * route handler trong `app/api`. Một `fetch(..., { method: "POST", mode: "no-cors" })`
 * không kèm header lạ là "simple request": trình duyệt gửi thẳng, không hỏi preflight.
 * Trình duyệt chặn phía ĐỌC phản hồi, nhưng tác dụng phụ ở server thì đã xảy ra rồi.
 *
 * Công cụ này không có màn hình đăng nhập, nên một trang web bất kỳ mà bạn MKT vô tình
 * mở có thể bắn lệnh mở profile antidetect vào localhost. Sáu dòng dưới đây bịt đường đó.
 */

/**
 * Đối chiếu `Origin` với `Host`. Thiếu `Origin` là từ chối: trình duyệt LUÔN gửi header này
 * cho request POST, kể cả cùng nguồn, nên thiếu nghĩa là lời gọi không đến từ trình duyệt.
 *
 * Cố tình KHÔNG dùng `new URL(request.url).host`: Next chuẩn hóa `request.url` về host của
 * dev server (luôn `localhost:3000`) bất kể trình duyệt đang mở bằng địa chỉ nào. Đo được
 * 02/08/2026 — mở app bằng `http://127.0.0.1:3000`, đúng địa chỉ README hướng dẫn, thì
 * `request.url` vẫn báo `localhost:3000` và guard chặn nhầm chính giao diện của mình.
 * Header `Host` mới là thứ trình duyệt thật sự gửi, và cũng là thứ Next đối chiếu cho
 * server action.
 */
export function isSameOrigin(request: Request): boolean {
  const origin = request.headers.get("origin");
  const host = request.headers.get("host");
  if (!origin || !host) return false;

  try {
    return new URL(origin).host === host;
  } catch {
    return false;
  }
}

export const CROSS_ORIGIN_MESSAGE =
  "Lời gọi đến từ trang khác nên bị từ chối. Thao tác này chỉ chạy được từ chính giao diện MKTTool.";
