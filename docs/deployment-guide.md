# Hosting guide — local machine, no cloud deployment

**Railway is retired (31 October 2026).** The owner decided the web app no longer deploys to any
cloud host. The app runs on the owner's machine; the team reaches it over Tailscale. GitHub is
backup and history only — pushing deploys nothing.

## 1. Run the web app

```powershell
npm ci                      # installs deps and generates the Prisma client
npx prisma migrate deploy   # apply migrations to the local PostgreSQL
npm run build
npm run start               # or: npm run dev for iteration
```

`DATABASE_URL` in `.env` points at the local PostgreSQL. The database name for automated tests
must end in `_test` (see `docs/database-backup-and-restore.md` for the backup flow — still
mandatory: the vault is the only copy of the nick credentials).

## 2. Team access

Operators reach the app through Tailscale:

- The app binds the owner's machine; share `http://<tailscale-host>:3000` with the team, or put
  the host name into the Relay web-origin configuration on each PC.
- Auth is unchanged: Google OAuth with the allowlist, roles ADMIN and OPERATOR.

## 3. Runtime verification

`GET /api/healthz` must report `ready` with `database`, `releaseMetadata` and `r2` all `ok`.
That is the whole deployment check now — there is no remote platform to verify against.

## 4. Distribution (unchanged)

Installer and Relay artifacts still live in Cloudflare R2 and are served through `/setup` and the
relay download routes. Relay and MKT Browser updates ship by reinstalling from `/setup`.

## 5. Hard-won traps worth keeping

- Back up before migrating (`npm run db:backup`) — the vault cannot be reconstructed from git.
- Prisma needs `DATABASE_URL` even for client generation; a missing value fails `npm ci`'s
  postinstall, not the migration.
- PostgreSQL major upgrades change dump/restore compatibility; the 8 August 2026 incident
  (server 18 vs local pg_dump 17) is the reference.
