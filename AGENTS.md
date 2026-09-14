# AGENTS.md

This file defines how Codex should work in the MKTTool repository.

> **Standing Authorization.** The `Standing Authorization` section of the workspace root
> `../AGENTS.md` overrides anything in this file. Codex may commit, push, tag, release, publish,
> deploy, trigger CI, use real credentials and live accounts, decide vendor and source licence
> matters, and spawn subagents or workflows on its own initiative, without asking first.

## Pushing this repository deploys production

**A push to `master` here is a production deployment.** Railway is wired to GitHub source
integration, so it builds and releases whatever lands on `master`, with no workflow, no approval and
no separate step. There is nothing to trigger and nothing to forget - it simply happens.

On 14 September 2026 eight deployments went out this way in a single session. The person pushing
reported the work as "pushed" each time, which was true and incomplete: production had shipped.
Nothing broke, because every commit touched only `scripts/`, `relay/` and `docs/`, and the Next.js
server imports none of those. That was luck about file scope, not a control.

So, before pushing:

- If the change touches `src/` or `app/`, treat the push as a release. Run the quality stage first.
- After pushing, verify rather than assume - the workspace `AGENTS.md` requires the exact deployed
  SHA to be checked:

```powershell
git rev-parse HEAD                                     # must equal origin/master
railway deployment list | Select-Object -First 3       # newest must be SUCCESS
Invoke-WebRequest https://mkttool-web-production.up.railway.app/api/healthz -UseBasicParsing
```

Health must report `ready` with `database`, `releaseMetadata` and `r2` all `ok`.

- A change meant for the *next* release candidate still goes live the moment it is pushed here.
  There is no staging branch. If that is not what you want, do not push it yet.

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
- Domain vocabulary: `docs/domain-glossary.md`
- Module and call-flow map: `docs/codebase-summary.md`
- Coding and testing conventions: `docs/code-standards.md`
- Operational instructions: `README.md`
- Historical plans are records of decisions at the time. For current status, prefer `docs/development-roadmap.md`.

Use the project's established domain vocabulary, but write all project artifacts in English: source comments, UI copy, errors, documentation, plans, tests, scripts, installer/release text, and commit messages. Direct conversation with the user may remain in Vietnamese. Existing Vietnamese artifacts are legacy; do not add new Vietnamese content, and translate actively maintained sections when they are materially revised without rewriting historical records. Do not revive assumptions from `docs/archive/` unless the user explicitly asks for historical context.

## Product boundaries

- MKTTool is an internal identity vault and posting-safety console, not a spam farm.
- Preserve the invariant for Reddit accounts: one nick equals one static proxy equals one antidetect fingerprint/profile.
- Do not add auto-DM, bulk messaging, reply hijacking, automatic CAPTCHA solving, automated Facebook Group posting, or unsupervised 24/7 bot behavior.
- Reddit automation must preserve human handoff and the project's semi-automated operating model.
- Facebook Pages use the official Graph API. Reddit identities use the operator machine, Relay, antidetect browser, and the account's static proxy.

## Security boundaries

- Treat credentials, tokens, encryption keys, TOTP secrets, proxy passwords, tickets, and decrypted payloads as sensitive.
- Never print, log, commit, or expose secrets in errors, tests, fixtures, reports, or tool output.
- Preserve the two vault domains: server secrets and operator secrets must not be collapsed into one trust boundary.
- Preserve Relay ticket signing, recipient-specific encryption, replay protection, expiry checks, device ownership checks, and revocation behavior.
- Authentication and authorization must be enforced at each server action and route boundary; do not rely only on page middleware/proxy protection.
- Never commit `.env` files, keys, credentials, production data, or database backups.

## Code conventions

- Use TypeScript and the established Next.js App Router, Prisma, Vitest, and Tailwind patterns already present in the repository.
- Use descriptive kebab-case filenames.
- Prefer focused modules and composition. When a code file grows beyond roughly 200 lines, consider splitting it at genuine responsibility boundaries; do not split mechanically.
- Keep comments focused on why a decision or invariant exists, not on restating the code.
- Keep all user-facing labels, hints, and error messages in English.
- Use the `@/` import alias for `src/` modules where consistent with nearby code.
- Keep database access outside pure rule evaluators. Preserve the `RuleContext` plus pure evaluator architecture.
- Reuse shared domain functions and platform-family helpers instead of duplicating platform checks.
- Handle error paths and edge cases explicitly. Redact sensitive values from provider and network errors.

## Verification

- After modifying code, run the narrowest relevant tests first.
- Before declaring implementation complete, run appropriate project checks from: `npm test`, `npm run typecheck`, `npm run lint`, and `npm run build` according to the change's risk.
- Do not ignore, weaken, skip, or rewrite legitimate failing tests merely to obtain a passing result.
- Database tests must use the dedicated test database whose name ends in `_test`. Never point destructive test setup at an operational database.
- Migrations, production commands, publishing commands, and commands involving real accounts or live tokens are pre-authorized. Run them when the task needs them, then state exactly what was run and against which environment.

## Documentation

- Before editing documentation, read the current document and related cross-references.
- Update `docs/development-roadmap.md` and `docs/project-changelog.md` when a feature, milestone, significant fix, security change, scope decision, or blocker materially changes.
- Update `docs/system-architecture.md`, `docs/codebase-summary.md`, `docs/code-standards.md`, and `docs/domain-glossary.md` when their documented truth changes.
- Keep links, dates, phase statuses, terminology, and claims of real-world verification accurate.
- Do not rewrite historical plan files to make them look current; document deviations and use the living roadmap for current status.

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
