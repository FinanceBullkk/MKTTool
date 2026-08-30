#!/usr/bin/env node
"use strict";

/**
 * Run the restore and Better Auth rate-limit contracts against one disposable PostgreSQL service.
 *
 * This runner refuses to substitute mocks. If Node 22, `pg`, `psql`, or a reachable PostgreSQL
 * service is unavailable, it records BLOCKED and exits non-zero so a required check cannot turn
 * an environment gap into a false PASS.
 */
const { spawn, spawnSync } = require("node:child_process");
const { randomBytes } = require("node:crypto");
const { existsSync } = require("node:fs");
const path = require("node:path");
const { emitGate } = require("./gate-status.cjs");

const GATE = "mkttool-postgres-contracts";
const FIXTURE = path.join(__dirname, "fixtures", "restore-contract.sql");

function finish(status, reason) {
  emitGate({ gate: GATE, status, reason, owner: "mkttool-ci" }, { exit: false });
  process.exitCode = status === "PASS" ? 0 : 1;
}

function parseUrl(raw, label) {
  let url;
  try {
    url = new URL(raw);
  } catch {
    throw new Error(`${label} is not a valid PostgreSQL URL.`);
  }
  if (url.protocol !== "postgres:" && url.protocol !== "postgresql:") {
    throw new Error(`${label} must use postgresql://.`);
  }
  const database = decodeURIComponent(url.pathname.replace(/^\//, ""));
  if (!database) throw new Error(`${label} is missing a database name.`);
  return { url, database };
}

function withDatabase(url, database) {
  const next = new URL(url.toString());
  next.pathname = `/${encodeURIComponent(database)}`;
  return next.toString();
}

function quoteIdentifier(identifier) {
  return `"${identifier.replaceAll('"', '""')}"`;
}

function disposableName(prefix) {
  return `${prefix}_${Date.now()}_${randomBytes(4).toString("hex")}`.slice(0, 63);
}

function postgresToolEnv(raw) {
  const parsed = new URL(raw);
  const env = {
    ...process.env,
    PGHOST: parsed.hostname,
    PGPORT: parsed.port || "5432",
    PGDATABASE: decodeURIComponent(parsed.pathname.replace(/^\//, "")),
  };
  if (parsed.username) env.PGUSER = decodeURIComponent(parsed.username);
  if (parsed.password) env.PGPASSWORD = decodeURIComponent(parsed.password);
  const sslmode = parsed.searchParams.get("sslmode");
  if (sslmode) env.PGSSLMODE = sslmode;
  return env;
}

function commandWorks(command) {
  const result = spawnSync(command, ["--version"], { stdio: "ignore", windowsHide: true });
  return result.status === 0;
}

function runPsql(psql, rawUrl, database, file) {
  return new Promise((resolve, reject) => {
    const child = spawn(
      psql,
      ["--no-psqlrc", "--no-password", "--dbname", database, "--file", file, "--set", "ON_ERROR_STOP=1"],
      { env: postgresToolEnv(withDatabase(new URL(rawUrl), database)), shell: false, windowsHide: true, stdio: "ignore" },
    );
    child.once("error", () => reject(new Error("Could not start psql for the restore fixture.")));
    child.once("close", (code) => (code === 0 ? resolve() : reject(new Error(`psql fixture exited ${code ?? "unknown"}.`))));
  });
}

function runNodeScript(script, args, env) {
  const tsx = path.join(process.cwd(), "node_modules", "tsx", "dist", "cli.mjs");
  if (!existsSync(tsx)) throw new Error("The tsx runtime is unavailable after dependency installation.");
  return new Promise((resolve, reject) => {
    const child = spawn(process.execPath, [tsx, path.resolve(script), ...args], {
      cwd: process.cwd(),
      env: { ...process.env, ...env },
      shell: false,
      windowsHide: true,
      stdio: ["ignore", "pipe", "pipe"],
    });
    let stdout = "";
    let stderr = "";
    child.stdout.on("data", (chunk) => {
      stdout = `${stdout}${chunk.toString()}`.slice(-4000);
    });
    child.stderr.on("data", (chunk) => {
      // Keep only a bounded diagnostic for infrastructure classification; never print it because
      // a provider error could contain a connection string or another secret.
      stderr = `${stderr}${chunk.toString()}`.slice(-4000);
    });
    child.once("error", () => reject(new Error(`Could not start ${path.basename(script)}.`)));
    child.once("close", (code) => resolve({ code: code ?? 1, stdout, stderr }));
  });
}

function looksLikeInfrastructureFailure(message) {
  return /ECONNREFUSED|ENOTFOUND|ETIMEDOUT|timeout|could not connect|connection|authentication failed|role .* does not exist|database .* does not exist|not available|not found|spawn/i.test(message);
}

async function main() {
  if (process.versions.node.split(".")[0] !== "22") {
    finish("BLOCKED", `Node 22 is required for reproducible contracts; current runtime is ${process.version}.`);
    return;
  }
  if (!existsSync(FIXTURE)) {
    finish("BLOCKED", "The deterministic restore fixture is missing from the checkout.");
    return;
  }

  let Client;
  try {
    ({ Client } = require("pg"));
  } catch {
    finish("BLOCKED", "The pg dependency is unavailable; contracts were not replaced with mocks.");
    return;
  }

  const targetRaw = (process.env.CONTRACTS_DATABASE_URL || process.env.TEST_DATABASE_URL || "").trim();
  if (!targetRaw) {
    finish("BLOCKED", "CONTRACTS_DATABASE_URL or TEST_DATABASE_URL is not configured.");
    return;
  }
  let target;
  try {
    target = parseUrl(targetRaw, "Contracts database URL");
  } catch (error) {
    finish("BLOCKED", error.message);
    return;
  }
  const targetHost = target.url.hostname.toLowerCase();
  if (!new Set(["localhost", "127.0.0.1", "::1", "[::1]"]).has(targetHost)) {
    finish("BLOCKED", "Contracts require a local disposable PostgreSQL service; remote targets are refused.");
    return;
  }
  if (process.env.PRODUCTION_DATABASE_URL?.trim()) {
    try {
      const production = parseUrl(process.env.PRODUCTION_DATABASE_URL.trim(), "Production database URL");
      if (
        production.url.hostname.toLowerCase() === targetHost &&
        (production.url.port || "5432") === (target.url.port || "5432")
      ) {
        finish("BLOCKED", "The contracts target shares a PostgreSQL server with PRODUCTION_DATABASE_URL.");
        return;
      }
    } catch {
      finish("BLOCKED", "PRODUCTION_DATABASE_URL is invalid; refusing to guess a safe target.");
      return;
    }
  }
  const psql = (process.env.PSQL_PATH || "psql").trim();
  if (!commandWorks(psql)) {
    finish("BLOCKED", "The configured psql executable is unavailable on this runner.");
    return;
  }

  const sourceDatabase = disposableName("mkttool_restore_source");
  const adminUrl = withDatabase(target.url, "postgres");
  const sourceUrl = withDatabase(target.url, sourceDatabase);
  let admin;
  let sourceCreated = false;
  try {
    admin = new Client({ connectionString: adminUrl, connectionTimeoutMillis: 20_000 });
    await admin.connect();
    await admin.query(`CREATE DATABASE ${quoteIdentifier(sourceDatabase)}`);
    sourceCreated = true;
    await admin.end();
    admin = undefined;

    await runPsql(psql, targetRaw, sourceDatabase, FIXTURE);

    // Keep database credentials out of argv/process listings. The verifier reads these explicit
    // child-only environment variables through its existing production/restore fallbacks.
    const restore = await runNodeScript("scripts/restore-database-verify.ts", [
      `--dump=${FIXTURE}`,
      `--psql-path=${psql}`,
      "--allow-same-server",
    ], {
      DATABASE_URL: targetRaw,
      TEST_DATABASE_URL: targetRaw,
      PRODUCTION_DATABASE_URL: sourceUrl,
      RESTORE_DATABASE_URL: targetRaw,
    });
    if (restore.code !== 0) {
      const status = looksLikeInfrastructureFailure(`${restore.stdout}\n${restore.stderr}`) ? "BLOCKED" : "FAIL";
      finish(status, `Database restore contract exited ${restore.code}; see the sanitized verifier result.`);
      return;
    }

    const rate = await runNodeScript("scripts/verify-better-auth-rate-limit.ts", [], {
      DATABASE_URL: targetRaw,
      TEST_DATABASE_URL: targetRaw,
      BETTER_AUTH_URL: "http://localhost:3000",
      BETTER_AUTH_SECRET: "ci-rate-limit-contract-secret-32-characters-minimum",
      GOOGLE_CLIENT_ID: "ci-rate-limit-contract.apps.invalid",
      GOOGLE_CLIENT_SECRET: "ci-rate-limit-contract-secret",
      TRUSTED_PROXY_IP_HEADERS: "x-forwarded-for",
      TRUSTED_PROXY_CIDRS: "",
      NODE_ENV: "production",
    });
    if (rate.code !== 0) {
      const status = looksLikeInfrastructureFailure(`${rate.stdout}\n${rate.stderr}`) ? "BLOCKED" : "FAIL";
      finish(status, `Rate-limit durability/concurrency contract exited ${rate.code}.`);
      return;
    }

    finish("PASS", "Restore and rate-limit contracts passed against disposable PostgreSQL on Node 22.");
  } catch (error) {
    const message = error instanceof Error ? error.message : "PostgreSQL contract setup failed.";
    finish(looksLikeInfrastructureFailure(message) ? "BLOCKED" : "FAIL", message);
  } finally {
    if (admin) {
      try {
        await admin.end();
      } catch {
        // The cleanup attempt below remains the source of truth.
      }
    }
    if (sourceCreated) {
      let cleanup;
      try {
        cleanup = new Client({ connectionString: adminUrl, connectionTimeoutMillis: 20_000 });
        await cleanup.connect();
        await cleanup.query(`DROP DATABASE IF EXISTS ${quoteIdentifier(sourceDatabase)}`);
      } catch {
        finish("FAIL", "The disposable restore source database could not be removed.");
      } finally {
        if (cleanup) {
          try {
            await cleanup.end();
          } catch {
            // Nothing safe to add to the CI output.
          }
        }
      }
    }
  }
}

main().catch((error) => {
  finish("BLOCKED", error instanceof Error ? error.message : "PostgreSQL contracts could not start.");
});
