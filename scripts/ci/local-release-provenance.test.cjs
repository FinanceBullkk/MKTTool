"use strict";

const assert = require("node:assert/strict");
const { test } = require("node:test");
const { mkdtempSync, mkdirSync, writeFileSync, rmSync } = require("node:fs");
const { tmpdir } = require("node:os");
const path = require("node:path");
const { createOutput, sourceIdentity, sameSource, sha256, assertLogIntegrity } = require("./local-release-provenance.cjs");
const { verdict } = require("./local-release-runner.cjs");

const identity = { status: "", commit: "a".repeat(40), tree: "b".repeat(40), lockfileSha256: "c".repeat(64), packageSha256: "d".repeat(64) };

test("source attestation requires clean complete identities and catches all frozen-input changes", () => {
  const source = sourceIdentity(identity);
  assert.throws(() => sourceIdentity({ ...identity, status: " M source.ts" }), /dirty/);
  assert.throws(() => sourceIdentity({ ...identity, commit: "HEAD" }), /incomplete/);
  assert.equal(sameSource(source, { ...source }), true);
  assert.equal(sameSource({}, {}), false);
  assert.equal(sameSource(null, source), false);
  for (const field of Object.keys(source)) assert.equal(sameSource(source, { ...source, [field]: "e".repeat(source[field].length) }), false);
});

test("receipts require every exact command, successful exit, no invented cleanup and log hash", () => {
  const source = sourceIdentity(identity);
  const plan = [{ id: "fixed", command: "node", args: ["fixed.js"] }];
  const check = { ...plan[0], status: "PASS", exitCode: 0, interrupted: null, cleanupConfirmed: null, logSha256: "f".repeat(64) };
  assert.equal(verdict(plan, [check], source, source), "PASS");
  assert.equal(verdict([], [], source, source), "BLOCKED");
  assert.equal(verdict(plan, [], source, source), "BLOCKED");
  for (const change of [{ status: "SKIPPED" }, { exitCode: 1 }, { cleanupConfirmed: false }, { interrupted: "timeout" }, { command: "echo" }, { args: ["PASS"] }, { logSha256: null }]) {
    assert.equal(verdict(plan, [{ ...check, ...change }], source, source), "BLOCKED");
  }
  assert.equal(verdict(plan, [{ ...check, status: "FAIL", exitCode: 1 }], source, source), "FAIL");
  assert.equal(verdict(plan, [check], source, { ...source, lockfileSha256: "e".repeat(64) }), "BLOCKED");
});

test("output is exclusive and outside source; hashes bind actual file bytes", (t) => {
  const root = mkdtempSync(path.join(tmpdir(), "mkt-local-provenance-"));
  t.after(() => rmSync(root, { recursive: true, force: true }));
  const source = path.join(root, "source");
  mkdirSync(source);
  assert.throws(() => createOutput(source, path.join(source, "output")), /outside/);
  const output = createOutput(source, path.join(root, "output"));
  assert.throws(() => createOutput(source, output));
  const file = path.join(output, "fixture.log");
  writeFileSync(file, "original");
  const before = sha256(file);
  const checks = [{ log: "fixture.log", logSha256: before }];
  assertLogIntegrity(checks, output);
  writeFileSync(file, "changed");
  assert.notEqual(sha256(file), before);
  assert.throws(() => assertLogIntegrity(checks, output), /changed/);
  assert.throws(() => assertLogIntegrity([{ log: "../outside.log" }], output), /Invalid/);
});
