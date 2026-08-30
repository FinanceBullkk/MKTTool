# Project changelog - 12 August 2026

Historical entries moved from [project-changelog.md](../project-changelog.md) when the live
changelog exceeded the 800-line documentation limit. The entry prose is unchanged; only relative
link destinations were adjusted for this archive location.

Earlier history: [7 to 11 August 2026](project-changelog-07-to-11-august-2026.md).
Later history remains in the [live changelog](../project-changelog.md).

---

## 12/08/2026 (11) — Relay 9 replaces a v8 the source could no longer reproduce

v8 was published before the DPAPI transport and migration fixes above landed, so building from
`main` afterwards produced a different executable that still called itself 8 — the exact failure
that raising 7 to 8 was meant to end. `relay:publish` refuses to overwrite an existing version, so
nothing wrong could reach R2, but a locally built "v8" would have reported a number that no longer
identified one artifact.

`MKTTool-Relay-v9.zip` is `74afbdc1…`, built twice to identical bytes, and the installer pins it.
v8 stays on R2 unused; immutable per-version objects are meant to accumulate rather than be
corrected.

The sequencing lesson is the durable part: **publish last, after the code is final.** A guard worth
adding later is stamping the commit into the artifact metadata and refusing to publish from a dirty
tree, so "which source produced this" is always answerable.

---

## 12/08/2026 (10) — The build machine authenticates with its own token

`/api/relay/download/vN` now accepts either a signed-in session or
`Authorization: Bearer <RELAY_RELEASE_DOWNLOAD_TOKEN>`, and the installer build sends
`MKTTOOL_RELEASE_TOKEN` instead of a pasted session cookie. A wrong token falls through to the
session check rather than answering differently, so the route is not a guessing oracle. Only the
versioned route takes a token; the redirect route and the download page stay human-only, because a
build always knows which version it pinned.

The decision still lives in the auth module: `machineOrGuardedRoute` joins `guardedRoute` and
`adminRoute` in `ROUTE_GUARDS`, so the entry-point guard that scans every route keeps recognising
this one. Its handler deliberately receives no `Actor` — a machine is not a person, and a handler
that needs to know who is calling now fails to compile against this wrapper instead of quietly
receiving nothing. Exporting a bare handler and checking inside the body was the alternative, and it
is the shape that guard exists to reject.

The cookie it replaces was wrong four ways: it unlocked the whole app including the identity vault
when the build needed one zip; it expired, so builds failed at random with a 401 that reads like a
broken deploy; it recorded a person in the audit trail for machine-initiated work; and removing that
person from `ALLOWED_EMAILS` broke the build. The token is nobody, expires never, and opens one
route. The server refuses a token under 32 characters instead of accepting it quietly — a weak token
is worse than none, because without one the route is still closed behind the login.

DPAPI now carries plaintext over the pipe as base64 in both directions. Windows PowerShell 5.1
decodes redirected stdin with the console codepage rather than UTF-8, so a secret containing
anything outside ASCII would have been corrupted silently and surfaced as "wrong key". The on-disk
format is unchanged, so existing blobs still read. Forcing `[Console]::InputEncoding` is not the
alternative: setting it against a redirected handle throws on this PowerShell.

The migration's `after-read-back` fault point moved ahead of the durable marker write. It sat
directly beside `before-source-deletion` with no code between, so the two injected at one identical
state and the advertised seven boundaries were six. It now covers a crash between a successful
read-back and the marker reaching disk. The no-legacy fast path also records whichever protected
secrets exist rather than assuming only the device key, so a store already holding the operator key
stays covered by `requireTrackedSecrets`.

---

## 12/08/2026 (9) — The Relay release archive is reproducible

`relay:build` pins the last-write time of the three archived files to a fixed instant before
compressing. Two consecutive builds of the same source now produce byte-identical archives; measured
`00054e26…` twice, and the executable itself was already reproducible.

`Compress-Archive` stores each entry's last-write time, and the executable carries a fresh one every
run, so every rebuild produced a different SHA-256 from identical content. That cost a real mistake
the same day: a rebuilt archive was published under a hash the pin did not expect, and "the hash
changed" could not distinguish a content change from a plain rebuild. It can now.

The limit is that zip records local time, so reproducibility holds within one machine and timezone.
Cross-timezone reproducibility would also need a pinned `TZ`, which this single-Windows-builder
release path does not need to pay for.

