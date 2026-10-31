# Codebase map

**Updated:** 31 October 2026

Where the code lives and which flow calls what. Architecture and trust boundaries are in
[system-architecture.md](system-architecture.md); vocabulary is in [domain-glossary.md](domain-glossary.md).

> The 31 October 2026 surgery removed the posting surface (content library, queue, rules engine,
> shadowban observer, Facebook Pages publisher), the release-ceremony machinery, and the Relay
> self-update platform. The pre-surgery map is preserved in git history; removed-domain sections
> are not reproduced here.

---

## Directory tree

```
src/
├── app/                        Next.js App Router — pages and API
│   ├── page.tsx                Workspace overview: team state, warnings, next actions
│   ├── accounts/               Nick vault: list + detail (edit, secrets, launch, assignment)
│   ├── proxies/                Proxy vault: list + detail, liveness and bandwidth controls
│   ├── relay-devices/          Relay PC registry (ADMIN: approve, grant, revoke)
│   ├── relay-download/         Authenticated Relay package download page
│   ├── setup/                  Relay-first operator onboarding (download, register, receive)
│   ├── login/                  Google sign-in
│   └── api/
│       ├── accounts/[id]/launch/   Issue the profile-launch ticket for one nick
│       ├── auth/[...all]/          Better Auth handlers (Google OAuth)
│       ├── healthz/                Unauthenticated readiness: DB, release metadata, R2
│       ├── relay/download/         Versioned Relay package download (session or release token)
│       └── setup/                  Windows installer download + setup support routes
├── components/
│   ├── mktbrowser-ui/          App shell, workspace status board, profile tables/tiles
│   ├── vault/                  Nick forms, readiness badge, profile card, secret fields
│   ├── proxies/                Proxy console, check/speed controls
│   ├── relay/                  Device lists, grant/revoke/retire buttons, version cells
│   ├── setup/                  Onboarding stepper, download sections, checklist
│   ├── tiktok/                 TikTok nick-creation sheet (identity scope only; no posting pipeline exists)
│   └── auth/ + ui/ + layout/   Sign-in controls, shared atoms, banners
├── lib/
│   ├── accounts/               Vault server actions (create/edit/delete), readiness verdicts,
│   │                           cluster (owner+PC) assignment, launch-ticket issuance
│   ├── actions/                Shared ActionResult type
│   ├── antidetect/             Adapter boundary: MKT Browser adapter + MCP client + contract,
│   │                           AdsPower adapter (secondary), profile/proxy config builders
│   ├── audit/                  AuditLog writer and action names
│   ├── auth/                   Better Auth setup, allowlist, guardedAction/guardedRoute,
│   │                           requireActor, trusted-proxy config, entry-point guard names
│   ├── backup/                 Daily backup schedule config + freshness warnings
│   ├── crypto/                 AES-256-GCM credential encryption, two-zone key registry,
│   │                           key loading, operator-key fingerprint, placeholder detection
│   ├── db/                     Prisma client, backup/restore-verify, reference guard,
│   │                           ticket row locks, migration checks
│   ├── enrollment/             Relay bootstrap + operator-key delivery server side
│   ├── format/                 Team timezone + date formatting helpers
│   ├── http/                   Request base URL, Origin/Host same-origin guard
│   ├── platforms/              Platform family helpers, rollout scope
│   ├── proxies/                Liveness probe + verdicts, bandwidth probe, exit-IP lookup,
│   │                           SOCKS5 tunnel handling, bulk import actions
│   ├── r2/                     S3-compatible R2 client (hand-rolled SigV4), config
│   ├── relay/                  Relay release metadata (file or R2), download token,
│   │                           device locality, version status, profile readiness,
│   │                           retirement authorization/finalization
│   ├── retirement/             Relay device retirement server actions
│   ├── setup/                  Setup state machine, checklist, Relay probe, installer
│   │                           candidate/release metadata and file serving
│   ├── tickets/                Ed25519 server key, ticket issuer/verifier, sealed box,
│   │                           replay guard, rate limit, recipient lookup, device keys
│   └── totp/                   TOTP code generation
├── proxy.ts                    Page-level auth gate (real session check, nodejs runtime)
relay/
└── src/                        Windows Relay bridge (Node SEA executable, 127.0.0.1:47821)
    ├── main.ts                 Entry: startup bootstrap parent, HTTP server on loopback
    ├── handle-ticket.ts        Ticket verification: signature, version floor, replay journal
    ├── handle-secret.ts        Decrypt operator-zone secrets, serve the local secret window
    ├── create-profile.ts / launch-profile.ts   Drive MKT Browser MCP (127.0.0.1:47822)
    ├── relay-antidetect.ts     MktBrowserAdapter on the Relay side, token discovery
    ├── spent-ticket-journal.ts Persistent single-use journal (restart/kill safe)
    ├── handle-receive-operator-key.ts / handle-seal-operator-key.ts   Key grant flow
    ├── device-retirement*.ts   Signed retirement, receipt, recovery, finalization
    └── relay-config.ts / relay-identity.ts / windows-secure-store.ts  Config, identity, DPAPI
scripts/                        CLI tools (all run via npm scripts; see README command table)
prisma/
├── schema.prisma               9 models (below)
└── migrations/                 Versioned SQL migrations
```

