/**
 * Restore a dump into a newly-created disposable database and compare aggregate evidence.
 *
 * Usage:
 *   npm run db:restore:verify -- --dump data/backups/mkttool-prod-....sql
 *
 * The source defaults to PRODUCTION_DATABASE_URL (then DATABASE_URL for local rehearsal). The
 * target defaults to RESTORE_DATABASE_URL, TEST_DATABASE_URL, then DATABASE_URL. A target URL is
 * a connection template only: the verifier generates a fresh database name and drops it in a
 * finally block. Pass --allow-same-server only when source and target are deliberately on the
 * same PostgreSQL server and the generated disposable database is acceptable there.
 */
import path from "node:path";
import {
  verifyDatabaseRestore,
  writeRestoreReport,
  type DatabaseAggregate,
  type RestoreVerificationOptions,
} from "../src/lib/db/restore-database-verification";

interface CliOptions {
  dumpPath?: string;
  sourceUrl?: string;
  targetUrl?: string;
  psqlPath?: string;
  reportPath?: string;
  allowSameServer: boolean;
  timeoutMs?: number;
}

function usage(): string {
  return [
    "Usage: npm run db:restore:verify -- --dump <path> [options]",
    "",
    "Options:",
    "  --source-url <url>       Source database (default PRODUCTION_DATABASE_URL/DATABASE_URL)",
    "  --target-url <url>       Disposable target template (default RESTORE_DATABASE_URL/TEST_DATABASE_URL)",
    "  --psql-path <path>       psql executable (default PSQL_PATH/psql)",
    "  --report <path>          Write the sanitized JSON receipt without overwriting an existing file",
    "  --timeout-ms <number>    Restore command timeout (default 600000)",
    "  --allow-same-server      Explicitly permit source and target on one PostgreSQL server",
  ].join("\n");
}

function takeValue(args: string[], index: number, name: string): { value: string; next: number } {
  const current = args[index];
  const equals = current.indexOf("=");
  if (equals >= 0) {
    const value = current.slice(equals + 1).trim();
    if (!value) throw new Error(`${name} needs a value.\n${usage()}`);
    return { value, next: index };
  }
  const value = args[index + 1]?.trim();
  if (!value || value.startsWith("--")) throw new Error(`${name} needs a value.\n${usage()}`);
  return { value, next: index + 1 };
}

function parseArgs(args: string[]): CliOptions {
  const result: CliOptions = { allowSameServer: false };
  for (let index = 0; index < args.length; index += 1) {
    const current = args[index];
    if (current === "--allow-same-server") {
      result.allowSameServer = true;
      continue;
    }
    const name = current.split("=", 1)[0];
    if (name === "--help" || name === "-h") {
      console.log(usage());
      process.exit(0);
    }
    const known = new Set(["--dump", "--source-url", "--target-url", "--psql-path", "--report", "--timeout-ms"]);
    if (!known.has(name)) throw new Error(`Unknown option ${current}.\n${usage()}`);
    const parsed = takeValue(args, index, name);
    index = parsed.next;
    if (name === "--dump") result.dumpPath = parsed.value;
    else if (name === "--source-url") result.sourceUrl = parsed.value;
    else if (name === "--target-url") result.targetUrl = parsed.value;
    else if (name === "--psql-path") result.psqlPath = parsed.value;
    else if (name === "--report") result.reportPath = parsed.value;
    else {
      const timeout = Number(parsed.value);
      if (!Number.isInteger(timeout) || timeout < 1_000) throw new Error("--timeout-ms must be an integer >= 1000.");
      result.timeoutMs = timeout;
    }
  }
  if (!result.dumpPath) throw new Error(`--dump is required.\n${usage()}`);
  return result;
}

function requiredUrl(explicit: string | undefined, names: string[]): string {
  if (explicit?.trim()) return explicit.trim();
  for (const name of names) {
    const value = process.env[name]?.trim();
    if (value) return value;
  }
  throw new Error(`Missing ${names.join(" or ")}; provide the URL through an environment variable or option.`);
}

/** Keep terminal output useful without ever echoing row values; the full hash receipt is optional. */
function compactAggregate(aggregate: DatabaseAggregate | undefined) {
  if (!aggregate) return undefined;
  return {
    totalRows: aggregate.totalRows,
    tables: Object.fromEntries(
      Object.entries(aggregate.tables).map(([table, value]) => [
        table,
        {
          rowCount: value.rowCount,
          columns: Object.fromEntries(
            Object.entries(value.columns).map(([column, columnValue]) => [column, columnValue.checksum]),
          ),
        },
      ]),
    ),
  };
}

async function main(): Promise<void> {
  const cli = parseArgs(process.argv.slice(2));
  const options: RestoreVerificationOptions = {
    dumpPath: path.resolve(cli.dumpPath!),
    sourceUrl: requiredUrl(cli.sourceUrl, ["PRODUCTION_DATABASE_URL", "DATABASE_URL"]),
    targetTemplateUrl: requiredUrl(cli.targetUrl, ["RESTORE_DATABASE_URL", "TEST_DATABASE_URL", "DATABASE_URL"]),
    psqlPath: cli.psqlPath,
    allowSameServer: cli.allowSameServer,
    commandTimeoutMs: cli.timeoutMs,
  };
  const report = await verifyDatabaseRestore(options);
  if (cli.reportPath) {
    writeRestoreReport(cli.reportPath, report);
    console.log(`Restore receipt: ${path.resolve(cli.reportPath)}`);
  }
  console.log(
    JSON.stringify(
      {
        ...report,
        sourceAggregate: compactAggregate(report.sourceAggregate),
        restoredAggregate: compactAggregate(report.restoredAggregate),
      },
      null,
      2,
    ),
  );
  if (report.status !== "PASS") process.exitCode = 1;
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : "Restore verification failed.");
  process.exitCode = 1;
});
