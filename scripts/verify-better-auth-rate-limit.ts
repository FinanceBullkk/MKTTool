/**
 * Real-Postgres, two-process verification for Better Auth's production rate limiter.
 *
 * The main process creates a disposable database on TEST_DATABASE_URL, applies the real Prisma
 * migration set, starts two independent Node workers against the same database, and proves that
 * the global limit is atomic and survives worker exit. No operational database is mutated and the
 * disposable database is dropped in `finally`.
 */
import { spawn } from "node:child_process";
import { randomBytes } from "node:crypto";
import path from "node:path";
import { Client } from "pg";

const WORKER_MARKER = "RATE_LIMIT_PROBE_RESULT=";
const SHARED_BUCKET_WARNING = "single shared per-path bucket";
const COMMAND_TIMEOUT_MS = 90_000;
const CLIENT_A = "198.51.100.10";
const CLIENT_B = "203.0.113.20";
const MULTI_HOP = "198.51.100.10, 203.0.113.20";

interface WorkerResult {
  requests: number;
  ok: number;
  throttled: number;
  other: number;
  retryHeaderCount: number;
  sharedBucketWarning: boolean;
}

interface ProbeReport {
  status: "PASS" | "FAIL";
  startedAt: string;
  finishedAt: string;
  durationMs: number;
  node: string;
  migration: "PASS" | "FAIL";
  concurrentWorkers?: { requests: number; ok: number; throttled: number; rowCount: number };
  distinctClient?: { status: number; rowCount: number };
  restart?: { status: number; retryHeader: boolean; persistedCount: number };
  malformedHeaders?: { sharedFallbackCount: number; bypassed: boolean };
  cleanup: "PASS" | "FAIL";
  error?: string;
}

function parseUrl(raw: string, label: string): { url: URL; host: string; port: string; database: string } {
  let url: URL;
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
  return { url, host: url.hostname.toLowerCase(), port: url.port || "5432", database };
}

function withDatabase(url: URL, database: string): string {
  const next = new URL(url.toString());
  next.pathname = `/${encodeURIComponent(database)}`;
  return next.toString();
}

function quoteIdentifier(identifier: string): string {
  return `"${identifier.replaceAll('"', '""')}"`;
}

function disposableName(): string {
  return `mkttool_rate_limit_${Date.now()}_${randomBytes(4).toString("hex")}`.slice(0, 63);
}

async function connect(raw: string): Promise<Client> {
  const client = new Client({ connectionString: raw, connectionTimeoutMillis: 20_000 });
  await client.connect();
  return client;
}

async function close(client: Client | undefined): Promise<void> {
  if (!client) return;
  try {
    await client.end();
  } catch {
    // The database drop below is the cleanup gate of record.
  }
}

function runProcess(
  command: string,
  args: string[],
  env: NodeJS.ProcessEnv,
): Promise<{ stdout: string; stderr: string }> {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, {
      cwd: process.cwd(),
      env,
      shell: false,
      windowsHide: true,
      stdio: ["ignore", "pipe", "pipe"],
    });
    let stdout = "";
    let stderr = "";
    const append = (current: string, chunk: Buffer) => (current + chunk.toString()).slice(-1_000_000);
    child.stdout.on("data", (chunk: Buffer) => {
      stdout = append(stdout, chunk);
    });
    child.stderr.on("data", (chunk: Buffer) => {
      stderr = append(stderr, chunk);
    });
    let settled = false;
    const timer = setTimeout(() => {
      if (settled) return;
      settled = true;
      child.kill();
      reject(new Error("Rate-limit probe process timed out."));
    }, COMMAND_TIMEOUT_MS);
    timer.unref();
    child.on("error", () => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      reject(new Error("Could not start a rate-limit probe process."));
    });
    child.on("close", (code) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      if (code === 0) resolve({ stdout, stderr });
      else reject(new Error(`Rate-limit probe process exited ${code ?? "unknown"}.`));
    });
  });
}

async function migrate(databaseUrl: string): Promise<void> {
  const prismaCli = path.join(process.cwd(), "node_modules", "prisma", "build", "index.js");
  await runProcess(process.execPath, [prismaCli, "migrate", "deploy"], {
    ...process.env,
    DATABASE_URL: databaseUrl,
  });
}

