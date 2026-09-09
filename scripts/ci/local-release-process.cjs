"use strict";

const { spawn, spawnSync } = require("node:child_process");
const { writeFileSync } = require("node:fs");
const path = require("node:path");
const { sha256 } = require("./local-release-provenance.cjs");

const MAX_LOG_BYTES = 32 * 1024 * 1024;

function redact(text, env) {
  const secrets = [];
  for (const key of ["DATABASE_URL", "TEST_DATABASE_URL", "CONTRACTS_DATABASE_URL"]) {
    if (!env[key]) continue;
    secrets.push(env[key]);
    try {
      const password = new URL(env[key]).password;
      if (password) secrets.push(password, decodeURIComponent(password));
    } catch { /* Invalid targets fail preflight; do not expose them here. */ }
  }
  for (const value of [...new Set(secrets)].sort((a, b) => b.length - a.length)) text = text.split(value).join("[REDACTED]");
  return text;
}

function killOwnedTree(child) {
  if (!Number.isSafeInteger(child.pid) || child.pid <= 0) return false;
  if (process.platform === "win32") {
    const tool = path.join(process.env.SystemRoot || "C:\\Windows", "System32", "taskkill.exe");
    return spawnSync(tool, ["/PID", String(child.pid), "/T", "/F"], { windowsHide: true, timeout: 10_000, stdio: "ignore" }).status === 0;
  }
  try { process.kill(-child.pid, "SIGKILL"); return true; } catch { return false; }
}

async function runCommand(step, source, env, logPath) {
  const startedAt = new Date().toISOString();
  const started = Date.now();
  return new Promise((resolve, reject) => {
    const chunks = [];
    let size = 0;
    let interrupted = null;
    let terminationCommandSucceeded = null;
    let settled = false;
    let timer;
    let fallback;
    const child = spawn(step.command, step.args, { cwd: source, env, shell: false, windowsHide: true, detached: process.platform !== "win32", stdio: ["ignore", "pipe", "pipe"] });
    const finish = (exitCode, signal, spawnError = false) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      clearTimeout(fallback);
      process.off("SIGINT", onSignal);
      process.off("SIGTERM", onSignal);
      const log = redact(Buffer.concat(chunks).toString("utf8"), env);
      try {
        writeFileSync(logPath, log, { flag: "wx", mode: 0o600 });
        resolve({ id: step.id, command: step.command, args: step.args, startedAt, finishedAt: new Date().toISOString(), durationMs: Date.now() - started,
          status: spawnError || interrupted ? "BLOCKED" : exitCode === 0 ? "PASS" : "FAIL", exitCode, signal, interrupted,
          cleanupConfirmed: null, terminationCommandSucceeded,
          log: path.basename(logPath), logSha256: sha256(logPath) });
      } catch { reject(new Error("Stage log could not be written exclusively.")); }
    };
    const stop = (reason) => {
      if (interrupted || settled) return;
      interrupted = reason;
      terminationCommandSucceeded = killOwnedTree(child);
      fallback = setTimeout(() => finish(null, null), 2_000);
    };
    const onSignal = () => stop("signal");
    const capture = (chunk) => {
      size += chunk.length;
      if (size > MAX_LOG_BYTES) { stop("log-limit"); return; }
      chunks.push(chunk);
    };
    child.stdout.on("data", capture);
    child.stderr.on("data", capture);
    child.once("error", () => finish(null, null, true));
    child.once("close", (code, signal) => finish(code, signal));
    process.on("SIGINT", onSignal);
    process.on("SIGTERM", onSignal);
    timer = setTimeout(() => stop("timeout"), step.timeoutMs);
  });
}

async function runSequence(plan, source, env, output) {
  const checks = [];
  for (const step of plan) {
    const check = await runCommand(step, source, env, path.join(output, `${String(checks.length + 1).padStart(2, "0")}-${step.id}.log`));
    checks.push(check);
    if (check.status !== "PASS") break;
  }
  return checks;
}

module.exports = { redact, runCommand, runSequence };
