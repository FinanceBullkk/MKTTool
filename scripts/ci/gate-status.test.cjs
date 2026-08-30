"use strict";

const assert = require("node:assert/strict");
const { mkdtempSync, readFileSync } = require("node:fs");
const { tmpdir } = require("node:os");
const path = require("node:path");
const { emitGate, makeRecord } = require("./gate-status.cjs");

function withGitHubFiles(callback) {
  const directory = mkdtempSync(path.join(tmpdir(), "mkttool-gate-status-"));
  const summary = path.join(directory, "summary.md");
  const output = path.join(directory, "output.txt");
  const previous = {
    summary: process.env.GITHUB_STEP_SUMMARY,
    output: process.env.GITHUB_OUTPUT,
  };
  process.env.GITHUB_STEP_SUMMARY = summary;
  process.env.GITHUB_OUTPUT = output;
  try {
    return callback({ summary, output });
  } finally {
    if (previous.summary === undefined) delete process.env.GITHUB_STEP_SUMMARY;
    else process.env.GITHUB_STEP_SUMMARY = previous.summary;
    if (previous.output === undefined) delete process.env.GITHUB_OUTPUT;
    else process.env.GITHUB_OUTPUT = previous.output;
  }
}

const record = makeRecord({
  gate: "restore-contract",
  status: "PASS",
  reason: "real disposable database matched",
  owner: "mkttool-ci",
});
assert.deepEqual(record, {
  gate: "restore-contract",
  status: "PASS",
  reason: "real disposable database matched",
  owner: "mkttool-ci",
});

withGitHubFiles(({ summary, output }) => {
  const emitted = emitGate(record, { exit: false });
  assert.equal(emitted.status, "PASS");
  const summaryText = readFileSync(summary, "utf8");
  const outputText = readFileSync(output, "utf8");
  assert.match(summaryText, /"gate": "restore-contract"/);
  assert.match(summaryText, /"status": "PASS"/);
  assert.match(outputText, /status=PASS/);
  assert.match(outputText, /gate_status=PASS/);
  assert.match(outputText, /result<<GATE_[0-9a-f]+/);
});

for (const status of ["FAIL", "OPEN", "BLOCKED", "SKIPPED"]) {
  const pending = emitGate(
    { gate: `status-${status.toLowerCase()}`, status, reason: "deliberate contract test", owner: "test" },
    { exit: false },
  );
  assert.equal(pending.status, status);
}

assert.throws(
  () => makeRecord({ gate: "bad", status: "UNKNOWN", reason: "x", owner: "y" }),
  /status must be one of/,
);
assert.throws(
  () => makeRecord({ gate: "bad", status: "PASS", reason: "line\nbreak", owner: "y" }),
  /must not contain control characters/,
);