function parseWorkerResult(output: { stdout: string; stderr: string }): WorkerResult {
  const line = output.stdout
    .split(/\r?\n/)
    .findLast((candidate) => candidate.startsWith(WORKER_MARKER));
  if (!line) throw new Error("Rate-limit worker returned no result marker.");
  const result = JSON.parse(line.slice(WORKER_MARKER.length)) as WorkerResult;
  return {
    ...result,
    sharedBucketWarning:
      result.sharedBucketWarning ||
      output.stdout.includes(SHARED_BUCKET_WARNING) ||
      output.stderr.includes(SHARED_BUCKET_WARNING),
  };
}

async function runWorker(databaseUrl: string, header: string, requests: number): Promise<WorkerResult> {
  const tsxCli = path.join(process.cwd(), "node_modules", "tsx", "dist", "cli.mjs");
  const output = await runProcess(process.execPath, [tsxCli, path.resolve(import.meta.filename)], {
    ...process.env,
    DATABASE_URL: databaseUrl,
    BETTER_AUTH_URL: "http://localhost:3000",
    BETTER_AUTH_SECRET: "rate-limit-probe-secret-with-more-than-thirty-two-characters",
    GOOGLE_CLIENT_ID: "rate-limit-probe.apps.invalid",
    GOOGLE_CLIENT_SECRET: "rate-limit-probe-secret",
    TRUSTED_PROXY_IP_HEADERS: "x-forwarded-for",
    TRUSTED_PROXY_CIDRS: "",
    NODE_ENV: "production",
    RATE_LIMIT_PROBE_WORKER: "1",
    RATE_LIMIT_PROBE_HEADER: header,
    RATE_LIMIT_PROBE_REQUESTS: String(requests),
  });
  return parseWorkerResult(output);
}

async function workerMain(): Promise<void> {
  const header = process.env.RATE_LIMIT_PROBE_HEADER ?? "";
  const requests = Number(process.env.RATE_LIMIT_PROBE_REQUESTS ?? "0");
  if (!Number.isSafeInteger(requests) || requests <= 0) throw new Error("Invalid worker request count.");
  const warnings: string[] = [];
  const originalWarn = console.warn;
  console.warn = (...values: unknown[]) => {
    warnings.push(values.map(String).join(" "));
  };
  try {
    const { getAuth } = await import("../src/lib/auth/auth-server");
    const responses = await Promise.all(
      Array.from({ length: requests }, () =>
        getAuth().handler(
          new Request("http://localhost:3000/api/auth/ok", {
            headers: { "x-forwarded-for": header },
          }),
        ),
      ),
    );
    const result: WorkerResult = {
      requests,
      ok: responses.filter((response) => response.status === 200).length,
      throttled: responses.filter((response) => response.status === 429).length,
      other: responses.filter((response) => response.status !== 200 && response.status !== 429).length,
      retryHeaderCount: responses.filter((response) => response.headers.has("x-retry-after")).length,
      sharedBucketWarning: warnings.some((warning) => warning.includes(SHARED_BUCKET_WARNING)),
    };
    console.log(`${WORKER_MARKER}${JSON.stringify(result)}`);
    const { prisma } = await import("../src/lib/db/prisma-client");
    await prisma.$disconnect();
  } finally {
    console.warn = originalWarn;
  }
}

async function rowCount(client: Client, key: string): Promise<number> {
  const result = await client.query<{ count: number }>(
    'SELECT "count" FROM "RateLimit" WHERE "key" = $1',
    [key],
  );
  return Number(result.rows[0]?.count ?? 0);
}