## Data model (`prisma/schema.prisma`)

| Model | Purpose |
|---|---|
| `Proxy` | One static proxy. `host+port+username` unique; liveness and bandwidth results stored per proxy, with `lastExitIp` deliberately unencrypted so it can be compared against the provider |
| `Account` | One nick. Platform (`REDDIT \| FACEBOOK \| TIKTOK`), username (`@@unique([platform, username])`), operator-zone credential columns (`passwordEnc`, `emailPasswordEnc`, `totpSecretEnc`), status lifecycle fields, `proxyId @unique`, `antidetectProfileId @unique`, `ownerId`, `deviceId` |
| `RelayDevice` | One registered PC: X25519 public key, owner, revocation state, operator-key grant state, reported Relay version |
| `AuditLog` | Every sensitive action with actor and context |
| `User` / `Session` / `AuthAccount` / `Verification` / `RateLimit` | Better Auth tables; rate limits are database-persisted |

The ownership chain is the load-bearing part of the schema: `proxyId` and `antidetectProfileId`
are `@unique` (one nick per proxy/profile), and the invariant "device belongs to the nick's owner"
is checked in cluster assignment and re-checked before ticket issuance; the operations warning tray
surfaces rows that drift.

## Key flows

**Profile launch** (the core flow):
`/accounts/[id]` → `POST /api/accounts/[id]/launch` → guardedRoute checks session →
`profile-launch-ticket-issuance.ts` resolves the nick's device recipient (`ticket-recipient-lookup.ts`),
verifies readiness and ownership, signs a sealed ticket (`ticket-issuer.ts` → `ticket-sealed-box.ts`)
→ the browser POSTs it to `127.0.0.1:47821` → Relay verifies signature, version floor, replay
journal (`handle-ticket.ts`) → decrypts, pushes the proxy config into the profile, launches through
MKT Browser MCP (`launch-profile.ts`) → audit row written server-side.

**Credential/OTP reveal**: same ticket path with a different kind; Relay serves the secret in its
own local window (`secret-page.ts`), never through the web page. Reveal tickets are rate-limited
(`ticket-rate-limit.ts`).

**Relay enrollment + operator key grant**: a new PC generates an X25519 keypair (`relay-device-key.ts`),
registers at `/setup` → ADMIN approves in `/relay-devices` → the ADMIN's Relay wraps
`VAULT_KEY_OPERATOR` to the recipient's public key (`handle-seal-operator-key.ts` on Relay,
`operator-key-delivery-actions.ts` on the server) → the recipient PC self-collects and stores it in
the DPAPI-protected store. The first team PC is the one exception: its key is pasted manually into
the Relay's local status page, because no other Relay exists yet to wrap it.

**Revocation and retirement**: revoke blocks new tickets and unpins nicks (same transaction, counts
reported); planned retirement adds signed authorization + durable receipt + local cleanup
(`src/lib/retirement/` + `relay/src/device-retirement*.ts`). Owner cleanup only touches the owner's
own already-revoked record. Browser profiles are never deleted by Relay retirement.

**Proxy checks**: the liveness probe routes through the proxy itself and returns one of five
verdicts (`proxy-liveness-verdict.ts`); the bandwidth probe pulls 1 MB and is deliberately
per-proxy and manual (paid quota).

**Backups**: `db:backup`/`db:backup:remote` (`scripts/backup-database.ts` →
`src/lib/db/database-backup.ts`); nightly R2 upload (`src/lib/backup/`); restore proof
(`scripts/restore-database-verify.ts`).

**Optimistic concurrency on account writes**: the nick edit and cluster-assignment forms carry the
rendered `Account.updatedAt` revision; the update is conditioned on it and a stale write is
rejected whole, before any audit or side effect. Proven by sequential winner/loser writes against
real PostgreSQL in the `vault-edit-actions` and `account-cluster-assignment` database tests.

## Where tests live

- `*.test.ts` co-located with the code they test (`src/`, `relay/src/`, `scripts/`).
- `npm run test:no-db` runs the non-destructive suite anywhere; `npm run test:relay` targets
  `relay/src/` (guarded tests engage on Windows, which is where CI runs them); `npm test` adds the
  PostgreSQL suite against the dedicated `*_test` database.
- Structural tests worth knowing: `guarded-entry-points.test.ts` (every server export must be
  wrapped), the crypto registry test (schema columns vs vault zones), and source-scan tests where a
  silent failure class is banned outright rather than tested around.
