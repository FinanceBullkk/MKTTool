# Project changelog - 7 to 11 August 2026

Historical entries moved from [project-changelog.md](../project-changelog.md) when the live
changelog exceeded the 800-line documentation limit. The entry prose is unchanged; only relative
link destinations were adjusted for this archive location.

Earlier history: [through 6 August 2026](project-changelog-05-to-06-august-2026.md).
Later history remains in the [live changelog](../project-changelog.md).

---

## 11/08/2026 (9) — MKB-02 starts with idempotent managed creation

Verified the first MKB-02 slice in the current uncommitted MKT Browser working tree. Managed profile
creation is deterministic and idempotent: retrying the same request returns the existing profile
instead of creating a duplicate, while a conflicting request is rejected. The runtime now advertises
`idempotent-create-v1`; it does not advertise `managed-profile-v1` or `atomic-launch-v1`. MKB-02
therefore remains in progress rather than complete.

The Windows package was regenerated at
`E:\MKTBrowser\apps\desktop\release\win-unpacked\MKTBrowser.exe` with SHA-256
`7634f689920fb0c5a5a1e8e45aaa98b6eb7d96e9abcf97a9ee926c543dc0a662`. Verification passed: Node
guards 2/2, W02 8/8, MKB-01 9/9, MKB-01E 6/6, MKB-02 4/4, Windows packaging guards 3/3,
typecheck, lint, the full Windows build, the packaged verifier, and `git diff --check`.

The packaged verifier confirmed `update_profile` persistence, `INVALID_INPUT` rejection for an
invalid proxy, real Chrome launch/close, profile deletion, clean profile/application cleanup without
new MKT Browser or Chrome PIDs, and restoration of workspace links. Packaging retries `rcedit` only
for the transient `Unable to commit changes` failure; all other failures stop immediately.

The executable remains unsigned and the MKT Browser changes remain uncommitted. This checkpoint is
not pushed, released, distributed, or pilot-ready. The remaining MKB-02 slices, MKB-03 onboarding and
signing, and the MKB-04 pilot/canary gates still block real accounts and team rollout.

---

## 11/08/2026 (8) — Legacy import and packaged lifecycle review findings close

Closed the four follow-up review findings in the MKT Browser working tree. Legacy discovery now
returns an explicit unreadable state for a corrupt MultiZen database, allowing the desktop to offer
`Start fresh` or `Quit` instead of failing on every startup. Import also rejects a database row whose
profile directory is missing and removes the staging root instead of publishing a broken copied
store.

Fingerprint measurement no longer swallows close/delete failures: cleanup errors now make the
command fail with their causes. The packaged verifier now exercises list, create, update persistence,
invalid proxy input rejection, a real system Chrome launch, process-confirmed close, delete, final
profile count, application exit, and disposable-root cleanup. Its verification-only engine fixture
and restricted-host launch flags are scoped to an explicit disposable packaged-contract run; normal
profile launches do not enter that path.

That verification passed: Node guards 2/2, MKB-01E 6/6, MKB-01 9/9, W02 8/8, typecheck, lint,
script syntax, `git diff --check`, and the packaged runtime/profile lifecycle. Cleanup left no MKT
Browser process or packaged-contract temp root. That verification executable had SHA-256:
`5be3462135633f92f273208cf6ed30720cea2aa10871c7aea89f6edefb6eaede`.

The executable remains unsigned. MKB-02, MKB-03, and the MKB-04 pilot still gate real accounts and
team distribution.

---

## 11/08/2026 (7) — MKB-01E upgrades Electron and hardens the renderer

Completed MKB-01E in the MKT Browser repository. The Windows package moved from end-of-life
Electron 33 to pinned Electron `42.8.1` with modules ABI `146`, `better-sqlite3` `12.11.1`,
electron-vite 5, and electron-builder 26. Packaging now bundles first-party workspace code while
leaving true runtime/native dependencies external, rebuilds the native module for Electron, restores
the development Node-ABI binaries in `finally`, and loads a sandbox-compatible CommonJS preload.

The renderer now uses sandboxing, context isolation, disabled Node integration, web security, a
restrictive CSP, denied popup creation, and denied top-level renderer navigation. Preload/main IPC
invokes and pushed events must exist in a classified inventory and reject non-primary-renderer
senders. MCP tools also require an explicit exposure class; unknown or unclassified tools fail
closed. Windows CI now runs the MKB-01E guard with the existing W01/W02 and MKB-01 gates.

Verification passed: MKB-01E 4/4, MKB-01 7/7, W02 8/8, typecheck, lint, Windows directory build,
packaged runtime contract, and script syntax checks. The packaged runtime reports Electron
`42.8.1`, ABI `146`, and live engine state `cloakbrowser / 146.0.7680.177.5 / ready`. The fixed-seed
configured and observed fingerprints were identical before and after the upgrade. All five primary
screen baselines were reviewed against Electron 33 without layout, copy, resource, or preload
regressions. That verification executable had SHA-256:
`f60ef62fd4e446e3baff52b54c897c7e13faf87af787ac56bec1b4542027a447`.

The executable remains unsigned. MKB-02, MKB-03, and the MKB-04 pilot still gate real accounts and
team distribution.

---

## 11/08/2026 (6) — MKB-01 closes with copy-only import, visual baselines, and Windows CI

Completed the remaining MKB-01 compatibility work in the MKT Browser repository. A fresh normal
Windows launch now checks for legacy MultiZen profiles only when MKT Browser has no profile database,
then offers `Copy profiles`, `Start fresh`, or `Quit`. Copying uses a read-only SQLite backup, copies
the profile directories and shared extension store, rewrites only the copied `data_dir` paths, and
never writes or deletes the MultiZen source. The legacy MCP token and settings stay behind. Explicit
`--user-data-dir` verification launches skip legacy discovery entirely.

