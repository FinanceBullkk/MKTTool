# MKTTool

MKTTool is an internal identity vault and posting-safety console for a small, known team. It keeps
the team's social accounts (**nicks**), their **static proxies**, and the **Relay PCs** that own
their local browser profiles in one shared, access-controlled place. Pressing "open profile" on a
nick issues a short-lived Ed25519-signed ticket to that nick's registered PC, where the local Relay
decrypts it, applies the nick's proxy, and opens the MKT Browser profile on the CloakBrowser engine.

This is not a bot farm and not a spam tool. It records ownership and enforces technical readiness;
it does not automate posting, and it makes no identity-isolation promise. One nick equals one
static proxy equals one browser profile equals one Relay PC equals one responsible operator — and
the database enforces that, not the UI.

## What the 31 October 2026 surgery removed

On 31 October 2026 the repo was cut back to the surfaces a small team actually runs. Three cuts,
all recorded in git history (see the parent of the surgery commit on branch `surgery/261031`):

- **Out-of-scope posting surface removed, not parked.** The content library, posting queue, the
  ten-rule safety engine, the shadowban/health observer with its observer proxies, posting targets,
  and the Facebook Pages publisher with its OAuth flow are gone from the code. Removing them was
  the point: untested surfaces that only pretend to be ready are worse than absent ones. Re-entering
  a platform is an explicit owner decision that starts from git history, not a feature flag.
- **Release ceremony machinery removed.** The offline release-signing key ceremony, the signed
  compatibility sequences, and the release-authority tooling are gone. What remains is ordinary
  software: a build, a hash, and a download route.
- **Relay self-update platform removed.** Relay no longer downloads or activates signed
  compatibility updates. **Relay updates by reinstalling the current package from `/setup`.**

Historical documents describing that surface live in [docs/archive/](docs/archive/README.md) and are
retained as records, not instructions.

## Architecture in one paragraph

The web app is Next.js 16 (App Router) + TypeScript + Prisma 7 on PostgreSQL, with Better Auth
Google sign-in behind an explicit email allowlist (`ALLOWED_EMAILS`, with `ADMIN_EMAILS` as the
admin subset) and two roles, ADMIN and OPERATOR. It runs on Railway from a plain `Dockerfile`.
The [`relay/`](relay/) directory builds a separate Windows x64 bridge as a Node SEA executable; it
listens only on `127.0.0.1:47821`, holds `VAULT_KEY_OPERATOR`, verifies the server's Ed25519 ticket
signatures, and calls the authenticated MKT Browser MCP endpoint on `127.0.0.1:47822` to create and
open profiles on the CloakBrowser engine. Nick secrets in the operator vault zone are decrypted only
on the operator PC — the server issues sealed, recipient-bound tickets it cannot itself open.
Cloudflare R2 stores the published Relay package and installer for authenticated distribution via
`/setup`, and the nightly database backups.

```
Browser (Google sign-in) ──HTTPS──> Next.js on Railway ──> PostgreSQL (vault)
                                          │
                                          │ Ed25519-signed ticket, bound to one PC,
                                          │ ~30 s, single-use
                                          v
Browser ──POST 127.0.0.1:47821──> Relay (Windows, holds VAULT_KEY_OPERATOR)
                                        │ verifies signature, checks replay journal
                                        v
                                  MKT Browser MCP 127.0.0.1:47822 (CloakBrowser engine)
                                        │ applies the nick's static proxy, opens profile
                                        v
                                  the nick's static proxy ──> the platform
```

## Setup

Requirements: Node.js 24 for development and CI (22 is the supported floor) and PostgreSQL 17
(native install; the dev database does not need Docker).

Create two databases — one to run on, one **dedicated** to tests:

```bash
createdb -U postgres mkttool_dev
createdb -U postgres mkttool_test
```

Then:

```bash
npm ci
cp .env.example .env
npm run vault:keygen        # run TWICE: one key for VAULT_KEY_SERVER, one for VAULT_KEY_OPERATOR
npx prisma migrate deploy   # or: npm run db:upgrade (backs up before applying)
npm run dev                 # http://localhost:3000
```

`.env.example` documents every variable. The ones the app refuses to start without:
`DATABASE_URL`, `TEAM_TIMEZONE`, `VAULT_KEY_SERVER`, `VAULT_KEY_OPERATOR`,
`TICKET_SIGNING_KEY`, `ALLOWED_EMAILS`, `ADMIN_EMAILS`, `BETTER_AUTH_SECRET`,
`GOOGLE_CLIENT_ID`/`GOOGLE_CLIENT_SECRET`, `BETTER_AUTH_URL`.

