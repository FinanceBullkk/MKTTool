/**
 * Chặn luồng OAuth khi địa chỉ đang mở app khác địa chỉ khai trong `FACEBOOK_REDIRECT_URI`.
 *
 * Vì sao cần: cookie `state` chống CSRF được đặt cho HOST đang mở app. Facebook thì luôn
 * trả người dùng về đúng chuỗi `redirect_uri` đã khai. Hai bên lệch host là trình duyệt
 * không gửi cookie kèm theo — `localhost` và `127.0.0.1` là hai host khác nhau với cookie,
 * dù cùng trỏ về một máy.
 *
 * Không có lớp chặn này thì lỗi nổ ở callback với câu "Chuỗi state không khớp", tức là chỉ
 * thẳng vào CSRF trong khi nguyên nhân thật chỉ là gõ nhầm địa chỉ. Thà dừng ngay từ đầu
 * và nói đúng thứ cần sửa.
 *
 * Đối chiếu bằng header `Host` chứ không bằng `request.url` — cùng lý do đã ghi ở
 * `same-origin-guard.ts`: Next chuẩn hóa `request.url` về host của dev server.
 */
import { redirectUri } from "./facebook-app-config";

/**
 * Trả về câu giải thích nếu lệch, `null` nếu khớp.
 *
 * Thiếu header `Host` thì cho qua: không có gì để đối chiếu, và bước kiểm `state` ở callback
 * vẫn đứng nguyên đó. Lớp này để chỉ đúng chỗ sai, không phải để thay lớp bảo mật.
 */
export function describeRedirectHostMismatch(
  requestHost: string | null,
  configuredRedirectUri: string = redirectUri(),
): string | null {
  if (!requestHost) return null;

  let expectedHost: string;
  try {
    expectedHost = new URL(configuredRedirectUri).host;
  } catch {
    return (
      `FACEBOOK_REDIRECT_URI in .env is not a valid URL ("${configuredRedirectUri}"). ` +
      `Use a complete address, for example http://localhost:3000/api/facebook/oauth/callback.`
    );
  }

  if (expectedHost === requestHost) return null;

  return (
    `The app is open at "${requestHost}", but FACEBOOK_REDIRECT_URI uses "${expectedHost}". ` +
    `Facebook will return to "${expectedHost}", which the browser treats as a different host and ` +
    `will not send the CSRF cookie. The connection will then fail with a misleading error. ` +
    `Reopen the app at "http://${expectedHost}" and connect again, or update FACEBOOK_REDIRECT_URI ` +
    `to match and register that exact value in the Meta App.`
  );
}
