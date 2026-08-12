import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { MKT_BROWSER_DEFAULT_MCP_URL } from "../../src/lib/antidetect/mkt-browser-contract";
import { CONFIG_TEMPLATE, loadRelayConfig, reviewRelayConfig } from "./relay-config";
import { CONFIG_FILE } from "./relay-home";

const HEX_64 = "a".repeat(64);
const MKT_BROWSER_TOKEN = "c".repeat(64);

/** A complete valid config that each test changes in one focused way. */
function validConfig(overrides: Record<string, unknown> = {}) {
  return {
    deviceId: "cm4xdevice0001",
    serverPublicKey: HEX_64,
    vaultKeyOperator: "b".repeat(64),
    webOrigin: "https://mkttool.example.com",
    ...overrides,
  };
}

/** Return only invalid field names for concise assertions. */
function problemFields(parsed: unknown): string[] {
  const result = reviewRelayConfig(parsed);
  return result.ok ? [] : result.problems.map((problem) => problem.field);
}

describe("reviewRelayConfig", () => {
  it("uses the owned MKT Browser loopback origin in the installer template", () => {
    expect(CONFIG_TEMPLATE.mktBrowserUrl).toBe(MKT_BROWSER_DEFAULT_MCP_URL);
  });

  it("normalizes an explicit MKT Browser loopback origin override", () => {
    const result = reviewRelayConfig(
      validConfig({ mktBrowserUrl: "http://localhost:49001/", mktBrowserToken: MKT_BROWSER_TOKEN }),
    );

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.config.mktBrowserUrl).toBe("http://localhost:49001");
    expect(result.config.mktBrowserToken).toBe(MKT_BROWSER_TOKEN);
  });

  it.each([
    "https://127.0.0.1:47822",
    "http://192.0.2.10:47822",
    "http://127.0.0.1:47822/mcp",
  ])("rejects a non-contract MKT Browser origin: %s", (mktBrowserUrl) => {
    expect(problemFields(validConfig({ mktBrowserUrl }))).toEqual(["mktBrowserUrl"]);
  });

  it.each([47823, null, true, {}])(
    "rejects a non-string MKT Browser origin override: %j",
    (mktBrowserUrl) => {
      expect(problemFields(validConfig({ mktBrowserUrl }))).toEqual(["mktBrowserUrl"]);
    },
  );

  it("does not read retired MultiZen configuration as a fallback", () => {
    const result = reviewRelayConfig(
      validConfig({ multizenToken: "retired-token", multizenUrl: "http://127.0.0.1:7777" }),
    );

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.config.mktBrowserToken).toBeUndefined();
    expect(result.config.mktBrowserUrl).toBeUndefined();
    expect(result.config).not.toHaveProperty("multizenToken");
    expect(result.config).not.toHaveProperty("multizenUrl");
  });

  it("rejects a malformed MKT Browser development token override", () => {
    expect(problemFields(validConfig({ mktBrowserToken: "not-a-token" }))).toContain(
      "mktBrowserToken",
    );
  });

  it("accepts a complete config and normalizes the web origin", () => {
    const result = reviewRelayConfig(validConfig({ webOrigin: "https://mkttool.example.com/" }));

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    // Access-Control-Allow-Origin is compared verbatim with the Origin header, which has no
    // trailing slash. Without normalization every call would fail through CORS.
    expect(result.config.webOrigin).toBe("https://mkttool.example.com");
  });

  it("lowercases both hex keys so uppercase pasted values remain valid", () => {
    const result = reviewRelayConfig(
      validConfig({ serverPublicKey: HEX_64.toUpperCase(), vaultKeyOperator: "B".repeat(64) }),
    );

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.config.serverPublicKey).toBe(HEX_64);
    expect(result.config.vaultKeyOperator).toBe("b".repeat(64));
  });

  it("collects every problem in one pass instead of stopping at the first", () => {
    // Stopping at the first issue forces an install-fix-restart loop for every field.
    //
    // webOrigin is intentionally absent: the build supplies BUILT_IN_WEB_ORIGIN and the file only
    // overrides it. Requiring the file value would deadlock a fresh device because remote setup
    // needs CORS before the config is complete. See resolveWebOrigin.
    expect(problemFields({})).toEqual(["deviceId", "serverPublicKey", "vaultKeyOperator"]);
  });

  it("accepts a BOM at the start of the JSON file", () => {
    // Relay v2 initially wrote a BOM on 06 August 2026. The reader must tolerate it because users
    // can edit this file even though the installer now writes UTF-8 without a BOM.
    const home = mkdtempSync(path.join(tmpdir(), "mkttool-bom-"));
    try {
      writeFileSync(
        path.join(home, CONFIG_FILE),
        `﻿${JSON.stringify(validConfig())}`,
        "utf8",
      );
      expect(loadRelayConfig(home).ok).toBe(true);
    } finally {
      rmSync(home, { recursive: true, force: true });
    }
  });

  it("rejects a key with the wrong length", () => {
    expect(problemFields(validConfig({ vaultKeyOperator: "abc" }))).toEqual(["vaultKeyOperator"]);
  });

  it("rejects a key with the right length but non-hex characters", () => {
    expect(problemFields(validConfig({ serverPublicKey: "z".repeat(64) }))).toEqual([
      "serverPublicKey",
    ]);
  });

  it("rejects a webOrigin that includes a path", () => {
    // Pasting the complete browser address is the most likely operator mistake for this field.
    expect(problemFields(validConfig({ webOrigin: "https://mkttool.example.com/accounts" }))).toEqual(
      ["webOrigin"],
    );
  });

  it("rejects a webOrigin that is not a URL", () => {
    expect(problemFields(validConfig({ webOrigin: "mkttool.example.com" }))).toEqual(["webOrigin"]);
  });

  it("does not treat whitespace-only values as configured", () => {
    expect(problemFields(validConfig({ deviceId: "   " }))).toEqual(["deviceId"]);
  });

  it("reports a non-object input at file level instead of blaming each field", () => {
    const result = reviewRelayConfig("a string");

    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.problems).toHaveLength(1);
    expect(result.problems[0].field).toBe("file");
  });

  it("makes every configuration problem actionable", () => {
    const result = reviewRelayConfig({});

    expect(result.ok).toBe(false);
    if (result.ok) return;
    for (const problem of result.problems) {
      expect(problem.message.length).toBeGreaterThan(40);
    }
  });
});