Captured five packaged-renderer baselines for onboarding, profile creation, profiles, MCP, and
settings. The first capture caught stale macOS/Linux platform copy in the onboarding screen; the copy
now says Windows x64 while retaining the upstream layout, components, and interactions. Baselines
live under `E:\MKTBrowser\assets\images\mkb-01-visual-baselines\` and can be regenerated with the
checked-in loopback DevTools capture script.

The OS-parameterised Windows workflow now runs on every push and pull request. It executes W01/W02
guards, MKB-01 tests, typecheck, a directory package build, and `get_runtime_info` against the actual
packaged executable. Building that gate exposed and fixed two packaging-only defects: an empty
`LegalCopyright` argument that made `rcedit` fail, and a native-module rebuild that left source tests
on the Electron ABI. Packaging now restores every Node development binary in a `finally` block while
the packaged copy retains the Electron ABI.

Evidence: MKB-01 tests 7/7, W01/W02 guards 8/8, typecheck, Windows directory build, packaged runtime
contract, script syntax checks, and five reviewed PNG baselines passed. That verification executable
had SHA-256:
`d84b761b50c0cc1e52fd8b4f89d077066d9ab39e153113f8e6be99e234f9eedf`. The executable remains
unsigned; MKB-01E/MKB-02/MKB-03 and the MKB-04 pilot still gate real accounts and team distribution.

---

## 11/08/2026 (5) — MKT Browser reports itself, and failures carry codes

Closed the runtime-contract part of MKB-01 across both repositories. MKT Browser now answers
`get_runtime_info` with its provider, app version, contract version, profile schema version, live
engine state, and implemented capabilities. Capabilities list only what exists — managed mode stays
unadvertised until MKB-02 builds it — and the engine reports a version only when one is actually
installed, so "still downloading" no longer looks like "installed and healthy".

Every tool rejection now carries a stable machine-readable code (`ENGINE_UNAVAILABLE`,
`PROXY_REJECTED`, `PROFILE_NOT_FOUND`, `PROFILE_NOT_RUNNING`, `FORBIDDEN`, `INVALID_INPUT`,
`UNKNOWN_TOOL`, `INTERNAL_ERROR`). The desktop derives the code from one taxonomy instead of a
ternary chain, and raises `PROXY_REJECTED` when the local proxy bridge cannot start — the fail-closed
rule now has its own code rather than hiding inside a generic internal error.

MKTTool consumes the report instead of assuming. A build that predates the tool answers `null` and
is treated as **incompatible**, not as fine; a partial report counts as no report; a newer contract
version is refused rather than assumed safe. Relay health carries provider, app version, contract
version, engine state, and capabilities for the current PC, with no token, path, or proxy endpoint in
the payload. Relay also translates a known failure code into fixed operator guidance and only falls
back to the readable message for an older build, so an internal engine or bridge sentence no longer
reaches whoever clicked Launch.

Evidence: fork typecheck 6/6 projects, fork guards 8/8, new fork contract tests 5/5, MKTTool
typecheck, MKTTool suite 1136/1136, ESLint clean on the changed files. No database migration, no
ticket-shape change, no server change.

**A false green was found and closed while doing this.** The fork's `yarn typecheck` used
`yarn workspaces foreach`, but `nmHoistingLimits: workspaces` hides the root-only `typescript`
dependency from every workspace, so `tsc` was not found anywhere while the outer command still
exited 0. It had been reporting success without checking a single file, and the 11/08 (1) entry
recorded a passing fork typecheck on that basis. The script now calls `tsc` per project and was
verified against a deliberately broken file: it exits non-zero and names the error. Treat any
green from a wrapper command as evidence only after seeing it fail on purpose once.

MKB-01 still has three items: the copy-only MultiZen importer, visual baselines for the primary
screens, and running the W01/W02 guards in Windows CI instead of by hand.

---

## 11/08/2026 (4) — Windows onboarding becomes a hard product gate

Reviewed the active MKT Browser plan against the current Windows Relay download, device enrollment,
first-device bootstrap, browser-to-loopback permission, desktop packaging, and update paths. The
review found that “one installer” alone was too weak: it could still leave ordinary operators
extracting archives, opening multiple setup pages, reading Relay/key/token vocabulary, or treating an
offline administrator as a broken installation.

The plan now defines one normal journey:

`Download for Windows → Install → Sign in → Confirm this PC → Waiting for administrator approval or Ready`

- The normal operator receives one authenticated Authenticode-signed, secretless installer and one
  resumable current-PC setup controller. Separate Relay/MKT Browser downloads, `.bat`/PowerShell,
  localhost navigation, manual checksums, keys, tokens, IDs, ports, paths, and engine archives are
  explicit release failures rather than documentation problems.
- `Waiting for administrator approval` is a durable non-error state. The first device uses a separate
  ADMIN-only local bootstrap authorization; all later devices use ADMIN-approved recipient-sealed
  grants. Web, server, installer, and MKT Browser never receive the plaintext operator key.
- `Ready` now requires authenticated owner/device reconciliation, recipient proof after secure
  persistence, and current local Relay/Browser/engine health. Durable sealed grants require a
  short-lived one-use delivery authorization; exact retry returns a cached completion proof after a
  lost response instead of rewriting the key. Revocation blocks new authorizations and documents the
  short residual lifetime of one already issued rather than claiming impossible remote erasure.
- Legacy-secret migration now activates a secure-store-capable bridge Relay before deleting
  plaintext and commits that bridge as the rollback floor. No plaintext-only Relay may run afterward.
  Wrong-user/revoked/shared-PC cases and crash points around store/proof/migration commits are part of
  MKB-03 acceptance.
- Release acceptance now treats Relay, MKT Browser, contract, and the pinned external engine as one
  signed compatibility set rooted in an offline pinned manifest key and publisher, independent of R2.
  Durable highest-sequence state and one-use local rollback authorization distinguish approved
  rollback from an old valid-manifest replay. Partial update, reboot, key rotation, state deletion,
  existing standalone installs, port collision, repair, uninstall, Chrome/Edge Local Network Access,
  and rollback each have explicit tests.

MKB-03 is split internally into guided secure onboarding and signed compatibility-set lifecycle, and
its estimate changes from 6–9 to 10–15 working days. The remaining technical range changes from
three-to-five to **four-to-seven weeks**. This does not block the current owner-led disposable-profile
demo, but team self-installation and real-account use remain gated. This entry records a plan and
product-decision update; it does not claim that the installer or new setup UI is already implemented.

---

## 11/08/2026 (3) — 9Router pattern audit sharpens the MKT Browser plan

Reviewed the full active MKT Browser plan, the living roadmap/PDR/architecture, the existing
Web/Relay plans, and the current ticket and data boundaries before accepting any 9Router-inspired
work. The review adds no phase, runtime dependency, or v1 database migration.

Two bounded additions now sit in the existing MKB-01E/MKB-02 scope:

- Carry a non-secret ticket `jti` as `operationId` across Web → Relay → MKT Browser, retain
  `requestId` separately for create idempotency, and return only allowlisted stage, error-code,
  duration, and runtime-version diagnostics. This is local correlation, not a Relay-to-server
  callback or a trusted browser-reported audit receipt.
- Keep a checked-in, default-deny inventory of exposed MCP tools, preload/IPC handlers, Relay HTTP
  endpoints, and capability classes. CI must fail when a new or renamed operation is exposed without
  classification; the profile-management token remains unable to call page-control tools.

The audit confirmed that capability discovery, four-layer status, signed release manifests, staged
updates, and rollback were already planned. It explicitly rejects hosted edge forwarding, public
tunnels, dynamic proxy pools, identity/proxy fallback, full request logging, and cloud profile sync.
Persistent outcome receipts, offline device inventory, and a circuit-breaker dashboard remain
deferred until MKB-04 pilot evidence shows a concrete need. The active plan's stale MKB-00 wording
was also aligned with the verified 11 August correct-proxy result.

---

## 11/08/2026 (2) — MKB-00 correct-proxy positive path verified on Windows

Closed the final MKB-00 runtime gate with the current packaged Windows x64 build and a dedicated
working proxy. A new secret-safe smoke script accepts either an unassigned vault record or the fixed
local handoff file `%LOCALAPPDATA%\MKTTool\mkb00-proxy.env`. For file handoff, it parses the proxy in
memory and deletes the file before any network or browser operation. It does not log proxy fields,
database URLs, tokens, or observed IP values.

The independent proxy probe produced an exit IP distinct from the direct connection. A disposable
MKT Browser instance then created a blank profile, applied the same proxy, launched it, and observed
the same exit IP from inside the browser. The profile closed and deleted successfully; final checks
found no handoff file, disposable profile, MKT Browser process, or temporary MKB-00 data root. No
account, cookie, account password, TOTP value, or operational profile was used. Typecheck and
focused ESLint also passed.

This verifies MKB-00 only. The executable remains unsigned, and MKB-01/MKB-01E/MKB-02/MKB-03 and
the MKB-04 multi-device pilot still gate distribution or real-account use.

---

## 11/08/2026 (1) — Windows technical demo becomes the immediate delivery target

The owner stopped active MacBook setup because its development and release path was too complex for
the current team-demo deadline. This reaffirms the 10 August platform decision rather than creating
a second platform change: **Windows x64 remains the only v1 build, demo, pilot, and rollout target**,
and macOS stays deferred to MKB-07 after v1.

The immediate demo boundary is deliberately narrower than pilot readiness. It may exercise the
existing Windows Web → Relay → MKT Browser flow with disposable profiles, but it does not authorize
real accounts, team distribution, or claims that MKB-00/MKB-04 have passed. The only open MKB-00
runtime gate remains a disposable launch through a real working proxy with a verified exit IP.

Aligned stale Mac-first wording in the living README, architecture, glossary, documentation index,
and the MKT Browser engineering inventory. The macOS setup guide remains only as a deferred MKB-07
reference so future work does not need to rediscover it.

Regenerated the current Windows directory package after the scope alignment. `MKTBrowser.exe`
retained the verified W02 SHA-256
`27c27443385f4ecdbc0187772934adb5d1718169d7c387d41b3718ef72ba2b18`; product metadata remains
`MKT Browser`, x64 packaging completed, desktop guards passed 8/8, focused MKTTool consumer tests
passed 50/50, both repository typechecks passed, and the packaged Relay verification passed. The
executable remains unsigned and therefore stays an owner-led technical-demo artifact only.

> **Correction, 11/08/2026 (5):** the fork half of "both repository typechecks passed" was a false
> green. `yarn typecheck` there checked nothing and still exited 0. The claim was withdrawn and the
> script repaired the same day; the fork was then typechecked for real and passed. See the entry
> below.

---

## 10/08/2026 (9) — Platform decision: Windows only in v1, macOS moves to MKB-07

The fork was planned macOS-first. After two Windows slices and zero Apple Silicon evidence, the owner
inverted the ordering: **v1 commits to Windows x64 only**, and macOS Apple Silicon becomes MKB-07
after v1.

This is a priority choice, not a hardware constraint. Mac machines are available. The reasons on
record are that the Windows slice is already verified end to end through W01, W02, and the repackaged
Relay, that the macOS half still needs Apple Developer enrollment, notarization, a LaunchAgent helper,
and Keychain storage — none started or owned — and that no operator workflow depends on macOS today.

What changes:

- MKB-00 loses its Apple Silicon half and now has exactly one open item: launch a profile through a
  **real working proxy** and verify the exit IP. W01 and W02 only proved the fail-closed guard against
  a deliberately invalid proxy, which is the opposite case.
- The technical estimate drops from **five to eight weeks** to **three to five**, because no native
  helper, Keychain, LaunchAgent, Developer ID, or notarization work remains in scope.
- The Electron 33 upgrade becomes its own slice, **MKB-01E**, instead of a bullet inside MKB-01. It is
  the item most able to fail for reasons unrelated to the product; W02 already met the small version
  when a `better-sqlite3` rebuild failed under Node 24.
- Pilot devices, the acceptance matrix, and the definition of done move to two Windows devices.
- Apple Developer access is explicitly **not** to be bought during v1.

The control against paying twice: the Relay keeps a shared core with thin OS adapters for paths,
autostart, and secure storage, so MKB-07 adds a platform rather than reopening one. A new definition
of done item states that directly, and the risk table now names "deferring macOS bakes Windows
assumptions into the core" as the thing to watch.

Also recorded while rewriting: an explicit recovery play for a lost or dead operator device, which
the plan previously left to improvisation.

---

## 10/08/2026 (8) — Relay installer lost its BOM in the W02 rename

The W02 slice saved `relay/install-relay.ps1` without its UTF-8 byte order mark while the file still
held 986 non-ASCII characters. Windows PowerShell 5.1 reads a BOM-less `.ps1` in the machine ANSI
code page, so the installer keeps installing correctly and only the text turns unreadable — on the
single screen the person doing the install actually reads. The file bytes were already valid UTF-8,
so restoring the mark changed nothing else.

The packaging script had guarded this since the installer was written, but that guard runs only when
someone packages a release, so the regression passed the full 1,120-test suite untouched. The same
check now sits in the installer encoding tests beside the BOM bug on the config file that script
writes.

The W02 verification never ran the Relay packaging pipeline, so the packaged `.exe` and `.zip` on
disk still dated from 07/08 and predated the clean break entirely. Rebuilt from current source: the
bundle now carries `MKT_BROWSER_DEFAULT_MCP_PORT = 47822` with no MultiZen marker, and
`npm run relay:verify` passed all 24 checks against the new executable, including ticket signing,
decryption, replay rejection, and expiry. The download archive is 32.6 MB with SHA-256
`a2433fba8271b7fc204dec636e92d6d5093b382f6ef7f2f7560a5f467844c094`; it is not published.

---

## 10/08/2026 (7) — MKB-W02 internal clean break verified

Completed the coordinated clean break across the separate MKT Browser and MKTTool repositories:

- Active first-party identities now use `@mktbrowser/*`, `window.mktBrowser`, `mkt-browser`,
  `MktBrowser*`, and MKT Browser-owned configuration keys. MKTTool and Relay have no MultiZen
  adapter/provider/config fallback.
- MKT Browser now uses configurable default loopback port `47822`; MKTTool uses
  `MKT_BROWSER_MCP_URL` and Relay uses `mktBrowserUrl` for explicit loopback overrides.
- Removed inert updater/usage fields and obsolete compatibility branches while preserving upstream
  attribution, Git history, profile/archive formats, and the separate engine-license boundary.
  Provider-echoed proxy host and credential values are redacted from consumer errors.
- Passed MKT Browser contract tests 8/8, focused MKTTool/Relay tests 98/98, full MKTTool tests
  1,120/1,120, both typechecks, ESLint, and both Windows/production builds.
- With port `7777` occupied by a disposable listener, the packaged app completed the full lifecycle
  through the updated MKTTool consumer and ended with zero disposable profiles. The 3,497-entry
  legacy tree and real MKT Browser root were unchanged, and all test processes, ports, and roots
  were removed.

The x64 executable remains 188,614,144 bytes and now has SHA-256
`27c27443385f4ecdbc0187772934adb5d1718169d7c387d41b3718ef72ba2b18`. W02 is technical-only;
Apple Silicon, signing, installer/update/rollback, the missing packaged root MIT license, and blank
PE copyright remain open gates. Full evidence:
[MKB-W02 Windows internal clean break](../../../MKTBrowser/docs/mkb-w02-windows-internal-clean-break.md).

---

## 10/08/2026 (6) — W01 checkpoint approved; W02 clean break deferred

The project owner accepted the verified MKB-W01 Windows result as a stable local checkpoint. W01
will not be widened with internal protocol renames after verification.

MKTTool has no operational deployment or production compatibility obligation yet, so the next
Windows slice may make a deliberate clean break before pilot use. MKB-W02 is deferred for a later
session and may rename internal MultiZen package, preload, MCP, and adapter surfaces; assign a
dedicated port; and remove inert legacy settings and fallbacks. Upstream license attribution remains
mandatory, and the full MKTTool-to-browser lifecycle must pass again. This entry records a scope
decision only; no W02 implementation has started.

---

## 10/08/2026 (5) — MKB-W01 Windows product isolation verified

The project owner authorized a bounded Windows-first implementation slice while the Apple Silicon
half of MKB-00 remains open:

- Rebranded the technical Windows product identity to `MKT Browser`, application ID
  `com.mkttool.browser`, executable `MKTBrowser.exe`, and fixed data root
  `%LOCALAPPDATA%\MKTTool\MKTBrowser\`.
- Preserved the disposable `--user-data-dir` test override and added no code that scans, reads,
  copies, moves, or deletes the legacy `%APPDATA%\MultiZen` store.
- Verified a packaged launch with a temporary `LOCALAPPDATA` and no `--user-data-dir`: starting
  without a canonical product directory, the app created `MKTTool\MKTBrowser` itself and placed the
  MCP token and profile database there, while all 3,059 legacy-tree files retained pre-test write
  times.
- Removed `electron-updater`, update timers/events/IPC/UI, MultiZen release URLs, publish scripts and
  provider, and tag-triggered release creation. The remaining workflow is a manual read-only Windows
  directory build.
- Removed the opt-in upstream heartbeat from startup, onboarding, Settings, and runtime so it cannot
  contact `ping.getmultizen.com`; also removed the unwired upstream telemetry-ingest service and its
  deployment snippets.
- Retained `@multizen/*`, `window.multizen`, MCP port/tool names, profile IDs, and archive format as
  deliberate compatibility surfaces; no MKTTool server, ticket, or database change was required.
- Passed product-identity tests 4/4, full typecheck/build, packaged-bundle inspection, and the current
  MKTTool adapter lifecycle with 22 tools, 19 device options, 72 locales, fail-closed invalid proxy,
  create/apply/launch/close/delete, and final disposable profile count 0.
- Produced an x64 `MKTBrowser.exe` of 188,614,144 bytes with SHA-256
  `16462e535593b0ee572bf32069bee514774f6a7be1cda2f8329ff1a1efc60022`; its PE product name and
  file description are `MKT Browser`, and its original filename is `MKTBrowser.exe`.

MKB-W01 does **not** close MKB-00 or MKB-01. The upstream-derived icon and `0.3.1` version remain,
and Apple Silicon verification, Electron upgrade/hardening, the copy-only importer, installer,
signing, internal update/rollback channel, and pilot approval are still open. The fork records W01
as a local checkpoint; no tag or push was made.

---

## 10/08/2026 (4) — MKB-00 Windows baseline verified; Apple Silicon gate remains open

MKB-00 has moved from planning into evidence-backed execution without rebranding or changing the
upstream product:

- Created the separate `E:\MKTBrowser` checkout from official MultiZen `v0.3.1`, pinned commit
  `83c6898b2de3de1122b5fea88008fbbaa4677bff` and the immutable `yarn.lock` hash, retained a
  fetch-only upstream remote, and made no commit or push.
- Built the unmodified Windows x64 source, verified the x64 packaged executable, exercised the
  authenticated 22-tool MCP server, and passed list/fingerprint/create/update/launch/close using
  disposable profiles only.
- Exercised the same lifecycle through MKTTool's current `MultizenAdapter`; running state changed
  correctly, all disposable profiles were deleted, and the focused Relay/adapter fail-closed suite
  passed 27/27.
- Separated the MIT MultiZen application license from CloakBrowser's proprietary Binary License.
  The engine may be used only as an unmodified internal dependency from official channels under the
  applicable version/subscription terms; it must not be bundled or redistributed.
- Recorded Electron 33 as end-of-life and preserved the upgrade, independent updater, signing, and
  notarization work for later release gates.

MKB-00 is **not complete**: no real Apple Silicon Mac was available, no native arm64 build or engine
was run, and no operational disposable proxy was used. The fork contains a source/license/engine
inventory plus an exact Apple Silicon verification runbook. MKB-01 and rebranding remain gated.

---

## 10/08/2026 (3) — English becomes the project artifact language

All new or materially revised source comments, UI/error copy, documentation, plans, tests,
scripts, installers, release text, and commit messages must now be written in English. Direct
conversation with the project owner may remain in Vietnamese.

Existing Vietnamese files are legacy rather than a template for new work. Actively maintained
documents should be translated when materially revised, while historical records must not be
rewritten solely to make their language appear current. The active MKT Browser specification must
be translated before MKB-00 begins.

---

## 10/08/2026 (2) — Chuyển MKT Browser sang Mac-first, giữ UX/UI MultiZen

Thông tin vận hành mới: đa số người dùng desktop của team dùng Mac. Điều chỉnh kế hoạch trước khi
code để macOS không trở thành một bản port phụ làm sau:

- macOS Apple Silicon là nền tảng chính; Windows x64 vẫn là nhánh hỗ trợ/kiểm hồi quy. Intel Mac chỉ
  thêm nếu kiểm kê có máy thật cần dùng.
- V1 giữ layout, component và interaction pattern của MultiZen. Chỉ rebrand tối thiểu, thêm managed
  badge/trạng thái khóa/câu lỗi; redesign tách thành MKB-06 sau dữ liệu sử dụng thật.
- Cầu nối hiện tại là SEA `.exe` + PowerShell + Startup Windows, nên Mac cần nhánh phát hành thật:
  helper riêng, LaunchAgent, Keychain, DMG Developer ID + notarization và test native arm64.
- Nhân viên Mac không phải cài Homebrew, chạy `xattr` hoặc mở Terminal. Một lượt tải phải cài được
  cả MKT Browser và Cầu nối nhưng vẫn giữ chúng là hai tiến trình/hai ranh giới tin cậy.
- Roadmap kỹ thuật đổi từ 4-6 thành 5-8 tuần; pilot dùng hai Mac và một Windows kiểm hồi quy trước
  khi một nick thật cold-start 14 ngày trên Mac.

Thiết kế đã cập nhật tại [plan MKT Browser](../../plans/260810-0244-mkt-browser-noi-bo/plan.md).

---

## 10/08/2026 (1) — Chốt fork MKT Browser, giữ Web và Cầu nối

Chốt thêm một luồng sản phẩm: fork lớp ứng dụng MultiZen thành **MKT Browser** dành riêng cho
MKTTool. Đây chưa phải một tính năng đã triển khai; thay đổi trong ngày là quyết định phạm vi và
bản thiết kế thi công.

- MKT Browser là repo desktop riêng, giữ MCP tương thích trước rồi mới thêm managed mode.
- Web vẫn kiểm quyền/phát vé; Cầu nối vẫn giữ khóa operator, xác minh và chống dùng lại vé; app
  Electron không nhận các trách nhiệm đó.
- V1 không tự fork Chromium, không cloud sync profile/cookie và không bundle binary engine theo
  quán tính. App, protocol, schema dữ liệu và engine có version/release gate riêng.
- Roadmap mới MKB-00 → MKB-05 bao phủ build baseline, managed mode, bộ cài/update/rollback và
  pilot trước nick thật. MultiZen được giữ một release làm đường lui.
- Sửa hai mô tả kiến trúc đã lệch code: production gọi provider qua Cầu nối đang gắn cứng
  `MultizenAdapter`, và máy chủ chỉ phát vé mở profile chứ không gọi adapter trực tiếp.

Thiết kế đầy đủ: [plan MKT Browser](../../plans/260810-0244-mkt-browser-noi-bo/plan.md).

---

## 08/08/2026 — Nút "Kiểm" treo vĩnh viễn khi proxy SOCKS5 nhận kết nối rồi im

Tìm ra trong lúc viết test cho `proxy-socks5-tunnel.ts` — module bắt tay SOCKS5 tự viết theo
RFC 1928, và trước hôm nay **không có một bài test nào chạm tới nó**.

- **Hạn giờ chỉ canh lúc đang nối, không canh lúc đang bắt tay.** `connectSocket` gỡ listener
  `timeout` ngay khi socket lên. `socket.setTimeout()` vẫn còn nguyên, nhưng Node **không tự đóng
  socket** khi không ai nghe sự kiện đó — nên một proxy nhận TCP rồi không nói gì làm
  `openSocks5Tunnel` không bao giờ settle. Không có hạn giờ nào ở ngoài bọc nó: hạn giờ của
  `readUntilClose` chỉ bắt đầu tính **sau khi** đường hầm đã mở.
- **Biểu hiện:** nút "Kiểm" quay mãi, không ra kết luận nào. Tệ hơn một câu báo hỏng, vì nó không
  dẫn tới việc gì cả. Ca thật: proxy quá tải, hoặc middlebox bắt cổng rồi nuốt gói.
- **Sửa:** giữ listener `timeout` suốt cuộc bắt tay, hết giờ thì `destroy()` kèm `Socks5Error`
  lý do `unreachable` — proxy không nói nổi một câu trong ngần ấy giây thì không chạy nick được.

15 bài test mới dựng proxy SOCKS5 giả trên `127.0.0.1`, không đụng mạng thật. Phần đáng canh nhất
là **hai lý do lỗi**, vì chúng dẫn tới hai kết luận trái ngược: `unreachable` → CHẾT → chặn mở
profile, còn `protocol` → KHÔNG KIỂM ĐƯỢC → vẫn cho mở. Gõ nhầm cổng (SOCKS5 vs HTTP) phải rơi vào
vế thứ hai, nếu không thì một proxy đang tốt bị đổ oan là đã chết.

Có một bài ghim thẳng ràng buộc bảo mật: gói CONNECT phải mang **tên miền** (`ATYP_DOMAIN`), không
mang IP — đó là chỗ "DNS phân giải từ xa" thật sự xảy ra.

---

## 07/08/2026 (6) — Bảng `Persona` gộp thành hai cột trên nick

Bảng nhân vật có `/personas` CRUD, một mục nav, một bước onboarding và một **khóa ngoại bắt buộc**.
Đổi lại: hai dòng chữ hiển thị ở trang chi tiết nick. Không một đường code nào ngoài phần hiển thị
đọc tới nó — **kể cả bộ luật**. Luật 7 so trùng văn bản thật, xét mọi nick cùng họ nền tảng, và
chưa bao giờ đọc giọng của nhân vật (`rule-content-similarity.ts`).

- **Giọng viết vẫn đáng giữ, chỗ đứng của nó thì không.** Nó là cú hích *trước khi viết*: người ôm
  mười nick mà không có gì nhắc làn sẽ viết cả mười bài bằng giọng tự nhiên của mình, rồi bị luật 7
  chặn ở phút cuối — mất trắng công viết. Luật 7 là tấm lưới *sau khi viết*. Hai thứ bù nhau. Nên
  giọng chuyển thành `Account.voice` + `Account.contentAngle`, nhập ngay trong form nick.
- **Bắt buộc là thứ bị bỏ.** Khóa ngoại `NOT NULL` nghĩa là kho chưa có nhân vật nào thì **không
  thêm nổi một nick** — một cánh cửa khóa ngay đầu luồng nhập. Hai cột mới nullable; thiếu thì
  `describeAccountReadiness()` báo `NO_VOICE` (thay `NO_PERSONA`, vốn không bao giờ bắn được vì cột
  cũ `NOT NULL`). Đúng khuôn đã làm với `antidetectProfileId` hôm trước: chuyển từ *chặn lúc nhập*
  sang *chấm điểm sẵn sàng*.
- **Hai câu gợi ý đang nói dối được sửa.** `account-readiness.ts` và `setup-checklist.ts` đều viết
  *"bộ luật trùng nội dung đọc giọng của nhân vật"* — sai, và trái với chú thích trong
  `schema.prisma` lẫn `domain-glossary.md`. Người đọc câu đó sẽ tin có một lớp gác tự động canh
  trùng giọng; thực tế máy chỉ canh trùng **chữ**. Câu mới nói đúng việc nó làm.
- **Migration `20260807200000` chép giọng về từng nick rồi bỏ bảng.** `Persona.notes` không có cột
  tương ứng nên **mất** — file migration ghi sẵn câu `SELECT` để đọc ra trước khi chạy. Sao lưu
  bằng `npm run db:backup` trước.

Dọn theo: `/personas` (2 trang + `persona-form-fields.tsx`), mục nav, ô đếm ở trang Hôm nay, bước
onboarding "Tạo nhân vật", 3 action CRUD, và fixture persona ở 14 file test + 4 smoke script — số
file test phải đẻ một persona chỉ để thỏa khóa ngoại chính là cái giá mà bảng đó vẫn đang thu.

---

## 07/08/2026 (5) — Hai nút profile bỏ cuộc ở giây thứ tư, và báo nhầm lý do

Nghiệm thu trên máy thật: cả **tạo profile** lẫn **mở profile** đều chạy đúng bên MultiZen —
profile `REDDIT — Ok_Swimmer_5542` sinh ra với proxy `us` và timezone `America/Los_Angeles` khớp
nhau (trong khi hai profile dựng tay cùng máy đều lệch), rồi mở lên hiện `running` bình thường.
Nhưng cả hai lần, màn hình đều báo *"trình duyệt không cho trang này gọi xuống máy của bạn"*.

- **Hạn giờ 4 giây sai ở đúng hai chỗ.** `RELAY_TIMEOUT_MS` đo cho ping, bọc bí mật, liệt kê
  profile — đo 07/08: `GET /profiles` mất **78 ms**. Nhưng tạo profile dựng cả một hồ sơ Chromium
  trên đĩa, còn mở profile thì đẩy proxy **rồi** bật một cửa sổ Chromium thật. Cả hai vượt 4 giây
  một cách bình thường. Thêm `RELAY_PROFILE_WORK_TIMEOUT_MS = 60_000` cho riêng hai đường đó, giữ
  nguyên 4 giây ở mọi đường khác — nới đại trà là bắt người dùng ngồi nhìn nút xám một phút mỗi
  lần cầu nối thật sự chết.
- **Suy luận "hết hạn giờ ⟹ chưa cấp quyền mạng nội bộ" chỉ đúng khi lời gọi vốn nhanh.** Nó là
  nền của ràng buộc 3 và vẫn đúng ở mọi đường khác; ở hai đường này nó đoán sai và cử người đi bật
  lại một quyền vốn không hỏng. `describeSlowRelayFailure()` nêu cả hai khả năng rồi nhắc chỗ nhìn
  để tự phân xử — cửa sổ vừa mở ra, hay profile vừa hiện trong MultiZen. Đường mở profile còn
  **không giục bấm lại**: bấm lại là mở hai cửa sổ cùng một nick.
- **Đường dò lại — lớp chống thật của đường tạo.** Không có id trong tay thì tìm profile mang đúng
  tên `profileNameForNick()` trong `/profiles` rồi ghi vào kho. Nới hạn giờ chỉ làm ca hỏng hiếm
  đi; cắt ngang giữa *"MultiZen đã dựng xong"* và *"trình duyệt nhận được id"* thì lúc nào cũng có
  thể xảy ra — hết hạn giờ, đóng tab, mạng chớp. Trùng tên thì **từ chối đoán** và bảo người dùng
  dọn: chọn bừa là ghi một id có thể sai, còn cái kia thành rác không ai biết để dọn.

---

## 07/08/2026 (4) — Luồng nhập nick dựng lại theo đúng thứ tự có thật

Bản (3) thêm nút *"Tạo profile trên máy này"* nhưng không gỡ luật cũ đi kèm, nên nút đó **không bao
giờ hiện ra**: form đòi `antidetectProfileId` mới cho tạo nick, trong khi id ấy chỉ có được ở trang
chi tiết của một nick **đã tồn tại**. Vòng luẩn quẩn lộ ra ngay lượt thêm nick đầu tiên.

Lần này sửa cả ba chỗ mô hình đang nói sai về thực tế, không chỉ vá cái vòng đó.

- **Nick đi qua ba chặng, và bản ghi nick CHÍNH LÀ trạng thái của luồng.** Khai nick → dựng profile
  → đăng nhập lần đầu. Không dựng wizard có state tạm: onboarding một nick kéo dài qua nhiều lượt
  ngồi (chờ MultiZen, chờ mã Google), và state tạm là thứ mất khi đóng tab. Trang chi tiết hiện
  đúng **một** thẻ *"Việc tiếp theo"* tại một thời điểm, ngay dưới dải Sẵn sàng và **trên** thẻ
  Thao tác — nick chưa xong cấu hình thì bốn cái nút kia đều báo lỗi.
- **`antidetectProfileId` rời khỏi luật form.** Chuyển từ *chặn lúc nhập* sang *chấm điểm sẵn sàng*
  (`describeAccountReadiness` + `launch/route.ts` vốn đã canh). Ô gõ tay còn ở form **sửa** — đường
  lùi cho máy chạy cầu nối bản cũ và cho người nhập liệu hộ từ máy khác.
- **Nick Reddit không có mật khẩu riêng.** Chúng đăng nhập bằng *Continue with Google*, nên cột
  `NOT NULL` cũ buộc người nhập **bịa một chuỗi** — rồi bí mật giả đó nằm lại trong kho, vào bản sao
  lưu, và phải canh giữ y như bí mật thật. `passwordEnc` thành nullable; migration dọn sạch giá trị
  cũ của mọi nick Reddit (**một chiều** — máy chủ không giải mã được). Form đổi nhãn theo nền tảng:
  *Email Google* / *Mật khẩu Google* / *Mã 2 lớp của Google*.
- **Ô mã 2 lớp nói nó là cái gì.** Kho không có lấy một nick nào lưu mã này, vì gợi ý cũ (*"chuỗi
  base32 khi bật 2FA"*) đúng mà vô dụng với người chưa nghe tới nó. Gợi ý mới trả lời *lấy ở đâu*.
- **Mốc `firstLoginAt` + blocker `NOT_LOGGED_IN`.** Nút tạo profile sinh ra trình duyệt **trắng
  tinh**, nên *"có profile"* không còn hàm ý *"dùng được"* như hồi người ta tự dựng profile rồi mới
  chép id sang. Không có mốc này thì cột Sẵn sàng khoe xanh cho nick chưa ai đăng nhập, và chuyện
  chỉ lộ ra vào hôm định đăng bài. Là **lời khai của người**, như `karma` — nút nằm ngay trong thẻ
  chứa nút Mở profile. Migration lấp `firstLoginAt = createdAt` cho nick đã có profile, đúng theo
  định nghĩa cũ; không lấp thì cả đàn nick báo đỏ cùng lúc.
- **Người tạo là chủ nick.** `requireNickOwner` chặn OPERATOR trên nick vô chủ, nên trước đây chính
  người vừa khai nick cũng không bấm được nút tạo profile — phải chờ ADMIN gán, hai lượt qua lại mỗi
  nick. Không mở rộng quyền thật: họ vừa tự tay gõ chính những bí mật đó vào form. ADMIN nhập hộ thì
  chọn người khác ngay trong form.
- **Phép kiểm thứ 5 ở `recordCreatedProfile`: máy phải thuộc CHỦ NICK.** Chỉ ADMIN chạm tới được
  (`requireNickOwner` cho ADMIN qua mọi nick) — không có nó, ADMIN nhập hộ sẽ ghim nick của đồng
  nghiệp vào máy mình, tức nick mà chủ nó không mở nổi, và bất biến `device.userId == ownerId` vỡ.
  Chặn cả ở lượt **phát vé**, không chỉ lượt ghi: từ chối sau khi cầu nối đã dựng profile là để lại
  một profile mồ côi bên MultiZen.
- **Nút "Mật khẩu nick" hiện theo cột, không theo nền tảng** — `passwordEnc !== null`. Nick cũ lỡ
  lưu mật khẩu thật vẫn lấy lại được, nick mới không bao giờ hiện một nút phát ra chuỗi rỗng.

**Không đụng định dạng vé.** `TICKET_FORMAT_VERSION` và `MIN_RELAY_VERSION_BY_KIND` giữ nguyên, nên
**không phải phát hành lại cầu nối** — bản 6 vừa cài là đủ.

1080/1080 xanh, lint sạch.

---

## 07/08/2026 (3) — Công cụ tự tạo profile antidetect, thay ô gõ tay UUID

Thêm một nick từng đòi ba bước tay, cả ba hỏng lặng lẽ: chép dãy UUID từ MultiZen sang (sai một
ký tự thì không gì báo tới lần mở profile đầu tiên), **nhớ bấm "Match proxy"**, rồi mới đăng nhập.
Bước giữa là bước hay bị bỏ — đo 02/08 có profile `sv-SE` chạy trên IP Anh, và tới 07/08 vẫn còn
`Reddit - Account 01` để `Africa/Johannesburg` trên proxy US.

- **Nút "Tạo profile trên máy này"** ở trang chi tiết nick. Một lần bấm: MultiZen dựng profile
  mang sẵn proxy của nick cùng vân tay khớp quốc gia proxy, kho ghi id, và **nick được ghim luôn
  vào máy vừa tạo**. Không ô nào phải gõ, không bước nào phải nhớ.
- **Ghim máy là phụ phẩm, không phải khai thêm.** Profile chỉ tồn tại trên một máy, nên tạo ở đâu
  thì nick thuộc về đó — không khai sai được.
- **"Match proxy" thành code.** Đo MCP của MultiZen 07/08: `create_profile` nhận `proxy` và
  `fingerprint` ngay lúc tạo, `list_fingerprint_options` trả 72 nhóm locale kèm `country` và các
  timezone hợp lệ. `Proxy.country` khớp thẳng vào đó. Quan trọng hơn: MultiZen **tự ép tính nhất
  quán** — khai `en-US` kèm `Europe/London` thì nó trả `INVALID_INPUT` liệt kê luôn bốn timezone
  đúng. Nên phía mình không dựng bảng đối chiếu song song (bảng đó sẽ mục vào ngày họ thêm locale).
- **Timezone chọn có gieo hạt, không lấy phần tử đầu.** US có 4 timezone; luôn lấy cái đầu là 5
  nick trên proxy US cùng mang `America/New_York` — một mối tương quan **do chính công cụ tạo ra**,
  ngược hẳn với việc đang chi tiền cho 10 proxy riêng. Gieo bằng username nên ổn định: xem trước
  nói gì thì tạo ra đúng thế.
- **`MIN_RELAY_VERSION` tách theo LOẠI vé.** Đây là rủi ro lớn nhất của bản này: cầu nối không tự
  cập nhật, nên nâng một sàn chung vì loại vé mới là làm **mọi** vé — mật khẩu, OTP, mở profile —
  bị mọi cầu nối cũ từ chối cùng lúc. Ba loại cũ giữ `1`, loại mới khai `6`, và có test canh cứng
  ba con số đó.
- **`GET /profiles` ở cầu nối** — không cần vé (tên và id profile không phải bí mật, và máy chủ
  vốn không nhìn thấy danh sách này để mà cấp phép). Chưa nối được MultiZen thì báo thiếu gì chứ
  **không** trả mảng rỗng: mảng rỗng nghĩa là "máy này chưa có profile nào", một câu khác hẳn.
- **Tự ghim chỉ mở cho nick chưa có máy.** Nới ra là một OPERATOR bấm "Tạo profile" để kéo nick
  của đồng nghiệp về máy mình rồi đọc mật khẩu proxy của nó — đổi máy vẫn chỉ ADMIN làm được.
- Cầu nối lên **bản 6**. `AdsPowerAdapter` ném lỗi nói rõ chưa hỗ trợ thay vì trả mảng rỗng.

Bốn file test mới (chọn vân tay, phiên bản vé theo loại, `/profiles`, `recordCreatedProfile`).
1062/1062 xanh.

**Chưa làm:** ô chọn profile mới chỉ **liệt kê** để chép id, chưa gắn được bằng một cú bấm — đường
tạo mới là đường chính, còn liệt kê chỉ để đối chiếu và để nối lại profile cũ.

---

## 07/08/2026 (2) — Trang Chuẩn bị, và "nick này dùng được chưa"

Khảo sát UX trước khi bàn giao GĐ6 ([báo cáo](../../plans/reports/uxreview-260807-0459-luong-cau-hinh-va-onboarding.md))
tìm ra ba chỗ gãy nặng, cả ba đều thuộc luồng **dựng kho và cấu hình**, không phải luồng vận hành
hằng ngày.

- **Trang `/setup` "Chuẩn bị"** — checklist 9 bước, mỗi bước **đọc trạng thái thật từ kho**
  (`3 nhân vật` / `chưa có proxy nào` / `1/2 nick đã gán chủ và máy`) kèm nút đi thẳng, và
  highlight bước phải làm tiếp. Trước đó hướng dẫn duy nhất trong cả app là một dòng chữ xám nằm
  trong thẻ *Sức khỏe đàn nick* — sai chỗ, không link, nêu 3 trên 8 bước, và **biến mất ngay khi
  có nick đầu tiên**, đúng lúc còn 5 bước chưa làm. Thứ tự đầy đủ chỉ có trong README.
- **`describeAccountReadiness()`** — một hàm thuần trả lời "nick này thiếu gì", ba chỗ đọc: cột
  **Sẵn sàng** ở `/accounts`, khối liệt kê ở đầu trang chi tiết nick, và dải cảnh báo trang Hôm
  nay. Trước đó bảy điều kiện nằm rải ở bốn bảng và người dùng phải tự ghép từ bảng Thông tin 15
  dòng — trang danh sách thì không nói gì cả.
- **Phân biệt "chờ" với "thiếu".** Cold-start là chặn loại *chờ*: không ai phải làm gì. Gộp chung
  với "chưa gắn proxy" thì một nick đang cold-start đúng lịch trông y hệt một nick quên gắn proxy.
- **Ranh giới Reddit / Facebook nằm trong phép chấm.** Nick Facebook không proxy, không profile,
  không máy vẫn là *Sẵn sàng* — Fanpage đăng bằng Graph API. Đòi đủ bảy điều kiện là bịa ra ba lỗi
  vĩnh viễn không sửa được, và người đọc sẽ học cách phớt lờ cả cột.
- **Thẻ Phân công cụm hiện dạng CHỈ ĐỌC với OPERATOR** thay vì biến mất. Đây là nợ do chính bản
  trước tạo ra: họ tạo xong nick, bấm "Mở profile", nhận câu *"chưa ghim vào máy nào"* — và trên
  màn hình của họ không có gì nói chỗ đó ở đâu hay ai làm được.
- **Nav tách `Cài đặt` khỏi `Kho`.** Hai nhóm khác nhau về *thời điểm* chứ không phải chủ đề: kho
  sửa hằng tuần, cài đặt đụng lúc dựng lần đầu. Cầu nối từng nằm cạnh Content, trong khi với người
  mới nó là việc số 0.
- **Form thêm nick bớt hai ô.** `Trạng thái` bỏ hẳn khỏi form tạo (nick mới luôn `COLD_START`, để
  `default` trong schema), và `Cold-start tới ngày` **điền sẵn +14 ngày** thay vì bắt tự cộng.
- Thẻ *"Đang chờ cấp khóa"* ở `/relay-devices` từng render **phía trên** `PageHeading` — thứ tự
  đọc bị lộn. Nay nằm dưới tiêu đề.

Hai file test mới (18 bài cho phép chấm sẵn sàng, 10 bài cho checklist). 1017/1017 xanh.

**Chưa làm, có lý do:** ô **chọn** profile antidetect thay ô gõ tay UUID. Nó cần một endpoint mới
ở cầu nối để liệt kê profile, mà cầu nối **không tự cập nhật** — máy chạy bản cũ vẫn phải gõ tay,
nên phải giữ cả hai đường. Việc riêng, không ghép vào lượt này.

---

## 07/08/2026 — Nick ghim vào một máy, và kho proxy về tay ADMIN

Chuẩn bị cho GĐ6 (bàn giao 5-6 người). Mô hình phân quyền trước đó viết cho **một** người vận
hành cả đàn: chỉ có 4 việc chỉ-ADMIN-làm-được, còn xóa nick và xóa proxy thì ai cũng làm được.

**Gốc của vấn đề là một ô còn thiếu.** `Account.antidetectProfileId` là khóa chính của một file
SQLite trên **đúng một máy** — MultiZen không đồng bộ profile, không có tài khoản, không có
license server (đo trên máy thật 07/08; per-profile cloud sync và team workspace mới ở roadmap của
họ). Nhưng database lưu nó như giá trị toàn cục, nên route mở profile phải đoán *"máy của người
đang bấm"*, và đoán đó sai mỗi khi người bấm không phải chủ nick.

- **`Account.deviceId → RelayDevice`, và vé bay về máy GIỮ NICK.** Máy nhận suy ra từ nick chứ
  không từ người bấm (`resolveNickDeviceRecipient`). Áp cho cả vé mở profile lẫn vé bí mật; nick
  không có máy (Facebook) vẫn đi đường cũ.
- **Ba lỗ đóng cùng lúc.** (1) Bấm "Mở profile" trên nick người khác từng phát được vé rồi chết ở
  cầu nối bằng một lỗi MultiZen mơ hồ. (2) Ruột vé `LAUNCH_PROFILE` chứa **mật khẩu proxy đã giải
  mã** và vé mở profile cố ý không bị đếm hạn nhịp — nên ai đăng nhập được cũng rút được mật khẩu
  cả kho proxy bằng cách bấm nút, dù `/proxies` không bao giờ hiện chúng. (3) Nút "Mở profile" ở
  thẻ nhắc việc gọi `/launch` không kèm `deviceId` nên hỏng với người có hai máy.
- **ADMIN không có ngoại lệ ở nút mở profile.** Ngược `requireNickOwner`, và không phải vì siết
  chặt hơn: vé bọc mật mã cho khóa của máy kia nên phát được cũng không mở nổi. Đường khôi phục là
  gán lại cụm — một thao tác có tên, có `AuditLog`.
- **"Phân công nick" thành "Phân công cụm".** `assignAccountOwner` → `assignAccountCluster`, gán
  người **và** máy trong một form, một transaction. Ép bất biến `deviceId có giá trị ⟹
  device.userId == ownerId và máy chưa thu hồi` — Postgres không ép được ràng buộc bắc qua hai
  bảng nếu không có trigger.
- **Đổi máy ghi `ACCOUNT_DEVICE_MOVED` riêng**, kèm nhắc `export → import → xóa bản ở máy cũ`.
  Cảnh báo chứ không chặn: chuyển hẳn rồi xóa bản cũ là chuyện người thật vẫn làm; thứ giết nick
  là xoay vòng hai máy và quên xóa bản cũ, cả hai đều ngoài tầm với của database.
- **Thu hồi máy gỡ ghim nick của nó** trong cùng transaction, **không bị chặn** — mất laptop là
  đường khẩn cấp, thủ tục không được đặt trước thiệt hại. Câu trả về nói rõ mấy nick vừa mất ghim,
  và `/relay-devices` hiện số nick đang ghim ngay dưới tên máy.
- **Hai dải cảnh báo mới ở trang Hôm nay:** nick ghim lệch (đỏ) và nick có profile mà chưa ghim
  máy (vàng). Đặt ở đây chứ không ở khay vận hành vì khay hiện trên mọi trang nên nó cấm truy vấn
  database — đúng ranh giới `collect-ops-alerts.ts` đã vạch.
- **Kho proxy chỉ ADMIN ghi được:** `createProxy` / `updateProxy` / `deleteProxy` /
  `measureOneProxySpeed` → `adminAction`. Mật khẩu proxy không có bản thứ hai ở đâu ngoài kho, và
  nút đo tốc độ đốt 1 MB quota trả tiền mỗi lượt. Nút **Kiểm** vẫn để mở: vài KB, và cần bấm đúng
  lúc đang gấp.

Làm trước bước nhập liệu của GĐ6 vì kho nick trên máy chủ còn rỗng — migration không cần gán tay
cụm nào. Thứ tự nhập liệu đổi theo: **đăng ký máy cầu nối là bước 0**.

5 file test mới (bảng chuyển trạng thái cụm, bất biến khi gán, bốn lối ra của bộ tìm máy nhận,
thu hồi máy gỡ ghim, ranh giới ADMIN của kho proxy). 999/999 xanh.
