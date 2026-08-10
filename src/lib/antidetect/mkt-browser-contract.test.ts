import { describe, expect, it } from "vitest";
import {
  MKT_BROWSER_DEFAULT_MCP_PORT,
  MKT_BROWSER_DEFAULT_MCP_URL,
  MKT_BROWSER_MCP_TOKEN_ENV,
  MKT_BROWSER_MCP_URL_ENV,
  MKT_BROWSER_PROVIDER_NAME,
  MKT_BROWSER_PROVIDER_SLUG,
  resolveMktBrowserMcpUrl,
} from "./mkt-browser-contract";

describe("MKT Browser consumer contract", () => {
  it("defines the owned provider and dedicated default port", () => {
    expect(MKT_BROWSER_PROVIDER_NAME).toBe("MKT Browser");
    expect(MKT_BROWSER_PROVIDER_SLUG).toBe("mkt-browser");
    expect(MKT_BROWSER_DEFAULT_MCP_PORT).toBe(47_822);
    expect(MKT_BROWSER_DEFAULT_MCP_URL).toBe("http://127.0.0.1:47822");
    expect(MKT_BROWSER_MCP_URL_ENV).toBe("MKT_BROWSER_MCP_URL");
    expect(MKT_BROWSER_MCP_TOKEN_ENV).toBe("MKT_BROWSER_MCP_TOKEN");
  });

  it("accepts an explicit loopback URL override", () => {
    expect(resolveMktBrowserMcpUrl(" http://localhost:49123 ")).toBe(
      "http://localhost:49123",
    );
  });

  it.each([
    "https://127.0.0.1:47822",
    "http://0.0.0.0:47822",
    "http://example.com:47822",
    "http://127.0.0.1:47822/mcp",
    "not-a-url",
  ])("rejects a non-loopback or non-origin override: %s", (value) => {
    expect(() => resolveMktBrowserMcpUrl(value)).toThrow(/MKT_BROWSER_MCP_URL/);
  });
});
