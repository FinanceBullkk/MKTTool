# Session record — 12 August 2026, 03:30–05:00

Scope: verify the MKB-02 close, commit it, publish Relay v7, decide code signing, and spike the
Windows installer. Both repositories end clean; nothing is pushed.

## 1. MKB-02 claims re-verified by running them

Every claim held. Numbers below are measured in this session, not copied from the changelog.

| Claim | Measured |
|---|---|
| MKTTool 119 files / 1155 tests | `Test Files 119 passed (119)`, `Tests 1155 passed (1155)` |
| MKTTool typecheck / ESLint / production build | exit 0 / exit 0 / exit 0 |
| MKTBrowser MKB-02 18/18 | 3 + 9 + 6 = 18 pass, 0 fail |
| MKTBrowser typecheck | exit 0 |
| Packaged runtime + lifecycle contracts | passed |
| Root lint is a no-op | confirmed — `Done in 0s`, 0 of 6 workspaces define `lint`, CI never runs it |
| `git diff --check` both repos | exit 0 |
| Artifact `238d5d6f…db4f42`, unsigned | hash matches, `NotSigned` |

Two out-of-scope dirty docs were the workspace path fixes in `docs/deployment-guide.md` and
`MKTBrowser/docs/mkb-00-source-license-engine-inventory.md`. Both were finished and correct, so they
were committed separately. The sweep behind them was incomplete: `plan.md` line 874 still pointed at
`E:\MKTBrowser\assets\…`, a live pointer to a path that no longer exists, and was corrected. Dated
evidence blocks and historical changelog entries keep their original paths on purpose.

## 2. Commits (8, none pushed)

```
MKTBrowser  main  ahead 3
  6f597fd  feat(mkb-02): complete managed mode with locks and correlated diagnostics
  82f7168  docs(mkb-02): record the completed managed-mode checkpoint
  14c5c4e  docs: point the fork inventory at the workspace checkout path

MKTTool  feat/mkt-browser-clean-break  ahead 5
  4f71a19  feat(relay): consume managed mode and gate on current-device health
  7ec0bc0  docs(mkb-02): close the managed-mode gate and set MKB-03 as next
  36832b2  docs: correct the workspace path and a broken source link
  b43893f  docs(mkb-03): accept an unsigned v1 installer and reset the onboarding gate
  47547a6  docs(mkb-03): carry the activity-sanitizer allowlist over from MKB-02
```

## 3. Decisions recorded

**`LAUNCH_PROFILE` floor raise — recorded exception, section 8.7.** The floor moved from the base to
Relay `7` although the payload shape did not change, which the standing rule forbids. Kept the rule
and wrote the exception beside it: the floor also guards the behaviour a Relay must implement, and a
Relay `6` parses the same body then performs the non-atomic sequence the gate exists to forbid. It
was affordable only because no operator device is enrolled; the rule regains full force at MKB-04.
`CREATE_PROFILE` gained `requestId`, so its move is an ordinary shape change, not part of the
exception.

**No Windows code-signing certificate.** v1 ships unsigned for five or six known internal operators.
The MKB-03 gate no longer forbids a SmartScreen prompt; exactly one click-through is permitted and
the setup journey must announce it with a marked screenshot beforehand — a surprised operator still
fails the gate. Release authority never depended on Authenticode: the offline manifest root is the
project's own keypair, so signed manifests, sequence pinning, anti-downgrade, rollback floor, and
delegated-key rotation all stand. Dropping the publisher check makes that root the *only* source of
release authority, so its private key must stay offline and out of CI. Recorded gap: the installer
binary is backed only by a checksum served from the same host, so a compromised release host could
hand a brand-new device a different installer before any local state is pinned.

An internal PKI was considered and rejected. It needs an administrator on each of six unmanaged
WORKGROUP machines and still does not clear SmartScreen, so it costs more operator friction than it
removes — worse than shipping unsigned, for a narrow gain.

"signed" appears in 13 places across the plan. Only the Authenticode ones were changed; the ticket,
manifest, and grant signatures are the project's own keys and were left untouched.

**Activity sanitizer allowlist carried into MKB-03A.** Section 6 requires local diagnostics to record
only an allowlisted subset. `ActivityLog.sanitize` redacts known-sensitive argument names and passes
every other key through. Nothing leaks today — every argument in the current tool set is classified
and covered by `activity-log-redaction.test.ts` — but it is the one default-allow seam left, and
MKB-03A adds new local operations whose arguments would feed straight into it.

## 4. Relay v7 built, verified, published

`RELAY_VERSION` moved 6 → 7, but the artifact on disk and R2 was still the 10 August v6 build, while
`readRelayRelease()` reports `version: RELAY_VERSION` — asserted from the constant, never measured
from the file. The download route would have served v6 bytes labelled `MKTTool-Relay-v7.zip`, and
that Relay would then reject every CREATE/LAUNCH ticket for being below the floor. Rebuilt after
committing so the artifact maps to a commit.

- Build reports `bản 7`; zip 32.6 MB; SHA-256 `5415c18519e78048b4c3392f3891069ac44226aea6854c4366437e08f27d785d`
- `relay:verify` passed in full, including `khai đúng phiên bản — bản 7`, forged/replayed/expired
  ticket rejection, and refusal to let the Web paste the operator key
- Published to R2 bucket `mkttool-relay-release`; post-upload hash matches

Verification required stopping the installed Relay because the harness refuses to measure the wrong
listener on `47821`. It was restarted immediately, then upgraded to v7 through `install-relay.ps1`.
The upgrade preserved `relay-config.json` (backed up first as `relay-config.backup-260812.json`).

