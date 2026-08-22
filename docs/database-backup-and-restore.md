# Database Backup and Restore

## Overview

MKTTool uses two independent database backup layers:

1. The application creates a nightly plain-SQL dump and uploads it to a private Cloudflare R2
   bucket.
2. An administrator pulls a production dump to a separately controlled machine before every
   schema-changing deployment and at regular operational checkpoints.

Both layers are required. The R2 copy runs without human memory; the administrator copy still
survives loss of the Railway or Cloudflare account. A dump is not proven until it restores into an
empty database with strict error handling.

Railway volume backups are not a required layer. At the verified 6 August 2026 checkpoint they
required the Pro plan, and they remain in the same provider account as the source database, so they
do not cover account or project loss.

Return to the [Railway deployment guide](deployment-guide.md) after completing this runbook.

## Before a Schema-Changing Deployment

Run this before `prisma migrate deploy` or any production deployment that changes the database
schema:

```bash
npm run db:backup:remote
```

`prisma migrate deploy` does not create a backup. Confirm all of the following before continuing:

- the command reports a non-zero data-row count;
- the file is written under `data/backups/` with a `mkttool-prod-` prefix;
- the dump ends with `-- PostgreSQL database dump complete`;
- a restore rehearsal succeeds in an empty local database.

Never restore a verification dump into the operational or test database. Use a disposable empty
database and remove it after the row counts and required records are checked.

## Administrator Pull Configuration

Add the public Railway database URL to the administrator machine's `.env`, never to source control:

```dotenv
PRODUCTION_DATABASE_URL="<DATABASE_PUBLIC_URL>?sslmode=require"
```

The remote backup command never falls back to `DATABASE_URL`. If `PRODUCTION_DATABASE_URL` is
missing, it stops instead of risking a dump from the wrong database.

Run:

```bash
npm run db:backup:remote
```

The output file is `data/backups/mkttool-prod-<date>-<time>.sql`. The `prod` marker reduces the risk
of confusing it with a local development dump. Treat the file as sensitive even though encrypted
fields remain ciphertext.

## PostgreSQL Client Compatibility

`pg_dump` refuses to dump a server whose major version is newer than the client. A typical failure
looks like this:

```text
pg_dump: error: aborting because of server version mismatch
pg_dump: detail: server version: 18.4; pg_dump version: 17.10
```

Install a client matching or newer than the server and point `.env` to its executable when it is not
on `PATH`:

```dotenv
PG_DUMP_PATH="<path-to-postgresql-18>/bin/pg_dump.exe"
```

On Windows, the EDB PostgreSQL binaries ZIP is preferred when only client tools are needed. It does
not install another Windows service or compete with the local PostgreSQL instance.

If the correct client cannot be installed immediately and Docker is available, use a matching
container as a temporary fallback:

```bash
docker run --rm -e PGURL="$PRODUCTION_DATABASE_URL" -v "//e/MKTTool/data/backups:/out" postgres:18-alpine sh -c 'pg_dump "$PGURL" --file /out/mkttool-prod-manual.sql --format=plain --no-owner --no-privileges'
```

Adjust the PostgreSQL major and mounted path for the machine. Verify the completion trailer and
restore the result before relying on it.

## Restore Rehearsal

Create a disposable empty database, then restore with errors treated as fatal:

```bash
createdb -U postgres mkttool_restore_check
psql -v ON_ERROR_STOP=1 -U postgres -d mkttool_restore_check -f data/backups/<dump-file>.sql
```

Compare the restored row counts and a small set of required records with the backup command output.
Encrypted columns must remain ciphertext. A successful `pg_dump` exit alone does not prove that the
backup can be restored.

## Automated Cloudflare R2 Backups

Create a private R2 bucket dedicated to database backups. Create an API token with Object Read and
Write access scoped only to that bucket. Do not reuse the Relay release bucket or broaden the backup
token to all buckets.

Configure the web service with:

```dotenv
BACKUP_DAILY_AT="03:00"
R2_ACCOUNT_ID="<account-id>"
R2_BUCKET="mkttool-backup"
R2_ACCESS_KEY_ID="<access-key-id>"
R2_SECRET_ACCESS_KEY="<secret-access-key>"
```

The four `R2_*` values must be complete or all absent. Partial configuration stops startup instead
of pretending that backups are enabled. `BACKUP_DAILY_AT` uses `TEAM_TIMEZONE`; choose a time that
does not overlap the daily account-health run.

If the service was offline at the scheduled time, it runs one catch-up backup after startup. It does
not create repeated backups for the same decided day.

Verify the complete path:

1. Startup logs report the enabled schedule and R2 destination.
2. The scheduled run reports an uploaded object with byte and row counts.
3. The private bucket contains the expected object.
4. The Today page has no backup failure, stale-backup, or never-ran alert.
5. A downloaded object restores into an empty database with `ON_ERROR_STOP=1`.

An empty dump is not uploaded. Authentication failures surface immediately, and the application
alerts when the latest run failed, the newest backup is older than two days, or the schedule is
enabled but has never completed.

MKTTool intentionally does not auto-delete old R2 backups. Current dumps are small, while a
retention bug could silently delete the recovery history this feature is meant to protect.

## Verified Evidence

- On 6 August 2026, the administrator pull restored 21 rows across six tables into an empty local
  database.
- On 6 August 2026, an R2 object restored with `ON_ERROR_STOP=1` and reproduced 22 rows across six
  tables.
- On 17 August 2026, the configured PostgreSQL 18 client produced a 71 KB production dump with 120
  rows across 14 tables.

These records prove the workflow at those checkpoints. They do not replace the restore rehearsal
required for each schema-changing deployment.