---

## 12/08/2026 (8) — MKB-03 Phase 03 protects Relay secrets and closes diagnostics default-allow

Relay now stores the operator-domain key and device private key through DPAPI CurrentUser. The
migration records durable stages, imports, reads back and verifies, removes plaintext, then commits
the schema marker and Relay rollback floor. A non-secret tombstone at the legacy device-key path
prevents a plaintext-only Relay from starting or silently recreating a key after migration. The
installer no longer creates or instructs operators to populate a plaintext operator-key field.

Fault injection covers all seven required boundaries plus a simulated reboot. Tests build their own
temporary Relay homes, migrate through real DPAPI, and scan the complete temporary tree for both key
values with zero matches. This is a same-Windows-user protection boundary, not process isolation or
a sandbox; full-disk encryption remains required for profile and session data.

MKT Browser activity diagnostics now use an explicit key-to-reduced-shape allowlist. Unknown argument
keys are dropped, and the new regression is included in `test:managed`; the existing redaction suite
remains green. Full MKTTool and MKT Browser acceptance passed. The running Relay, MKT Browser, live
data roots, and ports 47821/47822 were not touched.

`RELAY_VERSION` rises to 8, which this phase requires rather than merely accommodates. The migration
records the running version as its rollback floor, so leaving the constant at 7 produced a floor that
accepted the very pre-DPAPI build it exists to refuse. The outdated-Relay banner also compares the
number a Relay reports against the number the server publishes, so two materially different builds
both calling themselves 7 would never raise it — the silent-warning failure that
`relay-endpoints.ts` warns about in its own comment. Ticket floors for `LAUNCH_PROFILE` and
`CREATE_PROFILE` stay at 7: they encode the MKT Browser contract v3, not protected storage.

Removing the plaintext operator key from `relay-config.json` now uses a unique temporary name and
clears it on failure. The previous PID-only name meant a leftover temporary from a crash between
write and rename made every later attempt fail `EEXIST` at a point where read-back had already
succeeded — the Relay would never start again until someone deleted that file by hand.

---

## 12/08/2026 (7) — MKB-03 Phase 01 builds one pinned Relay + Browser installer

Relay publishing no longer overwrites one mutable `MKTTool-Relay.zip`. Each release targets a
retained `MKTTool-Relay-vN.zip` object with measured artifact-version, size, and SHA-256 metadata; an
existing same-version object is accepted only when its size, checksum, and version already match,
and the conditional R2 write refuses replacement. The authenticated version route supports Range
requests so a pinned installer build can resume without falling back to `latest`.

MKT Browser now checks in Relay v7 plus its approved size and SHA-256, rejects a wrong size before
hashing, and embeds it only after verification. The NSIS include is ASCII-only and removes Relay
shortcuts by resolved target rather than localized filename. Install records whether Relay already
existed; uninstall removes Relay only when that durable marker proves MKT Browser owns it, otherwise
it preserves the binary, shortcuts, and `relay-config.json`. Missing markers fail closed to preserve.
The publisher now refuses a missing/stale sidecar or archive bytes that do not match it before any R2
request.

The reviewed installer was rebuilt at `release/installer/MKTBrowser-win-x64.exe`: 145,896,567 bytes,
SHA-256 `c0f619fa1e3686bca5b0be572c3ce17e85f047a6dec17bf8e65e6968b68264b4`. The frozen MKB-02
`release/win-unpacked/MKTBrowser.exe` remained
`238d5d6fd5e373b052c484ceab90698f6dc295205a59be6573f9928b01db4f42`. Full MKTTool verification
passed 120 files / 1165 tests plus typecheck, lint, and production build; all required MKT Browser
guards passed, with packaging now 8/8. Clean standard-user install, reboot, and uninstall remain
unverified human gates; the live Relay and Browser on this machine were not stopped or modified.

---

## 12/08/2026 (6) — the Windows installer now produces an application that starts

The first NSIS installer built from the existing configuration installed cleanly and then died on
its first database call, showing a startup error dialog with no log. The directory package used for
every gate so far was unaffected, which is why nothing had caught it.

Cause: `electron-builder.yml` sets `npmRebuild: false`, so electron-builder packages whichever
`better-sqlite3` build is already on disk. After a normal `yarn install` that is the Node-ABI copy,
and Electron cannot load it. `package-windows-directory.cjs` had always run `@electron/rebuild`
against the pinned Electron version first; `build:win` called `electron-builder` directly and
skipped it. Two Windows artifacts, one of them silently broken.

