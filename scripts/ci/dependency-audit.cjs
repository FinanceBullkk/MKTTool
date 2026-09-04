#!/usr/bin/env node
"use strict";

/**
 * Fail merges on published advisories against dependencies this app actually ships.
 *
 * Production reach is the line. A dev-only advisory cannot reach an operator through the deployed
 * app, and blocking merges on one teaches people to bypass the gate.
 *
 * npm's advisory endpoint returns 503 often enough to matter — it took this job down on its first
 * run — and `npm audit` exits 1 for both "vulnerabilities found" and "endpoint unreachable". Those
 * are different facts and the log has to say which. Neither is allowed to pass: a gate that goes
 * green when it could not check is the "skipped check counts as passed" failure the pipeline
 * already learned once.
 */
const { spawnSync } = require("node:child_process");
const { emitGate } = require("./gate-status.cjs");

const GATE = "mkttool-dependency-audit";
const OWNER = "mkttool-ci";
const BLOCKING = new Set(["high", "critical"]);
const ATTEMPTS = 3;
const BACKOFF_MS = 15000;
const AUDIT_ARGS = ["audit", "--omit=dev", "--json"];

/**
 * Turn one `npm audit --json` payload into a gate verdict. Split out from the process work so the
 * classification is testable without reaching the network.
 */
function classify(payload) {
  if (!payload || typeof payload !== "object") {
    return { status: "BLOCKED", reason: "npm audit returned no parsable JSON." };
  }
  if (payload.error) {
    const detail = payload.error.summary || payload.error.code || "unknown error";
    return { status: "BLOCKED", reason: `npm advisory endpoint did not answer: ${detail}.` };
  }
  const vulnerabilities = payload.vulnerabilities || {};
  const blocking = Object.values(vulnerabilities).filter((entry) => BLOCKING.has(entry.severity));
  const total = Object.keys(vulnerabilities).length;
  if (blocking.length) {
    const names = blocking.map((entry) => `${entry.name} (${entry.severity})`).join(", ");
    return { status: "FAIL", reason: `${blocking.length} high or critical advisory in production dependencies: ${names}.` };
  }
  return { status: "PASS", reason: `No high or critical advisories in production dependencies; ${total} lower-severity entr${total === 1 ? "y" : "ies"} ignored.` };
}

function runAudit() {
  // `npm audit` exits non-zero on findings, so the exit code says nothing on its own; the JSON does.
  // CI is Linux, where npm spawns directly. Windows needs a shell — Node refuses to spawn a
  // `.cmd` without one — but passing an args array with `shell: true` is deprecated (DEP0190)
  // because a shell would re-split them. AUDIT_ARGS is a module constant with no caller input, so
  // the one safe form is the fixed command string.
  const options = { encoding: "utf8", maxBuffer: 32 * 1024 * 1024 };
  const result =
    process.platform === "win32"
      ? spawnSync(["npm", ...AUDIT_ARGS].join(" "), { ...options, shell: true })
      : spawnSync("npm", AUDIT_ARGS, options);
  if (result.error) return { status: "BLOCKED", reason: `Could not run npm audit: ${result.error.message}.` };
  try {
    return classify(JSON.parse(result.stdout));
  } catch {
    return { status: "BLOCKED", reason: "npm audit output was not valid JSON." };
  }
}

function sleep(ms) {
  // Synchronous on purpose: this is a one-shot CI script, not a server.
  Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, ms);
}

function main() {
  let verdict = { status: "BLOCKED", reason: "npm audit never ran." };
  for (let attempt = 1; attempt <= ATTEMPTS; attempt += 1) {
    verdict = runAudit();
    // Only an unreachable endpoint is worth retrying. Findings are deterministic.
    if (verdict.status !== "BLOCKED") break;
    if (attempt < ATTEMPTS) {
      process.stdout.write(`attempt ${attempt}: ${verdict.reason} retrying\n`);
      sleep(BACKOFF_MS * attempt);
    }
  }
  emitGate({ gate: GATE, status: verdict.status, reason: verdict.reason, owner: OWNER });
}

if (require.main === module) {
  try {
    main();
  } catch (error) {
    emitGate({ gate: GATE, status: "BLOCKED", reason: "Dependency audit could not start.", owner: OWNER });
  }
}

module.exports = { classify };
