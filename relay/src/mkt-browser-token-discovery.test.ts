import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { describe, expect, it } from "vitest";
import {
  readMktBrowserToken,
  resolveMktBrowserToken,
  resolveMktBrowserTokenPath,
} from "./mkt-browser-token-discovery";

const TOKEN = "a".repeat(64);

describe("MKT Browser token discovery", () => {
  it("resolves the owned Windows data path", () => {
    expect(
      resolveMktBrowserTokenPath({
        platform: "win32",
        localAppData: "C:\\Users\\Operator\\AppData\\Local",
      }),
    ).toBe("C:\\Users\\Operator\\AppData\\Local\\MKTTool\\MKTBrowser\\mcp-token");
  });

  it("does not guess a path outside the verified Windows platform", () => {
    expect(resolveMktBrowserTokenPath({ platform: "darwin", localAppData: "/tmp" })).toBeNull();
    expect(resolveMktBrowserTokenPath({ platform: "win32", localAppData: "relative" })).toBeNull();
  });

  it("reads only a valid 256-bit hex token", () => {
    const home = mkdtempSync(path.join(tmpdir(), "mkt-browser-token-"));
    const tokenPath = path.join(home, "mcp-token");
    try {
      writeFileSync(tokenPath, `${TOKEN}\n`, "utf8");
      expect(readMktBrowserToken(tokenPath)).toBe(TOKEN);

      writeFileSync(tokenPath, "not-a-token", "utf8");
      expect(readMktBrowserToken(tokenPath)).toBeNull();
    } finally {
      rmSync(home, { recursive: true, force: true });
    }
  });

  it("keeps an explicit development override ahead of local discovery", () => {
    expect(resolveMktBrowserToken(TOKEN, { platform: "darwin" })).toEqual({
      value: TOKEN,
      source: "config-override",
    });
  });
});
