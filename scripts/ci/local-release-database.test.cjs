"use strict";

const assert = require("node:assert/strict");
const { test } = require("node:test");
const { verifyDatabases } = require("./local-release-database.cjs");

function fixture(version = "170005", count = 0) {
  const calls = [];
  class Client {
    async connect() { calls.push("connect"); }
    async query(sql) {
      calls.push(sql);
      return sql.startsWith("SHOW") ? { rows: [{ server_version_num: version }] } : { rows: [{ count }] };
    }
    async end() { calls.push("end"); }
  }
  return { Client, calls };
}
const env = { DATABASE_URL: "postgresql://postgres:postgres@localhost/build_test", TEST_DATABASE_URL: "postgresql://postgres:postgres@localhost/unit_test", CONTRACTS_DATABASE_URL: "postgresql://postgres:postgres@localhost/postgres" };

test("database preflight is read-only and checks both empty quality databases", async () => {
  const stub = fixture();
  await verifyDatabases("quality", env, stub.Client);
  assert.equal(stub.calls.filter((call) => call === "connect").length, 2);
  assert.equal(stub.calls.filter((call) => call === "end").length, 2);
  assert.ok(stub.calls.every((call) => /^(connect|end|SHOW |SELECT )/.test(call)));
});

test("wrong PostgreSQL major and populated schemas never reach a mutation", async () => {
  for (const stub of [fixture("160010"), fixture("170005", 1)]) {
    await assert.rejects(verifyDatabases("quality", env, stub.Client));
    assert.equal(stub.calls.at(-1), "end");
    assert.equal(stub.calls.filter((call) => /CREATE|DROP|ALTER|INSERT/i.test(call)).length, 0);
  }
  await verifyDatabases("contracts", env, fixture("160010").Client);
  await assert.rejects(verifyDatabases("contracts", env, fixture("170005").Client), /PostgreSQL 16/);
});

test("unsafe and shared database targets fail before connecting", async () => {
  const stub = fixture();
  await assert.rejects(verifyDatabases("quality", { ...env, TEST_DATABASE_URL: env.DATABASE_URL }, stub.Client), /distinct/);
  await assert.rejects(verifyDatabases("quality", { ...env, DATABASE_URL: "postgresql://postgres:postgres@localhost/production" }, stub.Client), /_test/);
  assert.deepEqual(stub.calls, []);
});
