"use strict";

const { createHash } = require("node:crypto");
const { execFileSync } = require("node:child_process");
const { existsSync, lstatSync, mkdirSync, readdirSync, readFileSync, realpathSync } = require("node:fs");
const path = require("node:path");

function sha256(file) { return createHash("sha256").update(readFileSync(file)).digest("hex"); }

function within(parent, child) {
  const relative = path.relative(parent, child);
  return relative === "" || (!relative.startsWith(`..${path.sep}`) && relative !== ".." && !path.isAbsolute(relative));
}

function createOutput(source, output) {
  const canonicalSource = realpathSync(source);
  const parent = realpathSync(path.dirname(output));
  const canonicalOutput = path.join(parent, path.basename(output));
  if (within(canonicalSource, canonicalOutput) || within(canonicalOutput, canonicalSource)) {
    throw new Error("Output must be outside source, not an ancestor of it.");
  }
  mkdirSync(canonicalOutput, { mode: 0o700 }); // Exclusive directory: never reuse stale logs or receipts.
  return canonicalOutput;
}

function snapshotSource(source) {
  const root = realpathSync(source);
  const git = (...args) => execFileSync("git", ["-C", root, ...args], {
    encoding: "utf8", windowsHide: true, timeout: 15_000, stdio: ["ignore", "pipe", "pipe"],
    env: { ...process.env, GIT_OPTIONAL_LOCKS: "0" },
  }).trim();
  if (realpathSync(git("rev-parse", "--show-toplevel")) !== root) throw new Error("Source must be the repository root.");
  const status = git("status", "--porcelain=v1", "--untracked-files=all");
  if (readdirSync(root).some((name) => /^\.env(?:\.|$)/.test(name) && name !== ".env.example")) {
    throw new Error("Local environment files are refused; use an isolated checkout.");
  }
  const lock = path.join(root, "package-lock.json");
  if (lstatSync(lock).isSymbolicLink()) throw new Error("Lockfile must not be a symbolic link.");
  return sourceIdentity({ status, commit: git("rev-parse", "HEAD"), tree: git("rev-parse", "HEAD^{tree}"), lockfileSha256: sha256(lock), packageSha256: sha256(path.join(root, "package.json")) });
}

function sourceIdentity({ status, commit, tree, lockfileSha256, packageSha256 }) {
  if (status !== "") throw new Error("Source is dirty; freeze an isolated clean checkout first.");
  if (![commit, tree].every((value) => typeof value === "string" && /^(?:[a-f0-9]{40}|[a-f0-9]{64})$/.test(value)) ||
      ![lockfileSha256, packageSha256].every((value) => typeof value === "string" && /^[a-f0-9]{64}$/.test(value))) {
    throw new Error("Source identity is incomplete.");
  }
  return { commit, tree, lockfileSha256, packageSha256 };
}

function sameSource(before, after) {
  try {
    sourceIdentity({ ...before, status: "" });
    sourceIdentity({ ...after, status: "" });
    return ["commit", "tree", "lockfileSha256", "packageSha256"].every((key) => before[key] === after[key]);
  } catch { return false; }
}

function inspectNode(executable, major) {
  const node = realpathSync(executable);
  const version = execFileSync(node, ["--version"], { encoding: "utf8", timeout: 15_000, windowsHide: true }).trim();
  if (!new RegExp(`^v${major}\\.\\d+\\.\\d+$`).test(version)) throw new Error(`Explicit Node ${major} is required.`);
  const candidates = [path.join(path.dirname(node), "node_modules/npm/bin/npm-cli.js"), path.resolve(path.dirname(node), "../lib/node_modules/npm/bin/npm-cli.js")];
  const npmCli = candidates.find(existsSync);
  if (!npmCli) throw new Error("The selected Node installation has no adjacent npm CLI.");
  return { path: node, version, sha256: sha256(node), npmCli: realpathSync(npmCli), npmCliSha256: sha256(npmCli) };
}

function assertLogIntegrity(checks, output) {
  for (const check of checks) {
    if (typeof check.log !== "string" || path.basename(check.log) !== check.log) throw new Error("Invalid stage log path.");
    const file = path.join(output, check.log);
    if (lstatSync(file).isSymbolicLink() || sha256(file) !== check.logSha256) throw new Error("Stage log changed after execution.");
  }
}

module.exports = { sha256, within, createOutput, snapshotSource, sourceIdentity, sameSource, inspectNode, assertLogIntegrity };