The packaging pipeline now lives in `package-windows.cjs` with two thin entry points, so no Windows
artifact can be produced without the Electron-ABI rebuild. The installer writes to
`release/installer/` because electron-builder stages an unpacked tree that would otherwise overwrite
the directory package whose SHA-256 the MKB-02 gate result cites. `build:win` runs the Node version
guard and the installer packager instead of electron-builder. `productIdentity` now asserts that both
entry points delegate to the shared pipeline and that `build:win` never invokes electron-builder —
the check that would have caught this.

Verified by running it, not only by tests. The installer builds, installs per-user without UAC,
starts, and drives the whole Web → Relay → MKT Browser chain with contract version `3` and all six
capabilities — the first time the real release artifact rather than the technical package has done
so. Uninstall removes the directory, registry entry, and Start Menu shortcut while `profiles.db` and
the MCP token survive, which is the MKB-03B requirement that uninstall preserves profiles. Node
guard 2/2, W02 8/8, MKB-01 8/8, MKB-01E 7/7, MKB-02 18/18, Windows packaging guards 3/3, typecheck,
and packaged runtime/lifecycle verification all pass. Rebuilding the directory package through the
refactored path reproduces it byte for byte at
`238d5d6fd5e373b052c484ceab90698f6dc295205a59be6573f9928b01db4f42`.

`build:mac` and `build:linux` still call electron-builder directly and carry the same defect. They
are MKB-07 and off the critical path and cannot be tested from Windows, so they were left alone —
but the Intel/arm64 packaging incident that shipped a wrong-architecture binary was this same class
of fault, so MKB-07 must fix them before producing any macOS artifact.

Two smaller gaps recorded while testing: the uninstall entry has an empty `Publisher` field, and the
installer creates no autostart entry. Both belong to MKB-03.

---

## 12/08/2026 (5) — v1 ships unsigned; the MKB-03 gate now allows one announced SmartScreen prompt

The owner decided not to buy a Windows code-signing certificate. v1 is for five or six known internal
operators on machines the project already administers, so the recurring cost is not justified.

The MKB-03 gate previously forbade a SmartScreen bypass. That clause is withdrawn and replaced: the
artifact is unsigned, exactly one SmartScreen click-through is permitted, and the setup journey must
show the operator what the prompt looks like and where to click **before** it appears. An operator
who has to ask what the warning means still fails the gate.

Release authority does not change. It was always carried by the project's own offline manifest root
key rather than by Authenticode, so the signed compatibility manifest, sequence pinning,
anti-downgrade state, rollback floor, and delegated-key rotation stand exactly as specified. The
publisher check against the installer binary is dropped, which means the manifest root is now the
only source of release authority and its private key must stay offline and out of CI.

The recorded gap: the installer binary is backed only by a checksum served from the same host as the
artifact, so a compromised release host could hand a brand-new device a different installer before
any local state is pinned. Everything after that first install remains covered by the manifest
chain. An internal PKI was considered and rejected — pushing a private root to six unmanaged
WORKGROUP machines needs an administrator on each one and still would not clear SmartScreen, so it
adds operator friction without removing the wall.

Updated the MKT Browser plan (installer, section 8.4 update authority, section 10 release gates,
MKB-03A/03B, the MKB-03 gate, v1 measures, and the completion checklist), the roadmap delivery
target, blocker table and budget, and the product overview decisions. Revisit if distribution ever
reaches beyond the known team.

---

## 12/08/2026 (4) — MKB-02 closes with managed controls, correlated diagnostics, and live device health

Completed MKB-02 across MKT Browser, Relay, and MKTTool. Browser contract version `3` now advertises
`managed-profile-v1` and `operation-diagnostics-v1` alongside idempotent create and atomic launch.
Ticket `jti` is preserved as `operationId`, create keeps its retry-stable `requestId`, and only
sanitized stage, code, duration, and runtime versions cross the local layers. Correlation mismatches
fail closed. Proxy endpoints/credentials, tickets, cookies, page content, external references, and
fingerprint seeds are excluded from diagnostics, activity summaries, and MCP proxy summaries.

