#!/usr/bin/env node
"use strict";

const { existsSync, realpathSync, writeFileSync } = require("node:fs");
const path = require("node:path");
const { STAGES, parseOptions, childEnvironment, commandPlan } = require("./local-release-config.cjs");
const { createOutput, inspectNode, snapshotSource, sameSource, sha256, assertLogIntegrity } = require("./local-release-provenance.cjs");
const { runSequence } = require("./local-release-process.cjs");

function verdict(plan, checks, before, after) {
  if (!plan.length || !sameSource(before, after)) return "BLOCKED";
  if (checks.some((check) => check.status === "FAIL")) return "FAIL";
  if (checks.length !== plan.length || checks.some((check, index) => check.id !== plan[index].id ||
      check.command !== plan[index].command || JSON.stringify(check.args) !== JSON.stringify(plan[index].args) ||
      !/^[a-f0-9]{64}$/.test(check.logSha256 || "") || check.status !== "PASS" || check.exitCode !== 0 ||
      check.interrupted || check.cleanupConfirmed !== null)) return "BLOCKED";
  return "PASS";
}

async function run(options) {
  const source = realpathSync(options.source);
  if (source !== realpathSync(path.resolve(__dirname, "../.."))) throw new Error("Run the runner belonging to the selected frozen checkout.");
  const output = createOutput(source, options.output);
  const receipt = { schemaVersion: 1, scope: "mkttool-local-validation-only", releaseApproved: false,
    stage: options.stage, status: "BLOCKED", startedAt: new Date().toISOString(), host: { platform: process.platform, arch: process.arch }, checks: [],
    limits: ["Command exit does not attest descendant-process cleanup; cleanupConfirmed is not observed.", "Timeout termination is best effort and cannot pass validation.", "VM, installed lifecycle, network, operator and release approval are separate evidence."] };
  let before;
  let after;
  let plan = [];
  try {
    before = snapshotSource(source);
    if (options.stage === "relay" && process.platform !== "win32") throw new Error("Relay validation requires Windows.");
    if (options.stage !== "security" && existsSync(path.join(source, "node_modules"))) {
      throw new Error("Install stages require a fresh isolated checkout without node_modules; shared dependencies are never replaced.");
    }
    const toolchain = inspectNode(options[`node${STAGES[options.stage]}`], STAGES[options.stage]);
    options = { ...options, source, output, [`node${STAGES[options.stage]}`]: toolchain.path };
    const env = childEnvironment(options);
    receipt.toolchain = toolchain;
    writeFileSync(path.join(output, "empty.npmrc"), "", { flag: "wx" });
    plan = commandPlan(options, toolchain.npmCli);
    receipt.requiredChecks = plan.map((step) => step.id);
    receipt.checks = await runSequence(plan, source, env, output);
    assertLogIntegrity(receipt.checks, output);
    if (sha256(toolchain.path) !== toolchain.sha256 || sha256(toolchain.npmCli) !== toolchain.npmCliSha256) throw new Error("Selected toolchain changed during validation.");
    after = snapshotSource(source);
    receipt.status = verdict(plan, receipt.checks, before, after);
    if (receipt.status === "PASS" && options.stage === "relay") {
      receipt.artifacts = ["relay/dist/MKTTool-Relay.zip", "relay/dist/MKTTool-Relay.metadata.json"].map((file) => ({ path: file, sha256: sha256(path.join(source, file)) }));
    }
  } catch {
    receipt.status = "BLOCKED";
    receipt.reason = "Preflight, source integrity, required artifact or process execution unavailable; inspect bounded stage logs.";
    try { after = snapshotSource(source); } catch { /* Missing after-state cannot pass. */ }
  }
  receipt.source = { before: before || null, after: after || null };
  receipt.finishedAt = new Date().toISOString();
  const receiptPath = path.join(output, "receipt.json");
  writeFileSync(receiptPath, `${JSON.stringify(receipt, null, 2)}\n`, { flag: "wx", mode: 0o600 });
  const receiptSha256 = sha256(receiptPath);
  writeFileSync(path.join(output, "receipt.sha256"), `${receiptSha256}\n`, { flag: "wx" });
  return { status: receipt.status, stage: receipt.stage, releaseApproved: false, receiptPath, receiptSha256 };
}

if (require.main === module) {
  Promise.resolve().then(() => run(parseOptions(process.argv.slice(2)))).then((result) => {
    process.stdout.write(`${JSON.stringify(result)}\n`);
    process.exitCode = result.status === "PASS" ? 0 : 1;
  }).catch(() => {
    process.stderr.write("Local validation could not start. Supply an explicit stage, frozen source, selected Node and new external output directory.\n");
    process.exitCode = 1;
  });
}

module.exports = { verdict, run };
