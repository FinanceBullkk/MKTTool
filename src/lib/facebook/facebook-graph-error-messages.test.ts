import { describe, expect, it } from "vitest";
import { describeGraphError, isTokenError, isTransientError } from "./facebook-graph-error-messages";

describe("isTokenError", () => {
  it("detects an expired token by subcode", () => {
    expect(isTokenError({ code: 190, error_subcode: 463 })).toBe(true);
  });

  it("detects every OAuthException even with an unknown code", () => {
    expect(isTokenError({ type: "OAuthException", code: 999 })).toBe(true);
  });

  it("does not mistake a permissions error for a token error", () => {
    // Mã 200 là thiếu quyền — kết nối lại không chữa được, phải sửa quyền của app.
    expect(isTokenError({ code: 200 })).toBe(false);
  });

  it("does not classify a missing payload", () => {
    expect(isTokenError(null)).toBe(false);
  });
});

describe("isTransientError", () => {
  it("classifies rate-limit codes as transient", () => {
    expect(isTransientError({ code: 4 })).toBe(true);
    expect(isTransientError({ code: 613 })).toBe(true);
  });

  it("does not classify a broken token as transient", () => {
    expect(isTransientError({ code: 190 })).toBe(false);
  });
});

describe("describeGraphError", () => {
  it("explains what to do when a token expires", () => {
    const message = describeGraphError({ code: 190, error_subcode: 463 }, "generic error");
    expect(message).toContain("expired");
    expect(message).toContain("/facebook");
  });

  it("preserves Facebook's message and diagnostic codes", () => {
    const message = describeGraphError(
      { code: 200, message: "Permissions error", error_subcode: 33 },
      "generic error",
    );
    expect(message).toContain("Permissions error");
    expect(message).toContain("code 200");
    expect(message).toContain("subcode 33");
  });

  it("warns operators to stop when Facebook blocks actions for a policy violation", () => {
    expect(describeGraphError({ code: 368 }, "generic error")).toContain("STOP");
  });

  it("uses the fallback for a completely unknown code", () => {
    expect(describeGraphError({ code: 987654 }, "The Graph API returned HTTP 500.")).toContain(
      "The Graph API returned HTTP 500.",
    );
  });

  it("returns the exact fallback when the payload is missing", () => {
    expect(describeGraphError(null, "network unavailable")).toBe("network unavailable");
  });
});
