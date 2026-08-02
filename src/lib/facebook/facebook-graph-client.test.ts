import { describe, expect, it } from "vitest";
import { FacebookGraphError, redactTokens } from "./facebook-graph-client";

/**
 * Che token là lớp bảo vệ cuối: Graph API hay vọng lại tham số đã gửi, và thông báo lỗi
 * thì đi thẳng ra màn hình lẫn AuditLog. Lọt một lần là token nằm trong database dạng trần.
 */
describe("redactTokens", () => {
  it("che tham số access_token trong chuỗi bất kỳ", () => {
    const redacted = redactTokens("gọi tới /me?access_token=EAAabc123xyz&fields=id");
    expect(redacted).toContain("access_token=***");
    expect(redacted).not.toContain("EAAabc123xyz");
  });

  it("che cả app secret và token đem đi đổi", () => {
    const redacted = redactTokens("client_secret=abc123&fb_exchange_token=xyz789");
    expect(redacted).toBe("client_secret=***&fb_exchange_token=***");
  });

  it("che token trần đứng một mình theo tiền tố EAA", () => {
    const token = `EAA${"x".repeat(40)}`;
    expect(redactTokens(`Facebook nói: token ${token} hỏng`)).not.toContain(token);
  });

  it("không đụng vào văn bản thường", () => {
    const text = "Token đã hết hạn. Vào /facebook bấm kết nối lại.";
    expect(redactTokens(text)).toBe(text);
  });
});

describe("FacebookGraphError", () => {
  it("che token ngay trong thông báo lỗi", () => {
    const error = new FacebookGraphError("hỏng với access_token=EAAsecret999", null);
    expect(error.message).toContain("access_token=***");
  });

  it("đánh dấu lỗi token để nơi gọi biết phải kết nối lại chứ không thử lại", () => {
    const error = new FacebookGraphError("hết hạn", { code: 190, error_subcode: 463 });
    expect(error.tokenExpired).toBe(true);
    expect(error.transient).toBe(false);
  });

  it("đánh dấu lỗi tạm thời để nơi gọi biết thử lại được", () => {
    const error = new FacebookGraphError("quá tần suất", { code: 4 });
    expect(error.transient).toBe(true);
    expect(error.tokenExpired).toBe(false);
  });
});
