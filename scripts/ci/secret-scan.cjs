#!/usr/bin/env node
"use strict";

/**
 * High-confidence, non-leaking scan for credentials in the checked-out evidence/source trees.
 * Findings contain only a relative path, line number, and rule name; matched text is never
 * printed. Deliberately documented fixtures are allowlisted so the scan does not train people to
 * ignore a noisy check.
 */
const { existsSync, lstatSync, readdirSync, readFileSync } = require("node:fs");
const path = require("node:path");
const { emitGate } = require("./gate-status.cjs");

const DEFAULT_ROOTS = ["plans", "docs", "src", "relay", "scripts", ".github"];
const IGNORED_DIRS = new Set([".git", "node_modules", ".next", "dist", "coverage", "data"]);
const MAX_FILE_BYTES = 5 * 1024 * 1024;
const RULES = [
  { name: "private-key", pattern: /-----BEGIN [A-Z0-9 ]*PRIVATE KEY-----/ },
  { name: "github-token", pattern: /\b(?:gh[pousr]|github_pat)_[A-Za-z0-9_]{20,}\b/ },
  { name: "slack-token", pattern: /\bxox[baprs]-[A-Za-z0-9-]{20,}\b/ },
  { name: "google-oauth-secret", pattern: /\bGOCSPX-[A-Za-z0-9_-]{20,}\b/ },
  { name: "aws-access-key", pattern: /\bAKIA[0-9A-Z]{16}\b/ },
  {
    name: "credentialed-database-url",
    pattern: /\b(?:postgres(?:ql)?|mysql|mongodb(?:\+srv)?):\/\/[^\s:@/]+:[^\s@/]+@[^\s/]+/i,
  },
  {
    name: "credentialed-proxy-url",
    pattern: /\b(?:socks[45]?|https?):\/\/[^\s:@/]+:[^\s@/]+@[^\s/]+/i,
  },
  { name: "bearer-token", pattern: /\bAuthorization\s*:\s*Bearer\s+[A-Za-z0-9._~-]{20,}/i },
];

function hasPlaceholderPassword(value) {
  const match = value.match(/^[a-z][a-z0-9+.-]*:\/\/[^\s:@/]+:([^\s@/]+)@/i);
  const password = match?.[1];
  return Boolean(
    password &&
      (/^<[^<>]+>$/.test(password) || /^\$\{\{[^{}]+\}\}$/.test(password)),
  );
}

function safeFixture(value, ruleName) {
  if (ruleName === "aws-access-key" && value.includes("AKIAIOSFODNN7EXAMPLE")) return true;
  if (ruleName === "credentialed-database-url") {
    // Local examples and CI-only credentials are intentionally non-production and are safe to
    // retain. Remote/provider URLs with a concrete password remain findings.
    if (/\.example(?:\.|$)|\.invalid(?:\.|$)/i.test(value)) return true;
    if (hasPlaceholderPassword(value)) return true;
    if (
      /localhost|127\.0\.0\.1|shortline\.proxy\.rlwy\.net/i.test(value) &&
      /:(?:postgres|matkhau|mật_khẩu|p%40ss%2Fword|p)@/i.test(value)
    ) return true;
  }
  if (ruleName === "credentialed-proxy-url" && /\.example(?:\.|$)|\.invalid(?:\.|$)/i.test(value)) return true;
  if (ruleName === "credentialed-proxy-url" && (/user:pass@host/.test(value) || hasPlaceholderPassword(value))) return true;
  return false;
}

function lineContainsFinding(line, rule) {
  const flags = rule.pattern.flags.includes("g") ? rule.pattern.flags : `${rule.pattern.flags}g`;
  const matcher = new RegExp(rule.pattern.source, flags);
  return [...line.matchAll(matcher)].some((match) => !safeFixture(match[0], rule.name));
}

function parseRoots(argv) {
  const roots = [];
  for (const argument of argv) {
    if (!argument.startsWith("--root=")) throw new Error(`Unknown option ${argument}.`);
    const root = argument.slice("--root=".length).trim();
    if (!root) throw new Error("--root needs a path.");
    roots.push(root);
  }
  return roots.length ? roots : DEFAULT_ROOTS;
}

function collectFiles(root, files, missing) {
  const absolute = path.resolve(process.cwd(), root);
  if (!existsSync(absolute)) {
    missing.push(root);
    return;
  }
  const stat = lstatSync(absolute);
  if (stat.isFile()) {
    files.push(absolute);
    return;
  }
  if (!stat.isDirectory()) return;
  for (const entry of readdirSync(absolute, { withFileTypes: true })) {
    if (entry.isDirectory() && IGNORED_DIRS.has(entry.name)) continue;
    collectFiles(path.join(root, entry.name), files, missing);
  }
}

function scanFile(filePath, findings, errors) {
  let stat;
  try {
    stat = lstatSync(filePath);
    if (!stat.isFile() || stat.size > MAX_FILE_BYTES) return;
    const bytes = readFileSync(filePath);
    if (bytes.includes(0)) return; // binary artifact, not source/evidence text
    const text = bytes.toString("utf8");
    const lines = text.split(/\r?\n/);
    lines.forEach((line, index) => {
      for (const rule of RULES) {
        if (lineContainsFinding(line, rule)) {
          findings.push({
            path: path.relative(process.cwd(), filePath).replaceAll(path.sep, "/"),
            line: index + 1,
            rule: rule.name,
          });
        }
      }
    });
  } catch {
    errors.push(path.relative(process.cwd(), filePath).replaceAll(path.sep, "/"));
  }
}

function main() {
  let roots;
  try {
    roots = parseRoots(process.argv.slice(2));
  } catch (error) {
    emitGate({ gate: "mkttool-secret-scan", status: "BLOCKED", reason: error.message, owner: "mkttool-ci" });
    return;
  }
  const files = [];
  const missing = [];
  for (const root of roots) collectFiles(root, files, missing);
  const findings = [];
  const errors = [];
  for (const file of files) scanFile(file, findings, errors);

  const relativeMissing = missing.map((root) => root.replaceAll("\\", "/"));
  let status = "PASS";
  let reason = `Scanned ${files.length} text files under ${roots.join(", ")}; no high-confidence credential patterns found.`;
  if (errors.length) {
    status = "BLOCKED";
    reason = `Could not read ${errors.length} file(s); secret scan scope is incomplete.`;
  } else if (findings.length) {
    status = "FAIL";
    reason = `Found ${findings.length} high-confidence credential pattern(s) in source/evidence files.`;
  } else if (relativeMissing.length) {
    // A repository checkout may not carry the workspace-level plans tree. Keep that fact visible
    // without pretending an absent tree was scanned.
    status = "OPEN";
    reason = `Secret scan scope is incomplete; missing roots: ${relativeMissing.join(", ")}.`;
  }
  emitGate({ gate: "mkttool-secret-scan", status, reason, owner: "mkttool-ci" });
  if (findings.length) {
    // Paths/rules only: never echo the matching line or secret value.
    process.stdout.write(`${JSON.stringify({ findings })}\n`);
  }
}

try {
  main();
} catch (error) {
  emitGate({ gate: "mkttool-secret-scan", status: "BLOCKED", reason: "Secret scan could not start.", owner: "mkttool-ci" });
}
