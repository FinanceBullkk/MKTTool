#!/usr/bin/env node
"use strict";

/**
 * Emit one CI gate result in a format that both humans and automation can consume.
 *
 * A gate is deliberately fail-closed: only PASS returns exit code zero. OPEN, BLOCKED,
 * SKIPPED, and FAIL are useful evidence, but none of them can satisfy a required check.
 */
const { appendFileSync } = require("node:fs");
const { randomUUID } = require("node:crypto");

const STATUSES = new Set(["PASS", "FAIL", "OPEN", "BLOCKED", "SKIPPED"]);

function field(value, name) {
  if (typeof value !== "string" || value.trim() === "") {
    throw new Error(`${name} must be a non-empty string.`);
  }
  const normalized = value.trim();
  if (/\0/.test(normalized) || /[\r\n]/.test(normalized)) {
    throw new Error(`${name} must not contain control characters or newlines.`);
  }
  return normalized;
}

function makeRecord(input) {
  const gate = field(input.gate, "gate");
  if (!/^[A-Za-z0-9][A-Za-z0-9._/-]*$/.test(gate)) {
    throw new Error("gate contains an unsupported character.");
  }
  const status = field(input.status, "status");
  if (!STATUSES.has(status)) {
    throw new Error(`status must be one of ${[...STATUSES].join(", ")}.`);
  }
  return Object.freeze({
    gate,
    status,
    reason: field(input.reason, "reason"),
    owner: field(input.owner, "owner"),
  });
}

function appendOutput(filePath, record) {
  if (!filePath) return;
  const json = JSON.stringify(record);
  const delimiter = `GATE_${randomUUID().replaceAll("-", "")}`;
  appendFileSync(
    filePath,
    [
      `gate=${record.gate}`,
      `status=${record.status}`,
      `gate_status=${record.status}`,
      `reason=${record.reason}`,
      `owner=${record.owner}`,
      `result<<${delimiter}`,
      json,
      delimiter,
      "",
    ].join("\n"),
    "utf8",
  );
}

function appendSummary(filePath, record) {
  const json = JSON.stringify(record, null, 2);
  if (!filePath) {
    // Local runs do not have GitHub's file commands. Keep the same machine-readable record visible.
    process.stdout.write(`${JSON.stringify(record)}\n`);
    return;
  }
  appendFileSync(
    filePath,
    [
      `### CI gate: ${record.gate}`,
      "",
      `- **Status:** \`${record.status}\``,
      `- **Reason:** ${record.reason}`,
      `- **Owner:** ${record.owner}`,
      "",
      "```json",
      json,
      "```",
      "",
    ].join("\n"),
    "utf8",
  );
}

function emitGate(input, options = {}) {
  const record = makeRecord(input);
  appendSummary(process.env.GITHUB_STEP_SUMMARY, record);
  appendOutput(process.env.GITHUB_OUTPUT, record);
  if (options.exit !== false && record.status !== "PASS") {
    process.exitCode = 1;
  }
  return record;
}

function parseArgs(argv) {
  const values = {};
  for (let index = 0; index < argv.length; index += 1) {
    const argument = argv[index];
    if (!argument.startsWith("--")) throw new Error(`Unexpected argument ${argument}.`);
    const equals = argument.indexOf("=");
    const name = (equals >= 0 ? argument.slice(0, equals) : argument).slice(2);
    if (!["gate", "status", "reason", "owner"].includes(name)) {
      throw new Error(`Unknown option --${name}.`);
    }
    const value = equals >= 0 ? argument.slice(equals + 1) : argv[++index];
    if (value === undefined) throw new Error(`--${name} needs a value.`);
    values[name] = value;
  }
  return values;
}

if (require.main === module) {
  try {
    const record = emitGate(parseArgs(process.argv.slice(2)));
    // Keep local callers able to inspect the exact record without scraping Markdown.
    if (process.env.GITHUB_STEP_SUMMARY) process.stdout.write(`${JSON.stringify(record)}\n`);
  } catch (error) {
    console.error(error instanceof Error ? error.message : "Could not emit CI gate status.");
    process.exitCode = 2;
  }
}

module.exports = { STATUSES, emitGate, makeRecord };
