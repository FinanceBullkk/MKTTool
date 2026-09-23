"use strict";

const path = require("node:path");

const STAGES = Object.freeze({ quality: 24, contracts: 22, relay: 24, security: 22 });
const SAFE_ENV = ["SystemRoot", "WINDIR", "COMSPEC", "PATHEXT", "TEMP", "TMP", "TMPDIR", "HOME", "USERPROFILE", "LOCALAPPDATA", "APPDATA", "PATH"];

function parseOptions(argv) {
  const options = {};
  for (const arg of argv) {
    const match = /^--(stage|source|output|node22|node24|psql)=(.+)$/.exec(arg);
    if (!match || options[match[1]]) throw new Error("Unknown, duplicate or empty local validation option.");
    options[match[1]] = match[2];
  }
  if (!Object.hasOwn(STAGES, options.stage)) throw new Error("Select quality, contracts, relay or security explicitly.");
  for (const key of ["source", "output", `node${STAGES[options.stage]}`]) {
    if (!options[key] || !path.isAbsolute(options[key])) throw new Error(`${key} must be an explicit absolute path.`);
  }
  if (options.stage === "contracts" && (!options.psql || !path.isAbsolute(options.psql))) {
    throw new Error("Contracts require an explicit absolute psql path.");
  }
  return options;
}

function databaseTarget(raw, label, allowAdmin = false) {
  let url;
  try { url = new URL(raw); } catch { throw new Error(`${label} is not a PostgreSQL URL.`); }
  if (!["postgres:", "postgresql:"].includes(url.protocol) ||
      !["localhost", "127.0.0.1", "[::1]"].includes(url.hostname) || url.search || url.hash) {
    throw new Error(`${label} must use a loopback PostgreSQL URL without query overrides.`);
  }
  let name;
  try { name = decodeURIComponent(url.pathname.slice(1)); } catch { throw new Error(`${label} has an invalid database name.`); }
  if (!/^[a-zA-Z0-9_]+_test$/.test(name) && !(allowAdmin && name === "postgres")) {
    throw new Error(`${label} must name a dedicated _test database.`);
  }
  if (!url.username) throw new Error(`${label} requires an explicit database role.`);
  return { name, port: url.port || "5432", raw: url.toString() };
}

function childEnvironment(options, inherited = process.env) {
  const env = {};
  for (const key of SAFE_ENV) {
    const actual = Object.keys(inherited).find((name) => name.toLowerCase() === key.toLowerCase());
    if (actual) env[key] = inherited[actual];
  }
  env.PATH = `${path.dirname(options[`node${STAGES[options.stage]}`])}${path.delimiter}${env.PATH || ""}`;
  Object.assign(env, {
    CI: "true", NEXT_TELEMETRY_DISABLED: "1", TEAM_TIMEZONE: "Asia/Ho_Chi_Minh",
    VAULT_KEY_SERVER: "27112efee5aeaa94963b0f1f9e0dabcdf2767c34ee483d8dc2c76f61bdd1186d",
    VAULT_KEY_OPERATOR: "a3d1e1576b7746dbd4481fb6fd16b16f7c7381301b8ab9ef8a3f2994c96150dc",
    BETTER_AUTH_URL: "http://localhost:3000", BETTER_AUTH_SECRET: "local-validation-only-secret-at-least-32-characters",
    GOOGLE_CLIENT_ID: "local-validation.apps.invalid", GOOGLE_CLIENT_SECRET: "local-validation-only",
    DATABASE_URL: "postgresql://postgres:postgres@127.0.0.1:5432/local_placeholder_test",
    npm_config_userconfig: path.join(options.output, "empty.npmrc"),
  });
  if (options.stage === "quality") {
    const build = databaseTarget(inherited.MKT_LOCAL_BUILD_DATABASE_URL, "Build database");
    const test = databaseTarget(inherited.MKT_LOCAL_TEST_DATABASE_URL, "Test database");
    if (build.name === test.name && build.port === test.port) throw new Error("Build and test databases must be distinct.");
    env.DATABASE_URL = build.raw;
    env.TEST_DATABASE_URL = test.raw;
  }
  if (options.stage === "contracts") {
    const target = databaseTarget(inherited.MKT_LOCAL_CONTRACTS_DATABASE_URL, "Contracts database", true);
    env.DATABASE_URL = env.TEST_DATABASE_URL = env.CONTRACTS_DATABASE_URL = target.raw;
    env.PSQL_PATH = options.psql;
  }
  return env;
}

function commandPlan(options, npmCli) {
  const node = options[`node${STAGES[options.stage]}`];
  const npm = (id, args, minutes = 20) => ({ id, command: node, args: [npmCli, ...args], timeoutMs: minutes * 60_000 });
  const script = (id, file, args = [], minutes = 20) => ({ id, command: node, args: [file, ...args], timeoutMs: minutes * 60_000 });
  const preflight = () => script("database-preflight", "scripts/ci/local-release-database.cjs", [options.stage], 2);
  if (options.stage === "quality") return [
    npm("dependencies", ["ci"]), preflight(), npm("generate", ["run", "db:generate"]),
    script("migrations", "node_modules/prisma/build/index.js", ["migrate", "deploy"]),
    npm("lint", ["run", "lint"]), npm("typecheck", ["run", "typecheck"]),
    npm("local-validation-tests", ["run", "test:local-validation"]), npm("tests", ["test"]),
    npm("critical-coverage", ["run", "test:critical-coverage"]), npm("build", ["run", "build"]),
  ];
  if (options.stage === "contracts") return [npm("dependencies", ["ci"]), preflight(), script("postgres-contracts", "scripts/ci/run-postgres-contracts.cjs")];
  if (options.stage === "relay") return [
    npm("dependencies", ["ci"]), npm("relay-tests", ["run", "test:relay"]),
    npm("relay-sea-tls-fixture", ["run", "relay:verify-tls"], 5),
    npm("relay-build", ["run", "relay:build", "--", "--web-origin=https://ci.invalid", "--compatibility-floor=1"]),
    npm("relay-verify", ["run", "relay:verify", "--", "--archive=relay/dist/MKTTool-Relay.zip", "--metadata=relay/dist/MKTTool-Relay.metadata.json"]),
  ];
  return [
    script("secret-scan", "scripts/ci/secret-scan.cjs", ["plans", "docs", "src", "relay", "scripts", ".github"].map((root) => `--root=${root}`)),
    npm("dependency-audit", ["run", "audit:production"], 5),
  ];
}

module.exports = { STAGES, parseOptions, databaseTarget, childEnvironment, commandPlan };
