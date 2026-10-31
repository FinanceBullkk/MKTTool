# MKTTool documentation — where to start

**Updated:** 31 October 2026

The repository is post-surgery: an internal identity vault, proxy vault, Relay PC registry, and
signed-ticket launch into MKT Browser profiles. The posting surface was **removed** (not parked) on
31 October 2026 — see the [PDR](project-overview-pdr.md) and the `2026-10-31` entry in the
[changelog](project-changelog.md). Documents describing the removed surface live in
[archive/](archive/README.md) and are records, not instructions.

Tra theo câu hỏi bạn đang có — look up by the question you actually have:

| You want to know | Read |
|---|---|
| Install, run, commands, tests, deploy in brief | [../README.md](../README.md) — the operations readme, read first |
| What the product is, for whom, what it refuses to do | [project-overview-pdr.md](project-overview-pdr.md) |
| Where it runs, what trusts what, how it fails | [system-architecture.md](system-architecture.md) |
| Where the code lives, which flow calls what | [codebase-summary.md](codebase-summary.md) |
| What "nick", "Relay PC", "ticket", "vault zone" mean and why | [domain-glossary.md](domain-glossary.md) |
| The exact user-facing labels and their code boundaries | [ui-glossary.md](ui-glossary.md) |
| Coding, testing, and commit conventions | [code-standards.md](code-standards.md) |
| Current state, what is green, open follow-ups | [development-roadmap.md](development-roadmap.md) |
| What changed, on which date | [project-changelog.md](project-changelog.md) |
| Deploying to Railway, variables, health verification | [deployment-guide.md](deployment-guide.md) |
| Production backups, restore proof | [runbooks/database-restore.md](runbooks/database-restore.md); background in [database-backup-and-restore.md](database-backup-and-restore.md) |
| Alerting when production dies | [runbooks/uptime-alerting.md](runbooks/uptime-alerting.md) |
| Rolling back a Railway deployment (human-approved) | [runbooks/release-rollback.md](runbooks/release-rollback.md) |
| Rotating vault keys / the release token after exposure | [credential-rotation-runbook.md](credential-rotation-runbook.md) |
| Developing the web app on macOS (deferred MKB-07 reference) | [macos-development-setup.md](macos-development-setup.md) |
| What the removed surface looked like | [archive/](archive/README.md) and git history |

## Three reading paths

**A new operator on the team:** start with [../README.md](../README.md), then
[project-overview-pdr.md](project-overview-pdr.md) for the boundaries, and keep
[ui-glossary.md](ui-glossary.md) open in a tab.

**A new developer on the repo:** [project-overview-pdr.md](project-overview-pdr.md) →
[system-architecture.md](system-architecture.md) → [codebase-summary.md](codebase-summary.md) →
[code-standards.md](code-standards.md), with [domain-glossary.md](domain-glossary.md) in a tab.

**The decision maker:** [project-overview-pdr.md](project-overview-pdr.md) →
[development-roadmap.md](development-roadmap.md) → the `2026-10-31` entry in
[project-changelog.md](project-changelog.md).

## Historical plans

Detailed phase specifications live under `plans/` in the workspace. Those files are records of
decisions at the time they were written, plus appended "what was done differently" notes — they are
not rewritten. For current status, always use [development-roadmap.md](development-roadmap.md).
