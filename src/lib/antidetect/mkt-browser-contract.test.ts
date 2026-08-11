import { describe, expect, it } from "vitest";
import {
  MKT_BROWSER_DEFAULT_MCP_PORT,
  MKT_BROWSER_DEFAULT_MCP_URL,
  MKT_BROWSER_MCP_TOKEN_ENV,
  MKT_BROWSER_MCP_URL_ENV,
  MKT_BROWSER_PROVIDER_NAME,
  MKT_BROWSER_PROVIDER_SLUG,
  MKT_BROWSER_RUNTIME_INFO_TOOL,
  MKT_BROWSER_SUPPORTED_CONTRACT_VERSIONS,
  type MktBrowserRuntimeInfo,
  describeMktBrowserCompatibility,
  resolveMktBrowserMcpUrl,
} from "./mkt-browser-contract";

const RUNTIME_INFO: MktBrowserRuntimeInfo = {
  provider: "mkt-browser",
  appVersion: "0.3.1",
  contractVersion: 1,
  profileSchemaVersion: 1,
  engine: { kind: "cloakbrowser", version: "145.0.0.0", status: "ready" },
  capabilities: ["profile-contract-v1", "runtime-info-v1"],
};

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

describe("MKT Browser compatibility verdict", () => {
  it("names the runtime tool and the versions this build drives", () => {
    expect(MKT_BROWSER_RUNTIME_INFO_TOOL).toBe("get_runtime_info");
    expect([...MKT_BROWSER_SUPPORTED_CONTRACT_VERSIONS]).toEqual([1]);
  });

  it("accepts a device on a supported contract version", () => {
    expect(describeMktBrowserCompatibility(RUNTIME_INFO)).toEqual({
      compatible: true,
      reason: "",
    });
  });

  it("treats a build that cannot report its version as incompatible, not as fine", () => {
    // A W01/W02 artifact predates the tool. Calling that "compatible" would let the profile flow
    // start against a device whose behaviour nobody can confirm.
    const verdict = describeMktBrowserCompatibility(null);
    expect(verdict.compatible).toBe(false);
    expect(verdict.reason).toContain("get_runtime_info");
  });

  it("refuses a newer contract version instead of assuming newer is safe", () => {
    const verdict = describeMktBrowserCompatibility({ ...RUNTIME_INFO, contractVersion: 2 });
    expect(verdict.compatible).toBe(false);
    expect(verdict.reason).toContain("contract version 2");
  });

  it("refuses an endpoint that answers as another product", () => {
    const verdict = describeMktBrowserCompatibility({ ...RUNTIME_INFO, provider: "multizen" });
    expect(verdict.compatible).toBe(false);
    expect(verdict.reason).toContain("multizen");
  });
});
