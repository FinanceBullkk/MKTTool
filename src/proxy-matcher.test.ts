/**
 * Cái `matcher` trong `proxy.ts` quyết định đường nào được gác — nên nó là một dòng regex mà
 * sửa sai thì **mở lại kho danh tính, không có gì đỏ lên**.
 *
 * Kiểu hỏng cụ thể đang canh: ai đó cần cho một đường đi qua (một webhook, một trang trạng
 * thái), thêm nó vào danh sách loại trừ, và lỡ tay viết rộng hơn ý định — `accounts` thay vì
 * `account-status`, hay quên neo đầu chuỗi. Trang `/accounts` im lặng thành công khai.
 *
 * Test đọc thẳng `config.matcher` thật chứ không chép lại chuỗi regex: chép lại thì test chỉ
 * kiểm chính bản chép của nó, và sẽ vẫn xanh sau khi `proxy.ts` đã đổi.
 */
import { describe, expect, it } from "vitest";
import { config } from "./proxy";

/** Next áp `matcher` như regex neo hai đầu — dựng lại đúng như vậy để hỏi thử. */
function isGuarded(pathname: string): boolean {
  return config.matcher.some((pattern) => new RegExp(`^${pattern}$`).test(pathname));
}

describe("proxy.ts matcher", () => {
  it.each([
    "/",
    "/accounts",
    "/accounts/abc123",
    "/proxies",
    "/queue",
    "/queue/new",
    "/content",
    "/health",
    "/facebook",
    "/targets",
  ])("guards %s", (pathname) => {
    expect(
      isGuarded(pathname),
      `${pathname} must be guarded. This page reads directly from the database and returns HTML. ` +
        `Removing it from the matcher would expose the identity vault to anyone with the URL.`,
    ).toBe(true);
  });

  it.each([
    // Route handler tự gác và phải trả 401 JSON, không phải chuyển hướng sang HTML.
    "/api/rules/preview",
    "/api/auth/callback/google",
    // Gác màn hình đăng nhập bằng chính đăng nhập là vòng lặp chuyển hướng.
    "/login",
    // Tài nguyên build: chặn thì trang đăng nhập mất sạch CSS và JavaScript.
    "/_next/static/chunks/main.js",
    "/favicon.ico",
  ])("allows %s through", (pathname) => {
    expect(
      isGuarded(pathname),
      `${pathname} must remain accessible. See config.matcher comments for each exemption.`,
    ).toBe(false);
  });

  it("exempts exactly four route groups", () => {
    // Mỗi nhóm miễn trừ là một đường không cần đăng nhập, nên số lượng của chúng đáng được
    // đếm. Test đỏ ở đây nghĩa là vừa có người mở thêm một cửa — hãy đọc kỹ cửa đó là gì.
    expect(config.matcher).toEqual([
      "/((?!api|login|_next/static|_next/image|favicon.ico).*)",
    ]);
  });
});
