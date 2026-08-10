import { readdirSync, readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import path from "node:path";
import { describe, expect, it } from "vitest";

const REPOSITORY_ROOT = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "../../..",
);

const RETIRED_MARKERS = [
  "MultiZen",
  "multizen",
  "127.0.0.1:7777",
  "@multizen/",
  "window.multizen",
  "MULTIZEN_MCP_",
  "autoUpdate",
  "usageReporting",
] as const;

function sourceFiles(directory: string): string[] {
  return readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const absolutePath = path.join(directory, entry.name);
    if (entry.isDirectory()) return sourceFiles(absolutePath);
    if (entry.name.endsWith(".test.ts") || entry.name.endsWith(".test.tsx")) return [];
    return /\.(?:ts|tsx)$/.test(entry.name) ? [absolutePath] : [];
  });
}

describe("MKT Browser clean-break surfaces", () => {
  it("contains no retired first-party contract markers", () => {
    const files = [
      ...sourceFiles(path.join(REPOSITORY_ROOT, "src", "lib", "antidetect")),
      ...sourceFiles(path.join(REPOSITORY_ROOT, "relay", "src")),
      path.join(REPOSITORY_ROOT, "relay", "install-relay.ps1"),
      path.join(REPOSITORY_ROOT, ".env.example"),
    ];

    const findings = files.flatMap((file) => {
      const source = readFileSync(file, "utf8");
      return RETIRED_MARKERS.filter((marker) => source.includes(marker)).map(
        (marker) => `${path.relative(REPOSITORY_ROOT, file)}: ${marker}`,
      );
    });

    expect(findings).toEqual([]);
  });
});
