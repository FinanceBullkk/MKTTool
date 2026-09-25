import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { normalizeRelayPackageScript } from "./normalize-relay-package-script";

describe("delivered Relay script line endings", () => {
  for (const withBom of [false, true]) {
    for (const [name, endings] of [
      ["LF", ["\n", "\n", "\n"]],
      ["CRLF", ["\r\n", "\r\n", "\r\n"]],
      ["mixed", ["\r\n", "\n", "\r"]],
    ] as const) {
      it(`normalizes ${name} with BOM=${withBom} to identical Windows bytes`, () => {
        const prefix = withBom ? "\uFEFF" : "";
        const lines = ["$incomingVersion = 0", "Write-Host '\u0111\u1ee7'", "exit 0"];
        const input = Buffer.from(prefix + lines.map((line, index) => line + endings[index]).join(""));
        const expected = Buffer.from(prefix + lines.join("\r\n") + "\r\n");
        const actual = normalizeRelayPackageScript(input);
        expect(actual).toEqual(expected);
        expect(normalizeRelayPackageScript(actual)).toEqual(expected);
      });
    }
  }

  it("preserves empty input and a missing terminal newline", () => {
    expect(normalizeRelayPackageScript(Buffer.alloc(0))).toEqual(Buffer.alloc(0));
    expect(normalizeRelayPackageScript(Buffer.from("first\nlast"))).toEqual(Buffer.from("first\r\nlast"));
  });

  it("preserves every non-newline byte without decoding text", () => {
    const input = Buffer.from([0xef, 0xbb, 0xbf, 0xff, 0x80, 0x0a, 0x00]);
    expect(normalizeRelayPackageScript(input)).toEqual(Buffer.from([0xef, 0xbb, 0xbf, 0xff, 0x80, 0x0d, 0x0a, 0x00]));
  });

  for (const name of ["setup.bat", "install-relay.ps1", "start-mkttool-relay.cmd"]) {
    it(`keeps the real ${name} payload stable across checkout line endings`, () => {
      const original = readFileSync(path.join(process.cwd(), "relay", name));
      const lf = original.toString("latin1").replace(/\r\n|\r/g, "\n");
      const expected = Buffer.from(lf.replace(/\n/g, "\r\n"), "latin1");
      let index = 0;
      const mixed = lf.replace(/\n/g, () => index++ % 2 === 0 ? "\r\n" : "\n");
      for (const source of [lf, mixed, expected.toString("latin1")]) {
        expect(normalizeRelayPackageScript(Buffer.from(source, "latin1"))).toEqual(expected);
      }
      expect(expected.subarray(0, 3)).toEqual(original.subarray(0, 3));
    });
  }
});