async function main(): Promise<void> {
  if (process.versions.node.split(".")[0] !== "22") {
    throw new Error(`Node 22 is required; current runtime is ${process.version}.`);
  }
  const startedAt = new Date();
  const startedMs = Date.now();
  const report: ProbeReport = {
    status: "FAIL",
    startedAt: startedAt.toISOString(),
    finishedAt: startedAt.toISOString(),
    durationMs: 0,
    node: process.version,
    migration: "FAIL",
    cleanup: "PASS",
  };
  const targetRaw = process.env.RESTORE_DATABASE_URL?.trim() || process.env.TEST_DATABASE_URL?.trim();
  if (!targetRaw) throw new Error("RESTORE_DATABASE_URL or TEST_DATABASE_URL is required.");
  const target = parseUrl(targetRaw, "Restore target URL");
  const productionRaw = process.env.PRODUCTION_DATABASE_URL?.trim();
  if (productionRaw) {
    const production = parseUrl(productionRaw, "Production URL");
    if (production.host === target.host && production.port === target.port) {
      throw new Error("The rate-limit probe target must not be the production PostgreSQL server.");
    }
  }
  const database = disposableName();
  const adminUrl = withDatabase(target.url, "postgres");
  const databaseUrl = withDatabase(target.url, database);
  let admin: Client | undefined;
  let probe: Client | undefined;
  let created = false;

  try {
    admin = await connect(adminUrl);
    await admin.query(`CREATE DATABASE ${quoteIdentifier(database)}`);
    created = true;
    await close(admin);
    admin = undefined;
    await migrate(databaseUrl);
    report.migration = "PASS";

    const workers = await Promise.all([
      runWorker(databaseUrl, CLIENT_A, 60),
      runWorker(databaseUrl, CLIENT_A, 60),
    ]);
    const totals = workers.reduce(
      (sum, worker) => ({
        requests: sum.requests + worker.requests,
        ok: sum.ok + worker.ok,
        throttled: sum.throttled + worker.throttled,
        other: sum.other + worker.other,
        retry: sum.retry + worker.retryHeaderCount,
      }),
      { requests: 0, ok: 0, throttled: 0, other: 0, retry: 0 },
    );
    if (workers.some((worker) => worker.sharedBucketWarning)) {
      throw new Error("A valid forwarded IP unexpectedly used Better Auth's shared bucket.");
    }
    probe = await connect(databaseUrl);
    const primaryCount = await rowCount(probe, `${CLIENT_A}|/ok`);
    report.concurrentWorkers = {
      requests: totals.requests,
      ok: totals.ok,
      throttled: totals.throttled,
      rowCount: primaryCount,
    };
    if (totals.ok !== 100 || totals.throttled !== 20 || totals.other !== 0 || totals.retry !== 20 || primaryCount !== 100) {
      throw new Error("Two-process atomic limit did not allow exactly 100 of 120 requests.");
    }

    const distinct = await runWorker(databaseUrl, CLIENT_B, 1);
    const secondaryCount = await rowCount(probe, `${CLIENT_B}|/ok`);
    report.distinctClient = { status: distinct.ok === 1 ? 200 : 429, rowCount: secondaryCount };
    if (distinct.ok !== 1 || secondaryCount !== 1 || distinct.sharedBucketWarning) {
      throw new Error("A distinct client did not receive an independent bucket.");
    }

    const restart = await runWorker(databaseUrl, CLIENT_A, 1);
    const persistedCount = await rowCount(probe, `${CLIENT_A}|/ok`);
    report.restart = {
      status: restart.throttled === 1 ? 429 : 200,
      retryHeader: restart.retryHeaderCount === 1,
      persistedCount,
    };
    if (restart.throttled !== 1 || restart.retryHeaderCount !== 1 || persistedCount !== 100) {
      throw new Error("Rate-limit state did not survive a worker restart.");
    }

    const malformed = await Promise.all([
      runWorker(databaseUrl, MULTI_HOP, 1),
      runWorker(databaseUrl, "not-an-ip", 1),
    ]);
    const fallbackCount = await rowCount(probe, "no-trusted-ip|/ok");
    report.malformedHeaders = {
      sharedFallbackCount: fallbackCount,
      bypassed: malformed.some((result) => result.other !== 0) || fallbackCount !== 2,
    };
    if (fallbackCount !== 2 || malformed.some((result) => result.other !== 0)) {
      throw new Error("Malformed or multi-hop headers selected an unexpected bucket.");
    }

    report.status = "PASS";
  } catch (error) {
    report.error = error instanceof Error ? error.message : "Rate-limit probe failed.";
  } finally {
    await close(probe);
    await close(admin);
    if (created) {
      try {
        admin = await connect(adminUrl);
        await admin.query(`DROP DATABASE IF EXISTS ${quoteIdentifier(database)}`);
      } catch {
        report.cleanup = "FAIL";
        report.status = "FAIL";
      } finally {
        await close(admin);
      }
    }
    report.finishedAt = new Date().toISOString();
    report.durationMs = Date.now() - startedMs;
  }
  console.log(JSON.stringify(report, null, 2));
  if (report.status !== "PASS") process.exitCode = 1;
}

if (process.env.RATE_LIMIT_PROBE_WORKER === "1") {
  workerMain().catch((error) => {
    console.error(error instanceof Error ? error.message : "Rate-limit worker failed.");
    process.exitCode = 1;
  });
} else {
  main().catch((error) => {
    console.error(error instanceof Error ? error.message : "Rate-limit probe failed.");
    process.exitCode = 1;
  });
}

