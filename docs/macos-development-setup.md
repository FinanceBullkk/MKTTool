# macOS development setup

Covers only what differs on a Mac. For product behaviour, commands, and operating rules, the
[README](../README.md) remains the source of truth; do not duplicate it here.

Two repositories are involved:

| Repository | Purpose | Runs on macOS today |
|---|---|---|
| `Techieslab-app/MKTTool` | Web app, Relay source, scripts | Yes, in development |
| `FinanceBullkk/MKTBrowser` | The MKT Browser desktop fork | Builds and runs; not verified, see MKB-07 |

**Platform status:** v1 commits to Windows x64 only. macOS is [MKB-07](../plans/260810-0244-mkt-browser-noi-bo/plan.md),
after v1. Working on a Mac is fully supported for development; it is the *release* path that does not
exist yet. Nothing below counts as MKB-07 evidence.

## 1. Prerequisites

```bash
xcode-select --install
brew install node@22 postgresql@17     # the project runs on Node 24; 22 is the floor
brew services start postgresql@17
```

Put the Postgres `bin` directory on `PATH`. Without it `npm run db:backup` cannot find `pg_dump`,
and the tool says exactly that rather than failing vaguely:

```bash
echo 'export PATH="/opt/homebrew/opt/postgresql@17/bin:$PATH"' >> ~/.zshrc
```

Keep `pg_dump` at least as new as the server it dumps. A client older than the server fails; this
already happened once against the Railway database.

For the MKT Browser fork only:

```bash
corepack enable && corepack prepare yarn@4.5.0 --activate
```

## 2. Secrets — read before copying anything

`.env` is never committed and never pasted into chat, an issue, or a support message. Move it
between machines through a password manager or an encrypted transfer.

**The vault keys decide whether this Mac can read existing data.** `VAULT_KEY_SERVER` and
`VAULT_KEY_OPERATOR` are the only way to decrypt their domains:

- Copy the **existing** keys → the Mac reads the same vault.
- Generate new keys with `npm run vault:keygen` → a separate, empty vault. Existing encrypted rows
  stay unreadable. There is no recovery path; this is a decision, not a setting.

If both machines will hold real data, both keys belong in a password manager first.

## 3. Database

Two databases, and the test one **must** end in `_test`. The suite runs `DROP SCHEMA` without
confirming, so it refuses any database that breaks the naming rule:

```bash
createdb mkttool_dev
createdb mkttool_test
```

Set `DATABASE_URL` and `TEST_DATABASE_URL` in `.env`, then:

```bash
npm ci
npm run db:upgrade
```

Want the real fleet locally? Do not connect the app straight to Railway — pull a dump and restore it
into `mkttool_dev`. `npm run db:backup:remote` produces the dump; direct connections require turning
off certificate verification, which is not worth it for a dev loop.

`TEAM_TIMEZONE` is mandatory and has no fallback to the machine clock. Changing it requires a
rebuild, not a restart, because the value is inlined into the browser bundle.

## 4. Run the web app

```bash
npm run dev          # http://localhost:3000
npm test             # 114 files
npm run typecheck
npm run lint
```

Only one dev server can hold port 3000. A second `next dev` reports success and then dies quietly,
so check whether another session already owns it.

## 5. Relay on macOS

`npm run relay:dev` runs the Relay from source and is the supported development path.

**`npm run relay:build` refuses to run on macOS, by design.** Node SEA packs the runtime of the host
machine, so building there produces a file named `.exe` that is actually a Mach-O binary. It would
travel all the way to an operator device before failing. Package the Relay on Windows.

The installed Relay trusts exactly one web origin, baked in at build time, which points at Railway.
Against a local server it rejects the call and the symptom reads like "the Relay is not running". To
test a local web app, set `webOrigin` in the Relay config file:

```json
{ "webOrigin": "http://localhost:3000" }
```

An empty or absent value keeps the built-in origin, which is correct for every real device.

## 6. MKT Browser fork on macOS

```bash
git clone https://github.com/FinanceBullkk/MKTBrowser.git && cd MKTBrowser
yarn install --immutable        # yarn.lock must not change
yarn typecheck
yarn workspace @mktbrowser/desktop test:w02    # the W01+W02 guards, 8 tests
yarn workspace @mktbrowser/desktop build
```

The guards are pure unit tests over injected options, so they pass on any platform. Green here means
the identity contract is portable, not that the app is verified on macOS.

Architecture is a hard gate. Rosetta is not acceptance:

```bash
APP="$(find apps/desktop/release -type d -name 'MKT Browser.app' -print -quit)"
lipo -archs "$APP/Contents/MacOS/MKTBrowser"
find "$APP" -name 'better_sqlite3.node' -exec lipo -archs {} \;
```

Run it against a disposable data directory, never an operational one:

```bash
DATA="$(mktemp -d)"
env -u ELECTRON_RUN_AS_NODE "$APP/Contents/MacOS/MKTBrowser" "--user-data-dir=$DATA" &
curl -s -o /dev/null -w '%{http_code}' http://127.0.0.1:47822/healthz   # expect 401
```

The MCP port is **47822**, not the upstream `7777`. Never echo the token from `$DATA/mcp-token`.

macOS stores profiles under `~/Library/Application Support/MKTTool/MKTBrowser`; the Windows-only
`LOCALAPPDATA` branch does not apply. Gatekeeper will complain because the build is ad-hoc signed
with `notarize: false` — right-click → Open. That is a development build, not release readiness.

Engine and proxy verification follow the
[Apple Silicon runbook](../../MKTBrowser/docs/mkb-00-apple-silicon-verification.md). Its sections 1–4
target the unmodified upstream baseline on port `7777`; when testing this fork instead, substitute
`MKT Browser.app`, executable `MKTBrowser`, and port `47822`.

## 7. Not available on macOS yet

Signed and notarized `.dmg`, the LaunchAgent Relay helper, Keychain storage, the one-download
installer, per-user autostart, and CI coverage. All of it is MKB-07 and needs Apple Developer
enrollment, which must not be bought during v1.

## 8. Gotchas

| Symptom | Cause |
|---|---|
| `pg_dump` not found | Postgres `bin` missing from `PATH` |
| Dump fails against Railway | Local `pg_dump` older than the server |
| Test run wipes data | `TEST_DATABASE_URL` pointed at a non-`_test` database |
| Encrypted fields unreadable | Different vault keys than the machine that wrote them |
| Dev server starts then dies | Another session already holds port 3000 |
| Relay says it is not configured | `webOrigin` still points at Railway while testing localhost |
| `relay:build` refuses | Correct: SEA packaging is Windows-only |
| App opens as x86_64 | Rosetta; rebuild natively before recording any result |
