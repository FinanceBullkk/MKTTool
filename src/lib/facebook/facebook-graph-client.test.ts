import { describe, expect, it } from "vitest";
import { FacebookGraphError, redactTokens } from "./facebook-graph-client";

/**
 * Che token là lớp bảo vệ cuối: Graph API hay vọng lại tham số đã gửi, và thông báo lỗi
 * thì đi thẳng ra màn hình lẫn AuditLog. Lọt một lần là token nằm trong database dạng trần.
 */
describe("redactTokens", () => {
  it("redacts an access_token parameter in arbitrary text", () => {
    const redacted = redactTokens("calling /me?access_token=EAAabc123xyz&fields=id");
    expect(redacted).toContain("access_token=***");
    expect(redacted).not.toContain("EAAabc123xyz");
  });

  it("redacts both the app secret and exchange token", () => {
    const redacted = redactTokens("client_secret=abc123&fb_exchange_token=xyz789");
    expect(redacted).toBe("client_secret=***&fb_exchange_token=***");
  });

  it("redacts a standalone token with the EAA prefix", () => {
    const token = `EAA${"x".repeat(40)}`;
    expect(redactTokens(`Facebook says: token ${token} failed`)).not.toContain(token);
  });

  it("does not alter ordinary text", () => {
    const text = "The token has expired. Reconnect on /facebook.";
    expect(redactTokens(text)).toBe(text);
  });
});

describe("FacebookGraphError", () => {
  it("redacts a token inside an error message", () => {
    const error = new FacebookGraphError("failed with access_token=EAAsecret999", null);
    expect(error.message).toContain("access_token=***");
  });

  it("marks token errors so callers reconnect instead of retrying", () => {
    const error = new FacebookGraphError("expired", { code: 190, error_subcode: 463 });
    expect(error.tokenExpired).toBe(true);
    expect(error.transient).toBe(false);
  });

  it("marks transient errors so callers know they can retry", () => {
    const error = new FacebookGraphError("rate limited", { code: 4 });
    expect(error.transient).toBe(true);
    expect(error.tokenExpired).toBe(false);
  });
});
