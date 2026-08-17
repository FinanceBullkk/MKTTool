import type { IncomingMessage } from "node:http";
import { describe, expect, it, vi } from "vitest";
import { handleAuthorizeBootstrap } from "./handle-authorize-bootstrap";

function request(origin?: string): IncomingMessage {
  return { headers: origin ? { origin } : {} } as IncomingMessage;
}

describe("handleAuthorizeBootstrap", () => {
  it("requires the exact configured origin", () => {
    const broker = { authorize: vi.fn() };
    expect(handleAuthorizeBootstrap(request("https://evil.example"), "{}", "https://app.example", broker as never).ok).toBe(false);
    expect(broker.authorize).not.toHaveBeenCalled();
  });

  it("passes a signed authorization to the broker", () => {
    const broker = { authorize: vi.fn() };
    expect(handleAuthorizeBootstrap(request("https://app.example"), JSON.stringify({ authorization: "signed" }), "https://app.example", broker as never).ok).toBe(true);
    expect(broker.authorize).toHaveBeenCalledWith("signed");
  });
});
