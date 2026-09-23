"use strict";

const assert = require("node:assert/strict");
const { test } = require("node:test");
const path = require("node:path");
const { parseOptions, databaseTarget, childEnvironment, commandPlan } = require("./local-release-config.cjs");

const options = { stage: "security", source: path.resolve("fixture-source"), output: path.resolve("fixture-output"), node22: process.execPath, node24: process.execPath };
const argv = (extra = []) => ["--stage=security", `--source=${options.source}`, `--output=${options.output}`, `--node22=${process.execPath}`, ...extra];

test("CLI only accepts explicit fixed stages, paths and runtime selection", () => {
  assert.equal(parseOptions(argv()).stage, "security");
  for (const extra of [["--command=echo PASS"], ["--status=PASS"], ["--stage=quality"], ["--timeout=0"]]) {
    assert.throws(() => parseOptions(argv(extra)), /option/);
  }
  assert.throws(() => parseOptions(["--stage=anything"]), /Select/);
  assert.throws(() => parseOptions(["--stage=quality", "--source=relative", `--output=${options.output}`, `--node24=${process.execPath}`]), /absolute/);
  assert.throws(() => parseOptions(["--stage=contracts", `--source=${options.source}`, `--output=${options.output}`, `--node22=${process.execPath}`]), /psql/);
});

test("database guards refuse production names, remote hosts and query overrides", () => {
  assert.equal(databaseTarget("postgresql://postgres:postgres@127.0.0.1:5555/build_test", "fixture").name, "build_test");
  for (const url of ["postgresql://postgres:postgres@remote.invalid/build_test", "postgresql://postgres:postgres@localhost/production", "postgresql://postgres:postgres@localhost/build_test?host=remote.invalid", "postgresql://postgres:postgres@localhost/build_test#x", "postgresql://localhost/build_test", "not-a-url", "postgresql://postgres:postgres@localhost/a%2Fb_test"]) {
    assert.throws(() => databaseTarget(url, "fixture"));
  }
  assert.throws(() => databaseTarget("postgresql://postgres:postgres@localhost/postgres", "fixture"));
  assert.equal(databaseTarget("postgresql://postgres:postgres@localhost/postgres", "fixture", true).name, "postgres");
});

test("child environment excludes inherited credentials, Node flags and npm auth", () => {
  const env = childEnvironment(options, { PATH: "fixture-path", NODE_OPTIONS: "--require=evil", GH_TOKEN: "secret", PRODUCTION_DATABASE_URL: "secret", npm_config_registry: "secret", DATABASE_URL: "secret", GITHUB_OUTPUT: "secret" });
  for (const key of ["NODE_OPTIONS", "GH_TOKEN", "PRODUCTION_DATABASE_URL", "npm_config_registry", "GITHUB_OUTPUT"]) assert.equal(env[key], undefined);
  assert.notEqual(env.DATABASE_URL, "secret");
  assert.ok(env.PATH.startsWith(path.dirname(process.execPath)));
  assert.equal(env.npm_config_userconfig, path.join(options.output, "empty.npmrc"));
});

test("quality requires two explicit separate dedicated databases", () => {
  const quality = { ...options, stage: "quality" };
  assert.throws(() => childEnvironment(quality, {}), /PostgreSQL URL/);
  const build = "postgresql://postgres:postgres@localhost/build_test";
  assert.throws(() => childEnvironment(quality, { MKT_LOCAL_BUILD_DATABASE_URL: build, MKT_LOCAL_TEST_DATABASE_URL: build }), /distinct/);
  const env = childEnvironment(quality, { MKT_LOCAL_BUILD_DATABASE_URL: build, MKT_LOCAL_TEST_DATABASE_URL: "postgresql://postgres:postgres@localhost/unit_test" });
  assert.equal(env.DATABASE_URL, build);
  assert.match(env.TEST_DATABASE_URL, /unit_test$/);
});

test("fixed plans retain quality, PostgreSQL, security and exact Relay checks", () => {
  const plan = (stage) => commandPlan({ ...options, stage }, "fixed-npm-cli");
  const relay = plan("relay");
  assert.deepEqual(plan("quality").map((step) => step.id), ["dependencies", "database-preflight", "generate", "migrations", "lint", "typecheck", "local-validation-tests", "tests", "critical-coverage", "build"]);
  assert.deepEqual(plan("contracts").map((step) => step.id), ["dependencies", "database-preflight", "postgres-contracts"]);
  assert.deepEqual(relay.map((step) => step.id), ["dependencies", "relay-tests", "relay-sea-tls-fixture", "relay-build", "relay-verify"]);
  assert.deepEqual(plan("security")[0].args.slice(1), ["plans", "docs", "src", "relay", "scripts", ".github"].map((root) => `--root=${root}`));
  const tlsFixture = relay.find((step) => step.id === "relay-sea-tls-fixture");
  const build = relay.find((step) => step.id === "relay-build");
  const verify = relay.find((step) => step.id === "relay-verify");
  assert.deepEqual(tlsFixture?.args.slice(-2), ["run", "relay:verify-tls"]);
  assert.equal(tlsFixture?.timeoutMs, 5 * 60_000);
  assert.ok(build?.args.includes("--web-origin=https://ci.invalid"));
  assert.ok(verify?.args.includes("--metadata=relay/dist/MKTTool-Relay.metadata.json"));
  assert.ok(verify?.args.includes("--archive=relay/dist/MKTTool-Relay.zip"));
  for (const stage of ["quality", "contracts", "relay", "security"]) {
    assert.ok(plan(stage).every((step) => step.timeoutMs > 0 && step.timeoutMs <= 20 * 60_000));
  }
});
