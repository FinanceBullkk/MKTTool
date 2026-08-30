"use strict";

const assert = require("node:assert/strict");
const { execFileSync } = require("node:child_process");
const { mkdtempSync, rmSync, writeFileSync } = require("node:fs");
const { tmpdir } = require("node:os");
const path = require("node:path");

const scanner = path.join(__dirname, "secret-scan.cjs");
const root = mkdtempSync(path.join(tmpdir(), "mkttool-secret-scan-"));
try {
  const planted = ["ghp_", "abcdefghijklmnopqrstuvwxyz1234567890"].join("");
  writeFileSync(path.join(root, "planted.txt"), `token=${planted}\n`, "utf8");
  let output = "";
  assert.throws(() => {
    try {
      execFileSync(process.execPath, [scanner, "--root=.", "--root=missing"], {
        cwd: root,
        env: { ...process.env, GITHUB_STEP_SUMMARY: "", GITHUB_OUTPUT: "" },
        encoding: "utf8",
      });
    } catch (error) {
      output = String(error.stdout ?? "");
      throw error;
    }
  });
  assert.match(output, /high-confidence credential pattern/);
  assert.match(output, /planted\.txt/);
  assert.doesNotMatch(output, /abcdefghijklmnopqrstuvwxyz1234567890/);
} finally {
  rmSync(root, { recursive: true, force: true });
}
