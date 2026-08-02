/**
 * Mở luồng OAuth: sinh `state`, cất vào cookie, rồi đẩy sang dialog của Facebook.
 *
 * `state` chống CSRF: không có nó thì bất kỳ trang web nào cũng dụ được trình duyệt
 * của bạn MKT gọi vào callback kèm `code` của kẻ khác, và công cụ sẽ ngoan ngoãn
 * nối Fanpage của kẻ đó vào máy mình.
 */
import { randomBytes } from "node:crypto";
import { cookies } from "next/headers";
import { NextResponse } from "next/server";
import { FacebookConfigError } from "@/lib/facebook/facebook-app-config";
import { OAUTH_STATE_COOKIE, buildAuthorizeUrl } from "@/lib/facebook/facebook-oauth-flow";
import { describeRedirectHostMismatch } from "@/lib/facebook/facebook-redirect-host-guard";

export const runtime = "nodejs";

/**
 * Quay về /facebook kèm lời báo lỗi.
 *
 * Dựng địa chỉ từ header `Host` chứ không từ `request.url`: Next chuẩn hóa `request.url` về
 * host của dev server, nên dùng nó sẽ ném người dùng sang một địa chỉ khác địa chỉ họ đang
 * mở — đúng thứ nhầm lẫn mà lớp chặn bên dưới sinh ra để dập.
 */
function back(request: Request, message: string): NextResponse {
  const host = request.headers.get("host");
  const base = host ? `http://${host}` : request.url;
  const url = new URL("/facebook", base);
  url.searchParams.set("error", message);
  return NextResponse.redirect(url);
}

export async function GET(request: Request) {
  try {
    // Dừng ngay nếu địa chỉ đang mở app khác địa chỉ Facebook sẽ trả về — nếu đi tiếp,
    // cookie `state` đặt ở đây sẽ không tới được callback. Xem facebook-redirect-host-guard.ts.
    const mismatch = describeRedirectHostMismatch(request.headers.get("host"));
    if (mismatch) return back(request, mismatch);

    const state = randomBytes(24).toString("base64url");
    const authorizeUrl = buildAuthorizeUrl(state);

    const cookieStore = await cookies();
    cookieStore.set(OAUTH_STATE_COOKIE, state, {
      httpOnly: true,
      sameSite: "lax", // "strict" thì cookie không được gửi kèm lúc Facebook chuyển hướng về
      path: "/",
      maxAge: 600,
    });

    return NextResponse.redirect(authorizeUrl);
  } catch (error) {
    const message =
      error instanceof FacebookConfigError ? error.message : "Không mở được luồng OAuth.";
    return back(request, message);
  }
}