The discovered HTTP token is profile-management only. Page-control, page-read, cookie, and raw-CDP
tools are absent from `tools/list` and rejected from `tools/call`; this build issues no page-control
token. Managed profiles show a locked state and cannot be directly launched, deleted, exported, or
have proxy/fingerprint changed through ordinary UI, command-palette, IPC, or MCP paths. Atomic
managed launch remains the only permitted proxy update path.

Relay v7 is required for both managed create and launch. Relay health now evaluates the live Browser,
contract, engine, and required capabilities on the current PC; profile list/create/launch stop until
that local runtime is operational. The Web setup surface reports `Ready` only from current local
evidence and otherwise shows an actionable repair state. Operation support detail is expandable on
create and launch results.

Verification passed: MKT Browser MKB-02 18/18, all desktop main tests 25/25, typecheck, Windows
directory build, and packaged contract/lifecycle; MKTTool focused managed-flow tests 8 files/80 tests,
full suite, typecheck, ESLint, and production build. The packaged executable is unsigned and has
SHA-256 `238d5d6fd5e373b052c484ceab90698f6dc295205a59be6573f9928b01db4f42`.
MKB-03 signing/onboarding/update work and the MKB-04 pilot/canary gates still block distribution and
real accounts.

---

## 12/08/2026 (3) — MKT Browser contract v2 launches profiles atomically

Completed the atomic-launch slice of MKB-02 across MKT Browser, MKTTool, and Relay. MKT Browser now
exposes `launch_managed_profile` and advertises `atomic-launch-v1` under contract version `2`. The
operation persists and reads back the requested proxy before launch. If the profile is already
running, it returns the existing session only when the active proxy matches; a mismatch returns
`PROFILE_ALREADY_RUNNING` without changing or relaunching that session.

MKTTool supports contract versions `1` and `2`. Relay prefers the atomic operation, uses the legacy
`update_profile` then `launch_profile` sequence only when the atomic tool is absent, and never falls
back after an atomic rejection. The cross-repository smoke contract now requires and exercises the
atomic capability.

Packaged Windows verification also closed a lifecycle defect where Chrome handed off from its
launcher PID to the real browser PID. Process discovery now follows the exact `--user-data-dir`,
selects the live Windows process, and cleans up when CDP disappears. A per-profile launch lock also
prevents concurrent requests from replacing a verified proxy before Chromium starts. Verification
passed: MKB-02 12/12, focused MKTTool atomic/contract tests 53/53, both full project verification
sets, and the packaged lifecycle with zero disposable Chrome processes remaining. The unsigned
executable SHA-256
is `4253401aa1a59995f30d2d49a5875a5b705453c751c008b1e5437ce19d99e37b`.

MKB-02 remains open for correlated stage diagnostics, token capability separation, managed-control
locking, current-device health, and remaining cross-repository coverage.

---

## 12/08/2026 (2) — Relay discovers the MKT Browser token without operator copy/paste

Completed the Windows MCP-token discovery slice of MKB-02. Relay now validates and reads the bearer
token from `%LOCALAPPDATA%\MKTTool\MKTBrowser\mcp-token` on demand. If MKT Browser creates the token
after Relay has already started, the next status or profile request sees it without a Relay restart.
The adapter is rebuilt if the token changes, and readiness caching is bound to the token that was
actually probed.

The Relay status page no longer asks an ordinary operator to reveal or copy the token. It reports
whether access was discovered automatically, supplied by a development override, or is still absent.
`mktBrowserToken` remains supported in `relay-config.json` only for disposable/custom development
data roots and must be a 64-character hexadecimal token.

Verification passed: all Relay tests 156/156, focused discovery/lifecycle tests 45/45, typecheck,
lint, and `git diff --check`.

---

## 12/08/2026 (1) — Relay endpoints gain a default-deny exposure inventory

Completed the MKTTool-owned Relay inventory slice of MKB-02. Every owned JSON endpoint now declares
one allowed HTTP method and one reviewed capability class in a typed registry. The production route
table can no longer add or omit a contract endpoint without a TypeScript failure, and a wrong method
returns `405` before the endpoint handler reads a body or performs work.

This closes the HTTP-surface inventory only. It does not claim token capability separation, atomic
profile launch, cross-layer operation diagnostics, or cross-repository contract completion.

Verification passed: all Relay tests 149/149, focused route/inventory tests 15/15, typecheck, lint,
and `git diff --check`.
