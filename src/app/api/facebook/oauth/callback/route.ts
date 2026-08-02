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
import { FacebookConfigError } from "@/lib/facebook/facebook-app-config";
import { toUserMessage } from "@/lib/facebook/facebook-graph-client";
import {
  OAUTH_STATE_COOKIE,
  exchangeCodeForToken,
  exchangeForLongLivedToken,
  fetchIdentity,
  fetchManagedPages,
} from "@/lib/facebook/facebook-oauth-flow";
import { saveConnectionWithPages } from "@/lib/facebook/facebook-token-manager";

export const runtime = "nodejs";

function back(request: Request, params: Record<string, string>): NextResponse {
  const url = new URL("/facebook", request.url);
  for (const [key, value] of Object.entries(params)) url.searchParams.set(key, value);
  return NextResponse.redirect(url);
}

export async function GET(request: Request) {
  const query = new URL(request.url).searchParams;

  // Người dùng bấm "Hủy" ở dialog Facebook.
  const denied = query.get("error_description") ?? query.get("error");
  if (denied) return back(request, { error: `Facebook từ chối cấp quyền: ${denied}` });

  const code = query.get("code");
  if (!code) return back(request, { error: "Facebook không trả về mã ủy quyền." });

  const cookieStore = await cookies();
  const expectedState = cookieStore.get(OAUTH_STATE_COOKIE)?.value;
  cookieStore.delete(OAUTH_STATE_COOKIE); // dùng một lần, kể cả khi hỏng

  if (!expectedState || expectedState !== query.get("state")) {
    return back(request, {
      error: "Chuỗi state không khớp — bỏ qua lần kết nối này. Bấm kết nối lại từ đầu.",
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
          `Nick "${identity.name}" không quản trị Fanpage nào, hoặc chưa tick chọn Page ở màn hình ` +
          `cấp quyền. Kết nối lại và nhớ chọn Page.`,
      });
    }

    const saved = await saveConnectionWithPages(identity, longLived, pages);
    const skipped =
      saved.skippedPages.length > 0
        ? ` Chưa nối đích cho: ${saved.skippedPages.join(", ")} (trùng tên đích đã có) — sửa tên đích ở /targets rồi kết nối lại.`
        : "";

    return back(request, {
      connected: `Đã kết nối "${identity.name}" với ${saved.savedPages} Fanpage.${skipped}`,
    });
  } catch (error) {
    const message =
      error instanceof FacebookConfigError
        ? error.message
        : toUserMessage(error, "Lỗi không xác định khi lấy token Facebook.");
    return back(request, { error: message });
  }
}
