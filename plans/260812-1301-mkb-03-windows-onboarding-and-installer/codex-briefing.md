# Codex briefing — MKB-03

Read this before any MKB-03 phase. The per-phase file holds the work; this file holds everything
that is true for all of them.

## Repositories

Two separate git repositories under `e:\MKTWorkspace`, deliberately not one:

| Path | What it is | Branch |
|---|---|---|
| `e:\MKTWorkspace\MKTTool` | Web app, Relay, plans, docs | `feat/mkt-browser-clean-break` |
| `e:\MKTWorkspace\MKTBrowser` | Electron desktop fork | `main` |

Repository rules: `MKTTool/AGENTS.md`. Specification: `MKTTool/plans/260810-0244-mkt-browser-noi-bo/plan.md`.
Execution plan: `MKTTool/plans/260812-1301-mkb-03-windows-onboarding-and-installer/`.

## Hard safety constraints

**Never read, write, move, or delete anything under these paths.** They are the live operator install
on this machine:

```
%LOCALAPPDATA%\MKTTool-Relay\
%LOCALAPPDATA%\MKTTool\MKTBrowser\
```

`relay-config.json` in the first holds the operator-domain key. Losing it makes every stored account
secret permanently undecryptable, and there is no copy anywhere else. Any test needing a Relay home
or a browser data root must **construct a temporary one** and delete it afterwards. Never discover the
real one.

**Never start, stop, or kill** `MKTBrowser.exe` or `MKTTool-Relay.exe`. Both are running and serving a
working demo chain. If a task genuinely cannot proceed without stopping them, stop and report instead.

**Never overwrite** `MKTBrowser/apps/desktop/release/win-unpacked/`. Its SHA-256
`238d5d6fd5e373b052c484ceab90698f6dc295205a59be6573f9928b01db4f42` is cited as MKB-02 gate evidence.
The installer writes to `release/installer/` for exactly this reason.

**Do not commit and do not push.** Leave changes in the working tree and report. Both repositories are
currently clean and synced with their remotes; keep it obvious what a review has to look at.

## Environment

- **MKTBrowser requires Node 22.** The machine default is Node 24 and `better-sqlite3` fails with
  `NODE_MODULE_VERSION 127 vs 137`. Prepend before any MKTBrowser command:
  ```powershell
  $env:Path = "E:\tools\node-v22.23.1;$env:Path"
  ```
- MKTBrowser uses yarn 4 through corepack: `corepack yarn ...`. MKTTool uses npm.
- MKTTool builds and tests fine on Node 24; only MKTBrowser needs the override.
- **`ELECTRON_RUN_AS_NODE=1` is inherited from the VS Code extension host.** Any Electron app launched
  from an agent shell runs as plain Node and exits instantly — no window, no port, no crash log, empty
  stderr, nothing written. It looks exactly like a broken build. Clear it before launching anything
  Electron:
  ```powershell
  Remove-Item Env:ELECTRON_RUN_AS_NODE -ErrorAction SilentlyContinue
  ```
- Windows ports in use: Relay `47821`, MKT Browser MCP `47822`. Do not bind them in tests.

## Conventions

- **English** for all code, comments, tests, docs, and reports. Vietnamese only in direct chat.
- YAGNI, KISS, DRY. Check for an existing module before creating one.
- Keep files under 200 lines; split by concern when one grows past that.
- kebab-case for JS/TS file names, long and descriptive.
- No fake data, mocks, stubs, or skipped assertions used to make something pass.
- Comments explain *why*, matching the density already in these repositories.

## Acceptance — run all of it, every phase

```powershell
# MKTTool
cd e:\MKTWorkspace\MKTTool
npm test ; npm run typecheck ; npm run lint ; npm run build

# MKTBrowser
$env:Path = "E:\tools\node-v22.23.1;$env:Path"
cd e:\MKTWorkspace\MKTBrowser
corepack yarn verify:node
corepack yarn typecheck
corepack yarn workspace @mktbrowser/desktop test:w02
corepack yarn workspace @mktbrowser/desktop test:mkb01
corepack yarn workspace @mktbrowser/desktop test:mkb01e
corepack yarn workspace @mktbrowser/desktop test:mkb02
corepack yarn workspace @mktbrowser/desktop test:packaging
```

Baselines as of 12 August 2026 — counts may **rise** as a phase adds tests, never fall, and nothing
may go red:

| Suite | Baseline |
|---|---|
| MKTTool | 119 files / 1155 tests |
| W02 | 2/2 + 8/8 |
| MKB-01 | 4/4 + 4/4 |
| MKB-01E | 7/7 |
| MKB-02 | 3/3 + 9/9 + 6/6 |
| packaging | 3/3 |

`corepack yarn lint` in MKTBrowser is a no-op — no workspace defines a lint task. Do not treat it as
signal.

## Things a human must do, not you

Stop and report when a phase reaches one of these; do not improvise a substitute:

- **Generating the manifest root key** and rehearsing recovery from the second copy (Phase 05). This
  is a physical ceremony with two separate storage media.
- **The gate rehearsal with an unfamiliar operator** (Phase 06). It cannot be self-assessed by
  whoever wrote the code.
- **Anything requiring a clean Windows account or a second physical device.**

## Known defects that are deliberately out of scope

`build:mac` and `build:linux` call electron-builder directly and skip the Electron-ABI rebuild for
`better-sqlite3`, the same defect repaired for Windows on 12 August. They belong to MKB-07 and cannot
be tested from Windows. Leave them alone.

## Report

Write to `e:\MKTWorkspace\MKTTool\plans\reports\codex-260812-phase-NN-<slug>.md`:
what was implemented, exact test output, anything left undone and why, and unresolved questions at
the end. Sacrifice grammar for concision.
