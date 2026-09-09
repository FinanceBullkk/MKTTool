"use strict";

const assert = require("node:assert/strict");
const { test } = require("node:test");
const { mkdtempSync, readFileSync, rmSync } = require("node:fs");
const { tmpdir } = require("node:os");
const path = require("node:path");
const { runCommand, runSequence, redact } = require("./local-release-process.cjs");
const { sha256 } = require("./local-release-provenance.cjs");

function fixture(t) {
  const root = mkdtempSync(path.join(tmpdir(), "mkt-local-process-"));
  t.after(() => rmSync(root, { recursive: true, force: true }));
  return root;
}
const step = (code, timeoutMs = 5_000) => ({ id: "fixture", command: process.execPath, args: ["-e", code], timeoutMs });

test("bounded real child logs and hashes are generated from actual exit, not printed PASS", async (t) => {
  const root = fixture(t);
  const pass = await runCommand(step("console.log('fixture complete')"), root, process.env, path.join(root, "pass.log"));
  assert.equal(pass.status, "PASS");
  assert.equal(pass.exitCode, 0);
  assert.equal(pass.cleanupConfirmed, null);
  assert.equal(pass.logSha256, sha256(path.join(root, "pass.log")));
  const fail = await runCommand(step("console.log('PASS');process.exitCode=7"), root, process.env, path.join(root, "fail.log"));
  assert.equal(fail.status, "FAIL");
  assert.equal(fail.exitCode, 7);
});

test("timeout and missing executable are BLOCKED with non-passing receipts", async (t) => {
  const root = fixture(t);
  const timeout = await runCommand(step("setInterval(()=>{},1000)", 200), root, process.env, path.join(root, "timeout.log"));
  assert.equal(timeout.status, "BLOCKED");
  assert.equal(timeout.interrupted, "timeout");
  assert.equal(timeout.cleanupConfirmed, null);
  assert.equal(timeout.terminationCommandSucceeded, true);
  const absent = await runCommand({ ...step(""), command: path.join(root, "missing-node") }, root, process.env, path.join(root, "absent.log"));
  assert.equal(absent.status, "BLOCKED");
  assert.equal(absent.exitCode, null);
});

test("redaction covers complete URLs and encoded passwords across child chunks", async (t) => {
  const root = fixture(t);
  const url = new URL("postgresql://localhost/fixture_test");
  url.username = "fixture";
  url.password = "chunk@secret";
  const env = { ...process.env, DATABASE_URL: url.toString() };
  const code = "process.stdout.write(process.env.DATABASE_URL.slice(0,25));setTimeout(()=>process.stdout.write(process.env.DATABASE_URL.slice(25)),20)";
  const result = await runCommand(step(code), root, env, path.join(root, "redacted.log"));
  assert.equal(result.status, "PASS");
  assert.equal(readFileSync(path.join(root, "redacted.log"), "utf8"), "[REDACTED]");
  assert.equal(redact("chunk@secret chunk%40secret", env), "[REDACTED] [REDACTED]");
});

test("orchestration runs serially and never starts a later command after failure", async (t) => {
  const root = fixture(t);
  const first = { ...step("setTimeout(()=>require('node:fs').writeFileSync('ready','yes'),30)"), id: "first" };
  const second = { ...step("if(require('node:fs').readFileSync('ready','utf8')!=='yes')process.exitCode=2"), id: "second" };
  const checks = await runSequence([first, second], root, process.env, root);
  assert.deepEqual(checks.map((check) => check.status), ["PASS", "PASS"]);
  const failed = { ...step("process.exitCode=3"), id: "failure" };
  const mustNotStart = { ...step("throw new Error('must not run')"), id: "unreachable" };
  const stopped = await runSequence([failed, mustNotStart], root, process.env, root);
  assert.equal(stopped.length, 1);
  assert.equal(stopped[0].status, "FAIL");
});
