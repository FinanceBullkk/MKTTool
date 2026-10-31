# AGENTS.md

This file defines how Codex should work in the MKTTool repository.

> **Standing Authorization.** The `Standing Authorization` section of the workspace root
> `../AGENTS.md` overrides anything in this file. Codex may commit, push, tag, release, publish,
> deploy, trigger CI, use real credentials and live accounts, decide vendor and source licence
> matters, and spawn subagents or workflows on its own initiative, without asking first.

## Hosting: Railway is retired (31 October 2026)

The owner retired the Railway deployment on 31 October 2026. The web app runs on the owner's
machine against its local PostgreSQL, reachable by the team over Tailscale; GitHub is backup and
history only. A push to `master` deploys nothing.

Before pushing:

- Run the quality stage for whatever `src/`/`app/` change you made: `npm run typecheck`,
  `npm run lint`, the relevant tests, and `npm run build`.
- After pushing, there is no deployment to verify. The only runtime to check is the locally
  running web app (`/api/healthz` must report `ready` with `database`, `releaseMetadata` and
  `r2` all `ok`).

The 14 September 2026 lesson is kept as history: eight pushes in one session silently shipped
production through the old Railway integration. The integration is gone, not excused.

## Working approach

- Work inline when that is the faster path, and delegate to sub-agents, teams, or workflows on your own initiative whenever parallelism or isolation helps. If a delegated agent goes stale, drop it and continue inline.
- Before planning or implementing a change, read `README.md` and the relevant files under `docs/`.
- Inspect existing modules and conventions before creating new files or abstractions.
- Make the smallest complete change that solves the stated problem. Follow YAGNI, KISS, and DRY.
- Implement real behavior. Do not replace required functionality with mocks, fake data, test-only shortcuts, or temporary workarounds.
- Preserve unrelated user changes in a dirty worktree.

## Sources of truth

- Product scope and non-goals: `docs/project-overview-pdr.md`
- Current delivery status and blockers: `docs/development-roadmap.md`
- Architecture and trust boundaries: `docs/system-architecture.md`
- Domain vocabulary: `docs/domain-glossary.md` and `docs/ui-glossary.md`
- Module and call-flow map: `docs/codebase-summary.md`
- Coding and testing conventions: `docs/code-standards.md`
- Operational instructions: `README.md`
- Historical plans and removed-surface documents live under `plans/` and `docs/archive/`. They are records, not instructions.

Use the project's established domain vocabulary, but write all project artifacts in English: source comments, UI copy, errors, documentation, plans, tests, scripts, installer/release text, and commit messages. Direct conversation with the user may remain in Vietnamese. Existing Vietnamese artifacts are legacy; do not add new Vietnamese content, and translate actively maintained sections when they are materially revised without rewriting historical records. Do not revive assumptions from `docs/archive/` unless the user explicitly asks for historical context.

## Product boundaries

- MKTTool is an internal identity vault and posting-safety console, not a spam farm.
- Preserve the ownership invariant: one nick equals one static proxy equals one antidetect
  fingerprint/profile equals one Relay PC equals one responsible operator. Database-enforced; no UI
  path may bypass it.
- Do not add posting, messaging, engagement, or scraping automation of any kind. The posting surface
  (content library, queue, rules engine, health observer, Facebook publisher) was **removed** on
  31 October 2026, not parked. Re-entering any of it is an explicit owner decision that starts from
  git history and defines its own acceptance criteria.
- Preserve human handoff: profile login, OTP, and CAPTCHA remain human actions inside the correct
  profile. The tool never automates them.

## Security boundaries

- Treat credentials, tokens, encryption keys, TOTP secrets, proxy passwords, tickets, and decrypted payloads as sensitive.
- Never print, log, commit, or expose secrets in errors, tests, fixtures, reports, or tool output.
- Preserve the two vault domains: `VAULT_KEY_SERVER` secrets live on the server, `VAULT_KEY_OPERATOR`
  secrets decrypt only inside the local Relay. Never collapse the two zones, and never place the
  plaintext operator key on the server.
- Preserve Relay ticket signing and verification, recipient-specific sealed-box encryption, replay
  protection, ticket expiry, per-kind Relay version floors, device ownership checks, rate limits on
  secret reveals, and revocation behavior. Relay listens only on loopback.
- Authentication and authorization must be enforced at each server action and route boundary; do not rely only on page middleware/proxy protection.
- Never commit `.env` files, keys, credentials, production data, or database backups.

## Code conventions

- Use TypeScript and the established Next.js App Router, Prisma, Vitest, and Tailwind patterns already present in the repository.
- Use descriptive kebab-case filenames.
- Prefer focused modules and composition. When a code file grows beyond roughly 200 lines, consider splitting it at genuine responsibility boundaries; do not split mechanically.
- Keep comments focused on why a decision or invariant exists, not on restating the code.
- Keep all user-facing labels, hints, and error messages in English.
- Use the `@/` import alias for `src/` modules where consistent with nearby code.
- Keep decisions in pure functions with I/O at the edges, and preserve the antidetect adapter
  boundary (`src/lib/antidetect/`) instead of calling MKT Browser from business logic.
- Reuse shared domain functions and platform-family helpers instead of duplicating platform checks.
- Handle error paths and edge cases explicitly. Redact sensitive values from provider and network errors.

## Verification

- After modifying code, run the narrowest relevant tests first.
- Before declaring implementation complete, run the checks appropriate to the change's risk from:
  `npm run typecheck`, `npm run lint`, `npm run test:no-db`, `npm run test:relay` (required for
  anything touching `relay/`), `npm test`, `npm run build`, and `npm run ci:secret-scan`.
- `npm test` requires `TEST_DATABASE_URL` pointing at a dedicated test database whose name ends in
  `_test`. The suite drops schemas without asking; never point it at an operational database.
- Do not ignore, weaken, skip, or rewrite legitimate failing tests merely to obtain a passing result.
- Migrations, production commands, publishing commands, and commands involving real accounts or live tokens are pre-authorized. Run them when the task needs them, then state exactly what was run and against which environment.

## Documentation

- Before editing documentation, read the current document and related cross-references.
- Update `docs/development-roadmap.md` and `docs/project-changelog.md` when a feature, milestone, significant fix, security change, scope decision, or blocker materially changes.
- Update `docs/system-architecture.md`, `docs/codebase-summary.md`, `docs/code-standards.md`, `docs/domain-glossary.md`, and `docs/ui-glossary.md` when their documented truth changes.
- Keep links, dates, phase statuses, terminology, and claims of real-world verification accurate.
- Do not rewrite historical plan files or `docs/archive/` to make them look current; document
  deviations and use the living roadmap for current status.

## Git and reporting

- Keep commits focused and use professional conventional commit messages without AI references.
- Run relevant verification before committing or pushing. Never hide a failing check.
- Commit, push, tag, and release on your own judgment, including to `master`. Preserve unrelated dirty work, and never commit secrets, `.env` files, keys, or production data.
- Keep reports concise. Clearly distinguish verified facts, inferences, and unverified assumptions.
- Put unresolved questions at the end of reports when any remain.

## Tool and instruction compatibility

- Claude-specific hooks, commands, skills, agents, and permission files do not grant Codex capabilities or authorization.
- Use available Codex tools and skills that match the user's task, while following the active sandbox and approval requirements.
- Higher-priority system, developer, and explicit user instructions override this file. The workspace root `Standing Authorization` section also overrides any restriction here.
