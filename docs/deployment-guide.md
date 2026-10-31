# Deployment guide — Railway

**Updated:** 31 October 2026

The web app deploys to Railway through the GitHub source integration: whatever lands on `master` is
built from the repo-root `Dockerfile` and released. There is no separate deploy step, no approval
gate, and no staging branch. Treat every push to `master` as a production deployment.

**Current state:** the Railway service is returning 404 and needs to be restored or re-wired. The
procedure below is the path to bring it back and to keep it healthy afterwards.

## 1. What the deployment needs

| Setting | Value |
|---|---|
| Source | This repository, branch `master`, built by the root `Dockerfile` (auto-detected) |
| Pre-deploy command | `npx prisma migrate deploy` |
| Healthcheck path | `/api/healthz` |
| Port | `3000` (the Dockerfile sets `ENV PORT=3000`; set `PORT=3000` in Variables too, so a platform-injected value cannot disagree with the domain) |

> **Why pre-deploy is `prisma migrate deploy` and not `npm run db:upgrade`.** `db:upgrade` backs up
> before applying — which matters on a machine with persistent disks. Inside a container the backup
> lands on an ephemeral layer and vanishes with the next deploy: a backup that dies with the thing
> it protects is worse than none, because it *looks like* one. The pre-deploy backup is therefore a
> human step (below), and `migrate deploy` only applies. It also cannot run in the container:
> `db:upgrade` requires a `.env` file the image deliberately does not carry.

> **Why the plain Dockerfile.** The same image must run on Railway, Render, Fly, or a VPS.
> Provider-specific configuration is discovered as a constraint on the day you want to leave.

## 2. Environment variables

Set on the web service (Railway → web service → Variables → Raw Editor):

```
DATABASE_URL=${{Postgres.DATABASE_URL}}
TEAM_TIMEZONE=Asia/Ho_Chi_Minh
VAULT_KEY_SERVER=<copy from admin .env>
TICKET_SIGNING_KEY=<copy from admin .env>
BETTER_AUTH_SECRET=<generated fresh for production>
ALLOWED_EMAILS=<comma-separated>
ADMIN_EMAILS=<subset of ALLOWED_EMAILS>
GOOGLE_CLIENT_ID=<copy from admin .env>
GOOGLE_CLIENT_SECRET=<copy from admin .env>
BETTER_AUTH_URL=https://<domain>
PORT=3000
```

Rules that have bitten before:

- `${{Postgres.DATABASE_URL}}` is a Railway reference, not a string to replace. It points at the
  internal network, so Postgres is not exposed to the internet, and it self-corrects if Railway
  rotates the database password.
- **`VAULT_KEY_OPERATOR` must NOT be set on the server.** That is the whole point of the two vault
  zones. The server holds the non-reversible `VAULT_KEY_OPERATOR_FINGERPRINT` (used to verify
  operator self-onboarding), never the plaintext operator key.
- `TEAM_TIMEZONE` is embedded into the bundle **at build time**. Changing it later requires a
  rebuild; restarting is not enough.
- `BETTER_AUTH_SECRET` is generated fresh for production — it only signs session cookies, and the
  two environments sharing one signing key buys nothing. Rotating it signs out the whole team
  immediately, which is exactly what you want when a session is suspect.
- `GOOGLE_CLIENT_ID/SECRET` need a second authorized redirect URI:
  `https://<domain>/api/auth/callback/google`, exact to the character including the trailing slash.
  Keep the `localhost` URIs for development.
- Optional but recommended: the four `R2_*` backup variables (all four or none — half-configured
  fails the app at startup, because "half running" here means believing you have a backup you do
  not have) and the `RELAY_RELEASE_R2_*` read-only variables for Relay distribution.

## 3. Deploy and verify

1. Confirm `master` has the code you intend to release: `git log --oneline origin/master..HEAD`
   must be empty before connecting the service, and the work must be committed before pushing.
2. Merge/push to `master`. The merge **is** the deployment.
3. Verify from outside the service rather than assuming:

   ```
   git rev-parse HEAD        # must equal origin/master
   <app-url>/api/healthz     # HTTP 200, "ready", database + releaseMetadata + r2 all "ok"
   ```

4. Sign in with an allowlisted Google account, and once with a non-allowlisted one to see the
   rejection. The allowlist is enforced on every request, not only at sign-in.

`/api/healthz` is deliberately unauthenticated and returns no account, proxy, ticket, or secret
data. A healthy response means the process can reach Postgres, holds the exact Relay release
metadata it is configured to serve, and has the operator-key fingerprint verifier required for
self-onboarding.

## 4. Backup before schema-changing deploys

`prisma migrate deploy` does not create a backup. Before any deploy that changes the schema, from
an admin machine:

```bash
npm run db:backup:remote                                   # pulls a pg_dump from production
npm run db:restore:verify -- --dump data/backups/mkttool-prod-<timestamp>.sql \
  --report "$TEMP/restore.json"                            # proves it restores, into a disposable DB
```

Never commit the SQL dump; it contains encrypted production values. The full procedure, including
the nightly R2 backup and its failure states, is in
[database-backup-and-restore.md](database-backup-and-restore.md) and
[runbooks/database-restore.md](runbooks/database-restore.md). Rollback is a human-approved action;
the tuple-recording procedure is in [runbooks/release-rollback.md](runbooks/release-rollback.md).

## 5. Relay distribution

The Relay package and the combined Windows installer are published to a dedicated R2 slot by
`npm run relay:publish` / `browser:publish` from a Windows build machine, and served to signed-in
operators from `/setup` (`/relay-download` remains for the Relay archive). The server needs only a
read-scoped token for that bucket; the write token stays on the build machine, because a server
that could rewrite the installer the whole team is about to download would turn a "safe to lose"
bucket into a distribution channel. Full procedure: the R2 section of `.env.example` and
`scripts/publish-relay-release.ts`.

## 6. Hard-won Railway traps (kept because they were paid for)

- **`railway up` overwrites whichever service is selected — including the database service.** On
  06/08/2026 a bare `railway up` deployed the app on top of the Postgres service. The symptom
  pointed elsewhere: `DATABASE_URL` still correct, service "Online", deployment "successful", and
  only the Postgres service's own logs showed `> next start`. If you ever use the CLI: always pass
  `--service`, check the linked service with `railway status` first, and after any deploy glance at
  the database service's logs.
- **Railway variable references are not terminal input.** `${{PGUSER}}`-style strings only resolve
  inside the Railway dashboard. Pasting one into PowerShell is a syntax error at best; use the
  **Connect** button's fully resolved string instead.
- **Quote connection URLs with single quotes** in PowerShell — double quotes swallow `$`, which
  silently truncates passwords containing `$` into a baffling "authentication failed".
- **`ON_ERROR_STOP=1` is mandatory for restore runs.** Plain `psql -f` continues past errors and
  produces a database that is *mostly* restored — the worst possible state for a backup, discovered
  days later.
- **`pg_dump` must be the same major version or newer than the server.** A 17 client refuses to
  dump a Postgres 18 server (observed 08/08/2026), and the refusal happens at the worst moment:
  the backup-before-deploy step.
