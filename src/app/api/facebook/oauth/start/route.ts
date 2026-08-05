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
import { guardedRoute } from "@/lib/auth/guarded-route";
import { FacebookConfigError } from "@/lib/facebook/facebook-app-config";
import { OAUTH_STATE_COOKIE, buildAuthorizeUrl } from "@/lib/facebook/facebook-oauth-flow";
import { describeRedirectHostMismatch } from "@/lib/facebook/facebook-redirect-host-guard";

export const runtime = "nodejs";

/**
 * Giao thức mà người dùng thật sự đang dùng để mở app.
 *
 * Không đọc được từ `request.url`: sau lớp proxy của Railway (GĐ5), request tới app bằng HTTP
 * nội bộ dù người dùng gõ HTTPS. `x-forwarded-proto` là chỗ lớp proxy ghi lại giao thức gốc.
 *
 * Không có header đó thì đoán theo môi trường, và đoán về phía **an toàn hơn**: production mặc
 * định `https`. Ghép cứng `http://` như bản trước nghĩa là mọi lượt báo lỗi của luồng này đẩy
 * người dùng sang kênh không mã hóa — kèm theo cookie `state` bên dưới.
 */
function requestProtocol(request: Request): string {
  const forwarded = request.headers.get("x-forwarded-proto");
  if (forwarded) return forwarded.split(",")[0].trim();
  return process.env.NODE_ENV === "production" ? "https" : "http";
}

/**
 * Quay về /facebook kèm lời báo lỗi.
 *
 * Dựng địa chỉ từ header `Host` chứ không từ `request.url`: Next chuẩn hóa `request.url` về
 * host của dev server, nên dùng nó sẽ ném người dùng sang một địa chỉ khác địa chỉ họ đang
 * mở — đúng thứ nhầm lẫn mà lớp chặn bên dưới sinh ra để dập.
 */
function back(request: Request, message: string): NextResponse {
  const host = request.headers.get("host");
  const base = host ? `${requestProtocol(request)}://${host}` : request.url;
  const url = new URL("/facebook", base);
  url.searchParams.set("error", message);
  return NextResponse.redirect(url);
}

export const GET = guardedRoute(async function GET(_actor, request: Request) {
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
      /**
       * Cùng quy tắc với cookie phiên của Better Auth (`advanced.defaultCookieAttributes`).
       * Cookie này đặt bằng tay nên không thừa hưởng gì từ đó — và nó là token chống CSRF của
       * đường nối Fanpage, tức đúng loại không được đi qua kênh không mã hóa.
       *
       * Theo `NODE_ENV` chứ không theo giao thức thật của request: `x-forwarded-proto` do lớp
       * proxy ghi và giả được, mà giả một lần thành `https` trên máy dev là cookie không bao giờ
       * quay lại được nữa — luồng hỏng ở bước "state không khớp", không nhìn ra lý do.
       */
      secure: process.env.NODE_ENV === "production",
      path: "/",
      maxAge: 600,
    });

    return NextResponse.redirect(authorizeUrl);
  } catch (error) {
    const message =
      error instanceof FacebookConfigError ? error.message : "Không mở được luồng OAuth.";
    return back(request, message);
  }
});
