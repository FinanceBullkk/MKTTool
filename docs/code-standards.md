# Code standards

**Updated:** 31 October 2026

Conventions that are actually used in this repository, not aspirations. Architecture is in
[system-architecture.md](system-architecture.md); the file map is [codebase-summary.md](codebase-summary.md).

---

## 1. Language

**English is required for every project artifact:** source comments, identifiers, UI copy, error
messages, documentation, plans, tests, scripts, installer/release text, and commit messages.
Vietnamese is reserved for direct conversation with the project owner.

Existing Vietnamese files are legacy. Do not add new Vietnamese content. When an actively
maintained section is materially changed, translate that section or document to English; do not
rewrite historical records merely to make their language look current.

## 2. Files

- **kebab-case**, named for the thing it does: `account-readiness.ts`, not `accReady.ts`. Long,
  specific names exist so Grep finds the file instead of the reader opening every candidate.
- **Under 200 lines.** Past that, split at a genuine responsibility boundary — not to hit a quota.
- **One concept per file.** One action domain per file, one adapter per file. Shared types live in
  their own file (`action-result.ts`), never as a rider on an unrelated module.

## 3. Server actions

Every server action returns `ActionResult { ok: boolean; message: string }`
(`lib/actions/action-result.ts`). `message` is an English sentence shown directly to the user:
**state what happened and what to do next**, rather than exposing a technical error code.

Name actions verb + object: `createAccount`, `assignAccountCluster`, `revokeRelayDevice`. Group by
domain under `lib/<domain>/`; do not pile everything into one `actions.ts`.

## 4. Pure functions where decisions live

Wherever logic is worth testing, split the decision from the I/O:

| Pure function | I/O wrapper around it |
|---|---|
| `account-readiness.ts` verdicts | server actions that load the account |
| `proxy-liveness-verdict.ts` | the probe that makes the network request |
| `ticket-sealed-box.ts` crypto steps | `ticket-issuer.ts` and the Relay's consumer |

This is why most tests need no database, no network, and no real tokens.

## 5. Tests

Three suites, three different needs:

| Command | Needs | Covers |
|---|---|---|
| `npm run test:no-db` | Nothing | Fast, non-destructive logic tests; runs anywhere |
| `npm run test:relay` | Nothing locally (guarded tests engage on Windows, which is where CI runs it) | The Relay bridge under `relay/src/` |
| `npm test` | `TEST_DATABASE_URL` pointing at a `*_test` database | Everything, including PostgreSQL database tests |

File suffixes: `*.test.ts` never touches the database; `*.database.test.ts` touches real Postgres
and calls `deleteMany()` first. `fileParallelism: false` is deliberate — database files share one
database, and parallel runs fail randomly, which trains people to believe "rerun until green".

`TEST_DATABASE_URL` is **required** and must end in `_test` — the global setup runs `DROP SCHEMA`
without asking, so `assertIsTestDatabase()` rejects every other name. There is deliberately no
default value: a default like `localhost/mkttool_test` would silently point at somewhere the
reader did not expect on someone else's machine.

**Do not mock what you are trying to verify.** A mocked provider proves the mock works. Where a
real-world check exists (`vault:smoke` against a live database, `relay:verify` against the packaged
executable), run it — those checks exist because mocked tests alone passed things that were broken.

## 6. Comments

Comments answer **"why"**, not "what". Prefer explaining:

- why the step order cannot be swapped (apply the proxy **before** opening the profile),
- why a threshold is that number,
- why a failure path must stop outright instead of warning,
- why the more obvious alternative was **not** taken.

Business knowledge behind a decision belongs in [domain-glossary.md](domain-glossary.md); the code
points there.

## 7. Constraints and errors

- **Business constraints are enforced at the database** (`@unique`, `@@unique`), not only in the UI.
- **Do not swallow errors.** A failed decryption, probe, or provider call reports and stops. A
  truthful "unknown" must be distinguishable from "fine" — an unreadable state is never rendered as
  healthy.
- **Deletion is blocked while anything references the record** (`reference-guard.ts`), with a
  message that names the blocker.
- **Redact secrets from every error path** — external APIs echo back the parameters you sent. A new
  `*Enc` column must be declared in `encrypted-field-registry.ts`, or `vault:rekey` will miss it.
  The column must carry a `// vault:server` or `// vault:operator` marker in `schema.prisma` and be
  registered in the right zone; the zone is a per-column decision and a test enforces it. At
  encryption time, `encryptCredential` defaults to the `server` key, so an `operator`-zone column
  **must** pass `loadVaultKey("operator")` explicitly. Wrong-zone data is unrecoverable.

## 8. Before you commit

```bash
npm run lint            # must be clean: 0 errors, 0 warnings
npm run typecheck
npm run test:no-db
npm test                # needs the *_test database
npm run build
npm run ci:secret-scan
```

`npm run test:relay` for anything touching `relay/`. Run the narrowest relevant suite first; run
all of the above before declaring work complete. Never ignore, weaken, skip, or rewrite a
legitimate failing test to obtain a pass.

**Never commit:** `.env`, anything under `data/` (especially `data/backups/` — a `pg_dump` contains
the full ciphertext), keys, tokens, passwords. `.gitignore` already blocks these — do not use
`git add -f` around it.

## 9. Commit messages

Conventional Commits in English, describing the **outcome**, not the editing action:

```
feat(vault): add optimistic concurrency to account writes
fix(relay): fail closed on invalid spent-ticket journal state
```

Scopes follow the domain: `vault`, `relay`, `tickets`, `proxies`, `accounts`, `setup`, `r2`,
`backup`, `db`, `security`, `ui`, `scripts`.

## 10. Database changes

1. Edit `prisma/schema.prisma`
2. `npm run db:migrate` — generate the migration (developer command)
3. Commit **both** the migration folder and the schema

Recipients upgrade with `npm run db:upgrade` (backs up first, then applies) — **never** with
`db:migrate`, which may prompt, create new migrations, and in some situations offer to rebuild the
database from scratch. That offer, accepted, deletes the vault.

## 11. Update documentation together with code

| Change | Update |
|---|---|
| Adding/changing files under `src/` or `relay/` | [codebase-summary.md](codebase-summary.md) |
| Adding a domain concept | [domain-glossary.md](domain-glossary.md) |
| Changing user-visible behavior | [../README.md](../README.md) + [project-changelog.md](project-changelog.md) |
| Changing scope or boundaries | [project-overview-pdr.md](project-overview-pdr.md) |
| Changing delivery status | [development-roadmap.md](development-roadmap.md) |

Documentation that disagrees with the code is worse than no documentation: it makes the reader trust
something that is already wrong.
