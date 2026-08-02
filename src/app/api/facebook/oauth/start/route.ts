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

export const runtime = "nodejs";

export async function GET(request: Request) {
  try {
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
    return NextResponse.redirect(new URL(`/facebook?error=${encodeURIComponent(message)}`, request.url));
  }
}