Three rules worth internalizing before the first launch:

- **`TEST_DATABASE_URL` must point at a database whose name ends in `_test`.** The test suite runs
  `DROP SCHEMA` without asking. It refuses any database that does not match the naming convention,
  and that convention is much cheaper than the alternative.
- **Both vault keys go into a password manager.** Losing a vault key means losing that zone's data
  permanently. There is no recovery path, by design.
- **The operator key should eventually not be on the server.** `VAULT_KEY_SERVER` protects proxy
  passwords and API tokens the server legitimately needs. `VAULT_KEY_OPERATOR` protects nick
  passwords, emails, and TOTP secrets; the goal state is that stealing the whole server still opens
  no nick credential. Which column belongs to which zone is declared in
  `src/lib/crypto/encrypted-field-registry.ts` and enforced by a test that reads the Prisma schema.

## Commands

| Command | What it does |
|---|---|
| `npm run dev` | Run the app on localhost:3000 |
| `npm run build` | Production build |
| `npm run typecheck` / `npm run lint` | TypeScript / ESLint |
| `npm run ci:secret-scan` | Scan the tree for committed secrets |
| `npm test` | Full suite — needs `TEST_DATABASE_URL` ending in `_test` |
| `npm run test:no-db` | Fast suite, no database required |
| `npm run test:relay` | Relay bridge suite |
| `npm run db:upgrade` | **Run this after pulling a new version** — backs up, then applies migrations |
| `npm run db:migrate` | Create a new migration (developer only) |
| `npm run db:backup` / `db:backup:remote` | Back up local DB / pull a backup from production |
| `npm run db:restore:verify` | Prove a dump restores into a disposable database |
| `npm run proxies:import <file>` | Bulk-import proxies from provider `host:port:user:pass` lists |
| `npm run vault:keygen` | Generate a vault key (used for both zones) |
| `npm run vault:rekey -- --domain=server\|operator --new-key=<hex>` | Rotate one vault zone |
| `npm run keys:server-keygen` / `keys:server-pubkey` | Generate / show the Ed25519 ticket-signing key |
| `npm run keys:relay-keygen` | Generate an X25519 keypair for one Relay PC (run on that PC) |
| `npm run relay:build` / `relay:publish` | Package the Relay on Windows / publish to the R2 release slot |
| `npm run vault:smoke` | Acceptance smoke for the identity vault against a real DB |

## Testing

`npm run test:no-db` runs anywhere and covers most logic. `npm run test:relay` covers the Windows
bridge (some of its guarded tests only engage on Windows, which is where CI runs it). `npm test` is
the full suite including PostgreSQL database tests; it requires `TEST_DATABASE_URL` pointing at a
`*_test` database and, per the convention above, it will refuse anything else.

After modifying code: run the narrowest relevant suite first, then `npm run typecheck`,
`npm run lint`, and `npm run ci:secret-scan`. Never weaken a legitimate failing test to get a green
run — the honest result is the deliverable.

## Deploy

**A push to `master` is a production deployment.** When the Railway service is wired to this
repository, the GitHub integration builds and releases whatever lands on `master` — no workflow to
trigger, no approval step, nothing to forget. If that is not what you want, do not push yet.

After pushing, verify rather than assume:

```
git rev-parse HEAD        # must equal origin/master
<app-url>/api/healthz     # HTTP 200, status "ready", database/releaseMetadata/r2 all "ok"
```

`/api/healthz` is deliberately unauthenticated and returns no account, proxy, or ticket data. A
healthy response means the process can reach Postgres, holds the exact Relay release metadata it is
configured to serve, and has the operator-key fingerprint verifier required for self-onboarding.
Note: the Railway service is currently returning 404 and needs to be restored/re-wired — see the
[roadmap](docs/development-roadmap.md).

Backups run nightly to R2 when `BACKUP_DAILY_AT` plus the four `R2_*` variables are set (all four
or none). Before any schema-changing deploy, run `npm run db:backup:remote` — `prisma migrate deploy`
does not create a backup. The backup and restore procedure, including the restore proof, is in
[docs/database-backup-and-restore.md](docs/database-backup-and-restore.md) and
[docs/runbooks/database-restore.md](docs/runbooks/database-restore.md).

## The invariants that make this tool what it is

