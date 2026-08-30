# Runbook: production backup and disposable restore verification

Updated: 30 August 2026

Use this before a schema migration or Lane A merge. It proves that the current production dump can
be restored and that aggregate/hash evidence matches without copying production rows into a plan or
committing them to Git.

## Preconditions

- Work from `MKTTool` on the release branch; do not stage `AGENTS.md`, `.env`, or `data/backups/*`.
- `npm ci` and `npm run db:generate` have passed.
- `PRODUCTION_DATABASE_URL` points to the current production database. Never print it.
- `TEST_DATABASE_URL` or `RESTORE_DATABASE_URL` points to a disposable local PostgreSQL template.
  The verifier creates and drops a uniquely named database; it refuses unsafe targets unless
  `--allow-same-server` is explicitly supplied for a disposable local rehearsal.
- For this production procedure, do not rely on the verifier's local `DATABASE_URL` fallback: if
  `PRODUCTION_DATABASE_URL` is absent from the approved `.env`/secret injection, stop before
  restoring. A successful `db:backup:remote` is the source-selection evidence; a local dump is not.
- Confirm the PostgreSQL clients and versions are approved. `db:backup:remote` uses
  `PG_DUMP_PATH` when it is set and otherwise resolves `pg_dump` on `PATH`; the verifier uses
  `PSQL_PATH` when it is set and otherwise resolves `psql` on `PATH`. Capture the selected
  executables' versions without printing connection strings:

  ```powershell
  $pgDumpPath = if ($env:PG_DUMP_PATH) {
    if (-not (Test-Path -LiteralPath $env:PG_DUMP_PATH -PathType Leaf)) {
      throw 'PG_DUMP_PATH does not name a readable executable.'
    }
    (Resolve-Path -LiteralPath $env:PG_DUMP_PATH).Path
  } else {
    (Get-Command pg_dump -ErrorAction Stop).Source
  }
  & $pgDumpPath --version
  if ($LASTEXITCODE -ne 0) { throw 'The approved pg_dump version check failed.' }
  $psqlPath = if ($env:PSQL_PATH) {
    if (-not (Test-Path -LiteralPath $env:PSQL_PATH -PathType Leaf)) {
      throw 'PSQL_PATH does not name a readable executable.'
    }
    (Resolve-Path -LiteralPath $env:PSQL_PATH).Path
  } else {
    (Get-Command psql -ErrorAction Stop).Source
  }
  & $psqlPath --version
  if ($LASTEXITCODE -ne 0) { throw 'The approved psql version check failed.' }
  ```

## Procedure

```powershell
Set-Location E:\MKTWorkspace\MKTTool
$before = @(Get-ChildItem -LiteralPath data\backups -Filter 'mkttool-prod-*.sql' -File |
  Select-Object -ExpandProperty FullName)
$started = Get-Date
npm run db:backup:remote
if ($LASTEXITCODE -ne 0) { throw 'db:backup:remote failed; no dump may be selected.' }
$newDumps = @(Get-ChildItem -LiteralPath data\backups -Filter 'mkttool-prod-*.sql' -File |
  Where-Object { $_.LastWriteTime -ge $started -and $before -notcontains $_.FullName })
if ($newDumps.Count -ne 1) {
  throw "Expected exactly one new production dump after the successful command; found $($newDumps.Count)."
}
$dump = $newDumps[0]
if ($dump.Length -le 0) { throw 'The new production dump is empty.' }
# Use a unique receipt path: the verifier deliberately refuses to overwrite an existing report.
$report = Join-Path $env:TEMP ("mkttool-restore-" + [DateTime]::UtcNow.ToString('yyyyMMdd-HHmmssfff') + '-' + [Guid]::NewGuid().ToString('N') + '.json')
npm run db:restore:verify -- --dump $dump.FullName --report $report
if ($LASTEXITCODE -ne 0) { throw 'db:restore:verify did not PASS.' }
Get-FileHash -LiteralPath $dump.FullName -Algorithm SHA256
Get-FileHash -LiteralPath $report -Algorithm SHA256
```

The command output must include `status: PASS`, equal source/restored aggregate row counts,
`mismatches: []`, and `cleanup: PASS`. Save only the dump path, byte count, hashes, counts, and
timestamp in the release report. Do not paste aggregate values that could identify an account.

The `before`/`newDumps` check is mandatory. Never sort the whole backup directory and select the
newest file: a failed command can leave an older dump looking current. If the check finds zero or
more than one new file, stop and investigate rather than choosing by guesswork.

## If it fails

- `BLOCKED` for missing client, Node, credentials, or disposable database: fix the environment and
  rerun; never substitute a mock or call it PASS.
- `FAIL` or a non-empty mismatch list: stop the release, preserve the sanitized report, investigate
  migration/schema drift, and obtain human review. Do not deploy or delete the source dump.
- Cleanup failure: treat the target as contaminated, isolate it, and have an administrator remove it
  after confirming it is not production. The release remains blocked.

## Current evidence

The 30 August P4a run produced `data/backups/mkttool-prod-20260830-101918.sql` (64,270 bytes,
SHA-256 `40ba103453a764db5ecd4288bba7a8537fa911832e9216c56303a31e9ef1694f`) and a PASS receipt
with 100 source/restored aggregate rows, zero mismatches, and cleanup PASS. The sanitized receipt
is outside Git at `%TEMP%\mkttool-restore-u4-101918.json` (SHA-256
`b5f652ec178d037f3c3353769d79926cd42327b33375a6c7f278e850d5955804`).

The SQL dump contains encrypted production values. Keep it outside Git and protect it separately
from the keys that decrypt it.