Live chain on this PC after the upgrade:
`relayVersion 7 · configured true · browser.ready true · contract 3 · engine cloakbrowser
146.0.7680.177.5 ready · all four managed capabilities present`.

Worth noting: the existing config still carries the pre-W02 key name `multizenToken` and has no
`mktBrowserToken`, yet Relay reached ready — real-world confirmation that MKB-02's automatic MCP
token discovery works outside the tests.

## 5. Installer spike — the useful finding

`electron-builder.yml` already configures the NSIS target (`oneClick: false`, `perMachine: false`,
`allowToChangeInstallationDirectory: true`), so producing an installer needed no new engineering.
Built to a separate output directory so the MKB-02 evidence artifact stayed byte-identical.

Result: `MKTBrowser-Setup-win-x64.exe`, 106.8 MB, `NotSigned`, kept at
`apps/desktop/release/MKTBrowser-Setup-win-x64.exe` (gitignored).

Install → run → uninstall was exercised end to end:

- Installs per-user to `%LOCALAPPDATA%\Programs\MKTBrowser`, 404.6 MB, no UAC
- Creates a Start Menu shortcut, an uninstaller, and an `HKCU` uninstall entry reading
  `MKT Browser 0.3.1`
- **`Publisher` is empty** in that entry, and no autostart entry is created — both are MKB-03 polish
  items, not defects yet
- Uninstall removed the directory, the registry entry, and the shortcut
- **The data root survived intact**: 742 files before and after, `mcp-token` hash unchanged,
  `profiles.db` present. That is the MKB-03B requirement that uninstall preserves profiles

**The installed build does not start.** It shows a startup error dialog and quits. Root cause found:

| Build | `better_sqlite3.node` |
|---|---|
| Installed (NSIS) | `C4B95A94…` |
| `node_modules` (built for Node 22) | `C4B95A94…` — identical |
| Technical directory package (works) | `24E2E3CA…` |

`electron-builder.yml` sets `npmRebuild: false`, so the NSIS path packages the **Node-ABI** native
module. The working technical package is produced by `scripts/package-windows-directory.cjs`, which
calls `@electron/rebuild` with `onlyModules: ["better-sqlite3"]`, `force: true` against the packaged
Electron version before packing.

**Fix for MKB-03B:** run that same rebuild step before `electron-builder --win`, or make the
installer path reuse `package-windows-directory.cjs`'s rebuild. Do not simply flip `npmRebuild: true`
without checking why it was disabled for the yarn-workspace layout.

This is the third time this project has been bitten by native-module ABI mismatch — after the Node 24
test failure and the arm64/x64 Mac incident documented in `electron-builder.yml`. It deserves a
packaged-artifact smoke test in CI that launches the installed build, not only the directory package.

## 6. Environment repairs

**ACL residue.** Files left by earlier sandboxed runs were owned by `BUILTIN\Administrators` and
`AnhHao\CodexSandboxOffline`, and the normal account had no delete right. This produced five separate
failures in this session, each of which first looked like a product defect: the MKTTool production
build, `electron-vite build`, `strip-workspace-symlinks`, `yarn install`, and directory cleanup. Two
orphan `node` processes were suspected and cleared by Windows Restart Manager, which reported no
holder at all — the file was never locked. The owner ran `takeown` + `icacls` over both repositories
(38 824 + 902 files). Re-running every previously failing command afterwards: all exit 0, including a
MKTTool production build straight over the existing `.next`.

**Node 22.** MKTBrowser pins Node 22 for the `better-sqlite3` ABI; the machine default is 24 and has
no version manager. The only Node 22 lived in `%TEMP%` and would have been lost to cleanup. Copied to
`E:\tools\node-v22.23.1` and proved by re-running MKB-02 18/18 from there. Deliberately **not** added
to the system PATH — that would shadow Node 24 for every other project.

**`ELECTRON_RUN_AS_NODE`.** The VS Code extension host exports it, so any Electron app launched from
an agent shell runs as plain Node and exits instantly: no window, no MCP port, no crash log, empty
stderr (GUI-subsystem binary), nothing written to the data root. It looks exactly like a broken
build. `verify-packaged-runtime-contract.cjs` already deletes it, which is why packaged verification
passes while a manual launch appears dead. Clear it before launching.

Both facts are stored in agent memory for future sessions.

## 7. State at end of session

- Both working trees clean; 8 commits unpushed (MKTBrowser ahead 3, MKTTool ahead 5)
- MKB-02 evidence artifact unchanged at `238d5d6f…db4f42`
- Live chain green: Relay 7 → MKT Browser contract 3 → engine ready
- Installer artifact retained for MKB-03 work
- Postgres running, Prisma client generated, Railway web returns 200

## Unresolved questions

1. Push both branches — deferred to 13 August by the owner.
2. Where is the offline manifest root key generated and stored? It is now the only source of release
   authority and there is no established offline-key procedure. Design it in MKB-03B or decide the
   custody process first.
3. Does MKB-03 start with a detailed plan under `plans/`, or straight into merging Relay and Browser
   into one installer?
4. Should the installed-build launch become a CI check? Today CI verifies only the directory package,
   which is exactly the artifact that does not reproduce the failure found here.
5. `Publisher` is empty in the uninstall entry and no autostart entry is created — confirm both are
   MKB-03 scope rather than accepted v1 behaviour.
6. Nine MKTTool source files still carried non-user owners before the sweep; confirm nothing outside
   the two repositories still holds sandbox-owned files that a future build will need to delete.