**1 nick = 1 static proxy = 1 browser profile = 1 Relay PC = 1 responsible operator.**
`Account.proxyId` and `Account.antidetectProfileId` are `@unique`; a browser profile ID is
meaningless without the machine that holds its local data, so `Account.deviceId` routes every
ticket to the nick's own PC — not to the PC of whoever clicked the button. ADMIN gets no exception
on profile launch: the ticket is sealed to the other machine's key, so issuing one would be
theater. The admin recovery path is reassignment, which is a named, audited action.

**Two vault key zones, two trust boundaries.** `VAULT_KEY_SERVER` (proxy passwords, API tokens)
lives on the server. `VAULT_KEY_OPERATOR` (nick passwords, emails, TOTP seeds) is meant to live
only on operator machines, inside the Relay. The server checks session, ownership, and
authorization, then hands out sealed boxes; only the recipient PC can open them. Operator-key
enrollment wraps the key to each PC's X25519 public key, so nobody ever copies a hex string.

**Tickets are the only thing the server ever hands out.** An Ed25519 signature over a
recipient-sealed payload, ~30 seconds of life, single-use with a persistent replay journal inside
the Relay, and a per-kind minimum Relay version. Revoking a PC blocks new tickets immediately —
but it does not erase anything already on that PC's disk. If exposure is plausible, rotate
`VAULT_KEY_OPERATOR` (`npm run vault:rekey`) and re-grant keys to the PCs you still trust.

**The Relay version floor is a security floor, not a marketing number.** Every ticket kind carries
a minimum Relay version; the general floor is 13 (the first build carrying the C26 fix — nothing
after it has a known hole, so nothing refuses 14+ for security reasons), and profile create/launch
require a newer floor because they need capabilities old builds cannot prove. An old Relay is told
exactly that. Since the self-update platform was removed, the fix for an outdated Relay is always
the same: reinstall the current package from `/setup`.

**Proxies are checked before a profile opens.** Launch pushes the nick's proxy into the profile
first, and the proxy is probed through itself: dead proxy, wrong credentials, or an exit IP equal
to the operator's own IP means the profile does not open. A profile without its proxy silently
running on the home IP is the failure this exists to prevent — so the check fails closed instead
of warning. "Not checked yet" is displayed as exactly that, never as healthy.

**Two tabs cannot silently overwrite the same nick.** The nick edit and owner/PC assignment forms
carry the record's `updatedAt` revision. A stale save is rejected whole; reload and try again.
Optimistic concurrency on the two account write paths — not an app-wide lock.

**Every sensitive action is audited.** Credential reveals, profile launches, ticket issuance, key
grants, and revocations append to `AuditLog` with who did it and which PC received the ticket.

## Roles

| Role | Can do |
|---|---|
| **ADMIN** | Everything: assign nick owner + Relay PC, register/revoke Relay PCs, grant operator keys, and own the proxy vault |
| **OPERATOR** | Everything except the four admin powers above, and can only reveal secrets of nicks they are responsible for |

Visibility is not split: everyone sees every nick and its state, deliberately, so that ownership
and readiness are public facts inside a small team. What is split is write authority and nick
secrets, and that split is enforced at the ticket-issuance layer, not by hiding buttons. Removing
an email from `ALLOWED_EMAILS` takes effect on the next request — the allowlist is checked on every
request, not only at sign-in.

## Documentation

Start from the [docs index](docs/README.md). The short version:

| File | Answers |
|---|---|
| [docs/project-overview-pdr.md](docs/project-overview-pdr.md) | What the product is, for whom, and what it deliberately does not do |
| [docs/system-architecture.md](docs/system-architecture.md) | Where it runs, what trusts what, how it fails |
| [docs/domain-glossary.md](docs/domain-glossary.md) | Nick, Relay PC, ticket, vault zones — the fixed vocabulary |
| [docs/ui-glossary.md](docs/ui-glossary.md) | The user-facing terms and their code boundaries |
| [docs/codebase-summary.md](docs/codebase-summary.md) | Where the code lives, which flow calls what |
| [docs/code-standards.md](docs/code-standards.md) | Conventions before you contribute |
| [docs/development-roadmap.md](docs/development-roadmap.md) | Current state, what is green, open follow-ups |
| [docs/project-changelog.md](docs/project-changelog.md) | Dated change log |
| [docs/deployment-guide.md](docs/deployment-guide.md) | Railway deployment, variables, verification |
| [docs/runbooks/](docs/runbooks/) | Backup/restore proof, uptime alerting, deploy rollback |
| [docs/archive/](docs/archive/README.md) | Removed-surface docs, kept as history — not instructions |

All project artifacts are written in English. Direct conversation with the team may stay in
Vietnamese; existing Vietnamese artifacts are legacy.
