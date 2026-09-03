/**
 * Facebook gọi về đây sau khi người dùng bấm đồng ý.
 *
 * Chuỗi việc: đối chiếu `state` → đổi `code` lấy token 2 giờ → đổi tiếp lấy token 60 ngày
 * → hỏi danh sách Page → lưu (đã mã hóa) → quay về /facebook.
 *
 * Không bước nào được bỏ qua bước đổi token dài hạn: Page token thừa hưởng tuổi thọ của
 * user token, dừng ở token 2 giờ thì trưa mai công cụ ngừng đăng được mà không rõ vì sao.
 */
import { cookies } from "next/headers";
import { NextResponse } from "next/server";
import { guardedRoute } from "@/lib/auth/guarded-route";
import { FacebookConfigError } from "@/lib/facebook/facebook-app-config";
import { toUserMessage } from "@/lib/facebook/facebook-graph-client";
import { appUrl } from "@/lib/http/request-base-url";
import {
  OAUTH_STATE_COOKIE,
  exchangeCodeForToken,
  exchangeForLongLivedToken,
  fetchIdentity,
  fetchManagedPages,
} from "@/lib/facebook/facebook-oauth-flow";
import { saveConnectionWithPages } from "@/lib/facebook/facebook-token-manager";

export const runtime = "nodejs";

/**
 * Quay về /facebook kèm kết quả.
 *
 * Dựng địa chỉ từ header `Host` chứ không từ `request.url` — xem `request-base-url.ts`. Bản trước
 * dùng `request.url` và ném người dùng sang `https://localhost:3000` sau khi kết nối ĐÃ lưu xong.
 */
function back(request: Request, params: Record<string, string>): NextResponse {
  return NextResponse.redirect(appUrl(request, "/facebook", params));
}

/**
 * Gác cả đường quay về, dù `state` đã chống CSRF.
 *
 * Hai lớp trả lời hai câu khác nhau: `state` hỏi *"lượt quay về này có khớp lượt đi không"*,
 * còn gác đăng nhập hỏi *"người đang đứng đây là ai"*. Bỏ lớp sau thì người lạ tự mở luồng
 * OAuth bằng nick Facebook của họ và nối Fanpage của họ vào kho của mình — `state` khớp hoàn
 * hảo vì chính họ vừa đi lượt đi.
 *
 * Cookie phiên vẫn tới được đây: nó là `sameSite: "lax"`, và Facebook chuyển hướng về bằng
 * một lượt điều hướng GET ở tab chính — đúng ca `lax` cho phép gửi kèm cookie.
 */
export const GET = guardedRoute(async function GET(_actor, request: Request) {
  const query = new URL(request.url).searchParams;

  // Người dùng bấm "Hủy" ở dialog Facebook.
  const denied = query.get("error_description") ?? query.get("error");
  if (denied) return back(request, { error: `Facebook denied authorization: ${denied}` });

  const code = query.get("code");
  if (!code) return back(request, { error: "Facebook did not return an authorization code." });

  const cookieStore = await cookies();
  const expectedState = cookieStore.get(OAUTH_STATE_COOKIE)?.value;
  cookieStore.delete(OAUTH_STATE_COOKIE); // dùng một lần, kể cả khi hỏng

  if (!expectedState || expectedState !== query.get("state")) {
    return back(request, {
      error: "The OAuth state did not match, so this connection attempt was discarded. Start the connection again.",
    });
  }

  try {
    const shortLived = await exchangeCodeForToken(code);
    const longLived = await exchangeForLongLivedToken(shortLived);
    const [identity, pages] = await Promise.all([
      fetchIdentity(longLived.accessToken),
      fetchManagedPages(longLived.accessToken),
    ]);

    if (pages.length === 0) {
      return back(request, {
        error:
          `Nick "${identity.name}" does not manage any Facebook Pages, or no Page was selected on the ` +
          `authorization screen. Connect again and select a Page.`,
      });
    }

    const saved = await saveConnectionWithPages(identity, longLived, pages);
    const skipped =
      saved.skippedPages.length > 0
        ? ` Targets were not connected for: ${saved.skippedPages.join(", ")} (an existing target has the same name). Rename the target under /targets, then connect again.`
        : "";

    return back(request, {
      connected: `Connected "${identity.name}" to ${saved.savedPages} Facebook Page${saved.savedPages === 1 ? "" : "s"}.${skipped}`,
    });
  } catch (error) {
    const message =
      error instanceof FacebookConfigError
        ? error.message
        : toUserMessage(error, "An unknown error occurred while retrieving the Facebook token.");
    return back(request, { error: message });
  }
});
