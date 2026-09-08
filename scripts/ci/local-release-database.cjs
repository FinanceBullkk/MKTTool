"use strict";

const path = require("node:path");
const { databaseTarget } = require("./local-release-config.cjs");

async function verifyDatabases(stage, env, Client) {
  if (!["quality", "contracts"].includes(stage)) throw new Error("Unknown database preflight stage.");
  const expectedMajor = stage === "quality" ? 17 : 16;
  const targets = stage === "quality"
    ? [databaseTarget(env.DATABASE_URL, "Build database"), databaseTarget(env.TEST_DATABASE_URL, "Test database")]
    : [databaseTarget(env.CONTRACTS_DATABASE_URL, "Contracts database", true)];
  if (targets.length === 2 && targets[0].name === targets[1].name && targets[0].port === targets[1].port) {
    throw new Error("Build and test databases must be distinct.");
  }
  for (const target of targets) {
    const client = new Client({ connectionString: target.raw, connectionTimeoutMillis: 10_000, query_timeout: 10_000 });
    try {
      await client.connect();
      const version = await client.query("SHOW server_version_num");
      if (Math.floor(Number(version.rows[0]?.server_version_num) / 10_000) !== expectedMajor) {
        throw new Error(`This stage requires PostgreSQL ${expectedMajor}.`);
      }
      // Refuse any pre-existing application schema before migrations or DROP SCHEMA can run.
      const objects = await client.query("SELECT count(*)::int AS count FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace WHERE n.nspname NOT IN ('pg_catalog', 'information_schema') AND n.nspname NOT LIKE 'pg_toast%' AND n.nspname NOT LIKE 'pg_temp_%'");
      if (objects.rows[0]?.count !== 0) throw new Error("Database is not empty; existing data is never a validation target.");
    } finally {
      await client.end();
    }
  }
}

if (require.main === module) {
  const { emitGate } = require("./gate-status.cjs");
  let Client;
  try { ({ Client } = require(path.join(process.cwd(), "node_modules", "pg"))); } catch { /* Classified below. */ }
  Promise.resolve().then(() => {
    if (!Client) throw new Error("PostgreSQL dependency unavailable.");
    return verifyDatabases(process.argv[2], process.env, Client);
  }).then(() => emitGate({ gate: "local-database-preflight", status: "PASS", reason: "Expected local PostgreSQL major and empty databases verified.", owner: "local-validator" }))
    .catch(() => emitGate({ gate: "local-database-preflight", status: "BLOCKED", reason: "Local disposable database preflight failed; no migration or reset was run.", owner: "local-validator" }));
}

module.exports = { verifyDatabases };
