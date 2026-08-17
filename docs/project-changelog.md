# Nhật ký thay đổi

Ghi theo ngày, gom theo giai đoạn. Chỉ ghi thứ đổi hành vi của công cụ — không ghi việc dọn dẹp
nội bộ. Trạng thái hiện tại ở [development-roadmap.md](development-roadmap.md).

Dự án chưa phát hành phiên bản (`0.1.0`, dùng nội bộ). Mốc chia theo giai đoạn, không theo semver.

> **Phần từ 04/08/2026 trở về trước** đã chuyển sang
> [archive/project-changelog-den-04-08-2026.md](archive/project-changelog-den-04-08-2026.md)
> ngày 06/08/2026, khi file này chạm ngưỡng 800 dòng. Đó là giai đoạn công cụ còn chạy trên một
> máy bàn — từ lúc xoay hướng cho tới ngày nền dữ liệu sang Postgres. Nội dung giữ nguyên từng chữ.

---

## 17 August 2026 - Two ways to hand a Relay the wrong authority, both closed

The audit reached release authority and the trust chain. Both defects below let someone decide what a
Relay would believe, so they change behaviour and belong here.

**A Relay accepted public keys under which signatures verify without a private key.** Ed25519 has
eight points that break the maths: give one of them to a verifier as a public key and a signature of
essentially nothing verifies for a large share of messages, forged by anyone, with no key involved.
The key import checked length and character set, not whether the value was one of these. Measured
against Node: the worst of them verified a forged signature for 200 out of 200 random messages, the
mildest for 19 out of 200 — and one working message is all an attacker needs, because they choose it.

Anyone able to set a Relay's `serverPublicKey` to such a value could forge every ticket that Relay
accepts. Both key-import paths now refuse small-order points and non-canonical encodings, the second
being the same aliasing that let a revoked device key return wearing different bytes. The blocked
values are derived from the curve equation rather than copied from a list, and the test re-derives
them on each run, so a typo fails the suite instead of quietly narrowing the guard. No genuine key is
affected: 64 freshly generated keypairs matched none of them.

**A Relay that was already enrolled would change its trust root on request.** `/configure` writes
`deviceId` and `serverPublicKey` from the web app, and it never checked whether the Relay already had
a trust root. The Origin check stops a foreign page, but not the trusted one — so an XSS in the web
app could repoint every Relay at an attacker's key while each Relay still held `VAULT_KEY_OPERATOR`,
turning a transient browser-side compromise into standing authority on operator machines.

Re-sending the key already on disk still succeeds, because re-running enrollment is ordinary. Only a
change is refused, and the message points at the supported path: retire the device, then register it
again. This does not affect server key rotation, because no rotation distribution exists today; if
one is built it must travel as a statement signed by the outgoing key rather than an unsigned POST.

## 16 August 2026 - Two identity-boundary defects found by audit and fixed

A deep audit of the cryptographic protocols and the local control surface found three defects worth
recording. Two of them changed behaviour that protects an operator's identity, so they are written
here rather than left in the audit reports.

**MKT Browser: the proxy bridge accepted a destination that could rewrite the request sent to the
proxy provider.** The bridge builds its upstream `CONNECT` request by pasting the requested hostname
into an HTTP header block. It read that hostname from the local SOCKS5 request as raw bytes, so a
name containing a carriage return or line feed appended lines of the caller's choosing to the request
the real proxy received. Demonstrated end to end against a test proxy, which saw the injected headers
arrive as genuine headers.

Reaching it requires a program already running on the operator's machine: the bridge listens on
loopback and, by design, accepts connections without authentication. MKT Browser itself never sends
such a hostname. The destination is now checked against an allowlist of the characters a hostname may
contain, applied before either upstream type, so anything that could act as a separator is refused.

**Every MKT Browser build from `v0.2.0` to `v0.3.1` contains the unfixed bridge** — it has been
present since the SOCKS5 bridge was introduced on 13 May 2026. The fix ships in the next build;
machines still on an older build stay affected until they update.

**MKTTool: revoking a device could leave a second copy of that device usable.** An X25519 public key
ignores the top bit of its final byte, so two different 64-character strings can name the same key.
The enrollment path folded case and whitespace but not that bit, and `RelayDevice.publicKey` is
unique per string — so one machine's key could occupy two rows. Revoking the row an admin knew about
left the other one live and still receiving tickets, decryptable with the same private key. Enrolling
the second copy needs the enrollment screen, so this is an insider or lost-device scenario rather
than a remote one.

Non-canonical keys are now refused at enrollment. Nothing legitimate is affected: a real key always
has that bit clear, so no existing device record changes.

**Also fixed:** the proxy bridge could not be loaded by the desktop test runner at all — it used the
one TypeScript construct that runner cannot parse — which is why the module that carries the
identity-protection promise had never had a test. It now has one, including a check that a dying
proxy breaks the profile instead of quietly sending traffic out on the machine's own address.

## 16 August 2026 - Browser control and proxy identity audit continuation

The MKT Browser audit found and fixed one unsafe raw-CDP edge: safe mode could send an untracked
`*.enable` command without a reviewed paired disable. Unknown domains are now rejected, while the
Relay token still cannot reach raw CDP at all. Managed launch was also re-proven to require and
persist its proxy and fingerprint; hostile disable flags cannot replace either value.

When a proxy geo probe is unavailable, the Browser now clears stale cached country state, records a
stable diagnostic, and disables WebRTC rather than risking a direct WebRTC path. Launch remains
allowed because an external geo service outage is not itself proof that the proxy is unusable; a
timezone mismatch remains a visible detection-risk residual until the probe recovers.

Finally, removing a proxy from an existing unmanaged profile requires explicit confirmation. The
profile's cookies and fingerprint remain on disk, so the warning makes the resulting host-IP identity
change visible before autosave.

## 16 August 2026 - Relay v12 published and the installer rebuilt from it

Relay v12 is on the release bucket and served by the token-gated download route, so `/relay-download`
now hands the team the current build and older installs start seeing the out-of-date notice.

The Windows installer is rebuilt by fetching that published object instead of a locally packaged
copy, which is what the phase gate asked for. The build machine authenticates with a route-scoped
token rather than a person's session cookie: a cookie unlocks the whole app including the identity
vault, expires mid-build, and dies when that person leaves the team. CI had shipped a stale
`MKTTOOL_RELEASE_COOKIE` variable that nothing read, so the job would have run unauthenticated; the
guard that kept the cookie out of the fetcher now covers the workflow too.

Packaging also emits the artifact hashes and sizes the compatibility manifest is signed over. That
step needs the pinned engine release record, which now ships beside the pinned Relay release in the
browser repository rather than only in this plan folder — packaging must never fall back to
resolving an engine latest, because a different Chromium moves the measured fingerprint of every
profile at once.

## 15 August 2026 - Device-side revocation memory

A delegated release key proven revoked now stays revoked on the device. Revocation statements are
root-signed, so they cannot be forged — but they travel inside the update payload, so whoever serves
an update chooses which ones to include. Omission needed no forgery: a holder of a revoked key only
had to leave the statement out. The protected compatibility state now carries a grow-only set of
revoked delegated key ids, checked ahead of the payload and recorded before staging so a failed
download cannot make the device forget. State written before this field reads as an empty set rather
than failing into ADMIN repair.

The secure-store rollback floor stays fixed at the value the clean install recorded. A floor that
rose with a later reinstall was implemented and reverted: the coordinated update path never
reinstalls, so it would only reach a device by accident. Raising it properly means a minimum-floor
field in the signed manifest, which is not bought while rollback can only reach the single retained
set one step back. The reasoning is recorded in the phase file so the next reader does not
re-litigate it.

Phase 05 is now complete in code: manifest validation with all seven rejection cases, coordinated
activation, fault-injected convergence, bounded rollback, and the post-activation smoke test. Real
Windows reboot during activation, Relay v12 publication, and the live update/rollback rehearsal
remain human gates.

## 15 August 2026 - Release authority ceremony verified

The production release-authority ceremony is complete. A public receipt binds root key
`a6d3237649c2586e48b6e4fa744f7a089160fd80250fd29360513f5f625b146c` to delegated manifest key
`6e5d47d894206e69e6464748333eb76c99b18da1f1b42ddafb2e3f265a7b786e`, with expiry
`2027-08-14T00:00:00.000Z`. Two encrypted root backups are held in separate physical locations, and
the required recovery rehearsal from backup B passed. Public delegation and recovery signatures
verify against the copied root public key, and their SHA-256 values match the receipt.

Only the receipt and public evidence enter the project. The passphrase, encrypted private backups,
and DPAPI-protected delegated private key remain outside the repositories and CI. Phase 05 therefore
moves from ceremony-blocked to implementation in progress; MKB-04 remains NO-GO until manifest
validation, coordinated activation, fault-injected convergence, bounded rollback, and live gates pass.

## 15 August 2026 - Shared setup conflict verdict

The Windows combined installer now persists its exact standard-user conflict detector beside the
packaged Browser instead of using it only from NSIS temporary storage. A read-only runtime mode
allows the expected running MKT Browser and Relay but retains foreign executable ownership,
listeners on `47821`/`47822`, running MultiZen, and duplicate or foreign startup-entry checks. The
detector never stops a process or changes MultiZen data during setup inspection.

MKT Browser contract v4 keeps its base capabilities stable and adds `local-install-ready-v1` only
after the runtime detector passes. The result is cached for five seconds and fails closed when the
script is missing, PowerShell fails, or inspection times out. Relay v12 already forwards arbitrary
capability strings, so this integration does not require a Relay rebuild. MKTTool `/setup` requires
the new capability and gives one safe installer-repair action when it is absent; ordinary managed
profile readiness continues to require only the base capability set.

The complete Browser Node 22 installer suite passes 97/97 on the owner's Windows account, including
runtime conflict checks and Windows packaging contracts at 24/24; Browser typecheck, lint, and the
production Electron bundle also pass. Focused MKTTool setup tests pass 28/28 with typecheck, lint,
and build. The full MKTTool sandbox run passes 1,359/1,367; only eight DPAPI CurrentUser tests fail
under the sandbox user context, while the owner's real Windows-account run remains 22/22. No
installer was rebuilt or published, and the physical signing ceremony remains the release blocker.

## 15 August 2026 - Relay retirement race hardening

Review found that bootstrap authorization and operator-key grant actions could read an active Relay
device, then store fresh authorization state after a concurrent planned-retirement transaction had
revoked it. Both actions now reject pending retirement up front and commit through conditional
writes that require the device to remain unrevoked and outside retirement. Losing that race returns
a controlled failure instead of restoring grant or bootstrap state. Database regressions cover both
retirement-state boundaries; milestone and release-gate status remain unchanged.

## 14 August 2026 - Pre-MKB-04 remediation checkpoint

The device lifecycle is now split into normal uninstall, emergency revoke, planned Relay retirement,
and Browser-only profile deletion. Repair and uninstall preserve every local identity. Emergency
revoke is explicitly for a lost or unreachable PC and makes no remote-wipe claim.

Planned retirement is an ADMIN-only, server-first protocol. The server revokes the device, clears
account assignments and pending grant/bootstrap delivery, then signs a short-lived authorization
bound to the device id, X25519 public key, and a per-retirement finalization public key. Relay opens
a recipient-only completion proof, persists a DPAPI recovery receipt before deleting its operator
key, device key, grant state, and configuration. A non-secret rollback-floor marker and legacy key
tombstone remain, and enrollment, secret, profile, and ticket routes fail closed while the
receipt remains. The server records cleanup only after proof validation, signs and stores a durable
completion receipt with the one-use finalization key, then erases that encrypted private seed. Relay
verifies the completion against the finalization public key already stored in its protected receipt,
so later ticket-signing-key rotation cannot strand recovery or authorize a second completion.
`/setup` treats this state as explicit retirement recovery, not enrollment or generic repair. Browser
profiles, cookies, the MCP token, and MultiZen data are never deleted by this flow.

Relay source is now version 12 because version 11 predates Browser contract v4 support. The web UI
still refuses retirement until the exact local PC reports version 11 or later; that floor protects
the retirement endpoint independently of Browser compatibility. Retirement keeps the rollback
marker and tombstone so an older Relay cannot recreate identity while the protected receipt is
pending. The packaged v12 executable accepts Browser contracts 1-4 and passed the full crypto smoke
path plus signed cleanup, recovery health, and finalization. Its local, unpublished ZIP is
34,181,785 bytes with SHA-256
`fe6de7fcf23a811682226a765c2986d1dc7e0242ef247ec61f1e5bd56dcd998c`.

MKT Browser now runs existing-install conflict inspection before old-version uninstall or source,
registry, and shortcut mutation. Interactive and silent install paths inspect the resolved target
directory. Standard-user process and fixed-port detection uses `Get-Process` plus `netstat` instead
of CIM APIs that returned access denied on the current machine.

Repair removes only exact-target owned startup duplicates after every conflict check passes. Relay
uninstall cleanup stops only the exact owned executable path, removes matching shortcuts and binary,
and preserves `relay-config.json`; disposable fixtures verified both ownership boundaries without
touching the live installation. MultiZen is detected but never stopped or deleted.

The Browser packaging suite now passes 23/23, and the complete installer suite, real workspace lint,
and typecheck pass under Node 22. Execution and adversarial review exposed and fixed four blockers
that the earlier tests missed: an official packaging entrypoint that reused stale `out` bundles,
unsafe direct spawning of `corepack.cmd`, an undefined NSIS executable constant, and custom-header
dependencies used before electron-builder declared them. Regression tests cover each contract.

The fresh unsigned installer is 146,006,574 bytes with SHA-256
`b66c3cf89ac683063372d320c7a77193be1d90a3a0427066318fc6e849dc4f2b`. Its embedded Relay archive
and manifest exactly match local v12, and post-build legacy-profile tests prove Node ABI restoration.
The artifact was not published, installed, or promoted. MKB-04 remains NO-GO: Phase 05 awaits the
owner root/delegation custody ceremony, and Phase 06 still needs Relay v12 publication, live Windows
matrices, and the unfamiliar-operator rehearsal.

MKT Browser profile deletion is now a separate high-friction lifecycle instead of an uninstall,
retirement, or MCP operation. Contract v4 removes `delete_profile` from every MCP policy. The in-app
dialog names the exact profile and requires `DELETE <full profile id>`. Main-process enforcement
refuses launch, running, and closing states; ordinary managed-profile deletion remains locked while
the dedicated Browser flow can remove it. Profile schema v3 records incomplete deletion, moves only
the owned profile directory into same-root quarantine, validates real paths against the MKT Browser
profile root, and makes every crash point retryable. Relay configuration, device credentials, the MCP
token, shared product settings, and MultiZen data remain untouched.

The release-authority ceremony now has portable, fail-closed tooling. The owner machine creates the
delegated Ed25519 key only inside a DPAPI CurrentUser store. A separate offline host creates two
independently salted AES-256-GCM root backups protected by scrypt, writes them to different volume
roots without overwrite, reads both back, signs the first delegation, and proves recovery from copy
B. The offline-tool ZIP plus delegated and root fingerprints are compared over a separate paper
channel so replacing the transfer drive cannot silently substitute ceremony code or authority.
Verification matches the public root, delegation, recovery proof, and local DPAPI key before writing
a non-secret receipt. No production
key was generated; six focused tests plus the 1,362-test full suite, typecheck, and lint pass.

## 13 August 2026 — MKB-03 local onboarding human-test fixes

The local human test exposed a real WebRTC STUN leak in packaged Chrome for Testing even though HTTP
traffic used the proxy and Chromium/JavaScript WebRTC mitigations were enabled. The Windows installer
now owns a one-shot elevated firewall transaction for exact, stable CFT and CloakBrowser runtime
paths. Each proxied launch independently verifies its engine rule and all firewall profiles before
any browser process starts; uncertainty fails closed. Runtime replacement uses a stable directory,
rollback staging, and a version marker so updates do not silently detach the rule.

The bootstrap error modal can persistently switch a failed CloakBrowser download to Chrome for
Testing without leaving the modal or editing settings files. The fallback is labeled compatibility
only. Unknown download sizes now show `Connecting...`, attempt count, and resume state instead of a
false zero-byte percentage.

`/setup` now treats saved device ID localStorage as a hint. It probes the live Relay identity first,
clears stale reset identities, replaces same-owner hints, and preserves fail-closed repair behavior
for revoked or different-owner devices. The Relay status page now points to `/setup` as the primary
journey and labels manual operator-key entry as recovery/legacy while retaining the server-secret
boundary explanation.

Automated contracts, typechecks, desktop build, and combined NSIS compilation are green. BrowserLeaks
and HTTP egress after restart and after a runtime update remain human gates; no real account is
approved by this change.

## 13 August 2026 — MKB-03 Phase 04 enrollment grants and ADMIN bootstrap

The enrollment/bootstrap protocol advances Relay source to version 10. A Windows v10 artifact was
built and passed the packaged executable smoke path locally; it has not been published.

Operator-key delivery now separates durable recipient ciphertext from a server-signed 30-second,
one-use authorization bound to owner, device, revocation state, grant generation, and grant hash.
Relay verifies the signature and recipient before atomically persisting the key, generation, grant
ID, and recipient completion proof in one protected record. Exact retries after response loss,
reload, restart, or authorization expiry return the cached proof without rewriting the key.

Signed authorizations carry their issue time and allow a bounded 60-second Windows clock skew. A
larger drift fails with explicit time-sync guidance; the documented worst-case first-delivery window
is therefore 90 seconds rather than pretending the Relay and server clocks are identical.

The server records `Ready` only after validating that proof and handles completion idempotently.
First-device bootstrap is ADMIN-only, lasts five minutes, reuses the existing Relay-owned plaintext
form, and exposes a cached local proof so a lost response does not require a second key entry. The
additive migration stores only signed-envelope metadata, hashes, and opaque recipient ciphertext.
Once verified grant state exists, Relay removes the retired standalone operator key and retries that
cleanup on startup or exact redelivery. Partial completion metadata now returns a controlled error
instead of throwing. Bootstrap authorization remains memory-only and is intentionally lost on Relay
restart. Offline-administrator, real Windows reboot, and live-database-copy migration rehearsals remain
open; the database rehearsal must include a legacy pending grant and an explicit regrant recovery.

## 13 August 2026 — MKB-03 Phase 02 current-PC setup controller

`/setup` now renders one pure six-state current-PC controller with one primary action while retaining
the existing eight-step workspace preparation checklist. The first loopback request remains inside
the operator's click, and a second confirmation shows the detected PC name and signed-in email before
enrollment. Registry reconciliation fails closed without fabricating a conflict reason when inspection
or enrollment fails.

`Waiting for administrator approval` is durable and non-error: the browser stores only the public
device ID needed to resume, then rechecks owner, revocation, grant, local Relay, MKT Browser,
contract, and engine state. Live Relay update status now feeds the controller, while `Ready` still
comes exclusively from `currentDeviceBrowserReadiness()`. Technical layers moved behind support
details while `/setup`, `/relay-download`, and `/relay-devices` remain reachable.

The unsigned SmartScreen journey is announced before download. The component references the future
real capture and renders a visible pending state while the asset is absent. The real SmartScreen
capture, deployed Chrome/Edge Local Network Access matrix, and clean-account reboot rehearsal remain
human gates.

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
[MKB-W02 Windows internal clean break](../../MKTBrowser/docs/mkb-w02-windows-internal-clean-break.md).

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

Thiết kế đã cập nhật tại [plan MKT Browser](../plans/260810-0244-mkt-browser-noi-bo/plan.md).

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

Thiết kế đầy đủ: [plan MKT Browser](../plans/260810-0244-mkt-browser-noi-bo/plan.md).

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

Khảo sát UX trước khi bàn giao GĐ6 ([báo cáo](../plans/reports/uxreview-260807-0459-luong-cau-hinh-va-onboarding.md))
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

---

## 06/08/2026 (khuya, 3) — Khóa vùng operator tự về máy, không còn ai phải chép

Cầu nối **bản 5**. Mảnh cuối của luồng cài: `deviceId` và `serverPublicKey` đã tự đi xuống từ hôm
trước, còn `VAULT_KEY_OPERATOR` thì vẫn phải xin quản trị viên rồi dán tay. Nay nó cũng tự đi.

- **`/relay-devices` có mục "Đang chờ cấp khóa".** Máy vừa đăng ký hiện ở đó; ADMIN bấm **Cấp
  khóa** một lần là xong. Khóa tự về máy đó ngay lần sau người dùng mở web app — thẻ "Cài máy này"
  tự hỏi lại mỗi 10 giây và tự chuyển xanh, không phải tải lại trang.
- **Không còn mã nào để gửi cho nhau.** Cầu nối **trên máy ADMIN** bọc khóa bằng bắt tay X25519 với
  khóa công khai của đúng máy nhận — dùng lại `sealForDevice`, cùng cơ chế đang bọc ruột mọi tấm
  vé. Máy chủ giữ hộ cái hộp và mở không nổi; trang web chuyển nó đi và cũng mở không nổi.
- **Vì sao không phải là "mã mời".** Bản dựng trước đó chở khóa bằng một bí mật đối xứng gửi qua
  chat, và kéo theo cả một bộ phụ tùng để bù cho chuyện đó: hạn 24 giờ, dùng một lần, một bảng
  `RelayInvite`, và một endpoint `consume` **không gác được** — vì máy nhận chưa có danh tính lúc
  đổi mã. Bọc cho khóa công khai của máy nhận thì cả năm thứ đó biến mất cùng lúc: không có bí mật
  nào đi qua kênh nào, nên không có gì để hết hạn hay để lộ. Bảng `RelayInvite` bị gỡ.
- **Cầu nối không còn tự gọi ra mạng.** Bản mã mời bắt nó tự đi lấy cấu hình từ máy chủ, trái QĐ 5.
  Trình duyệt trở lại đúng vai người đưa thư ở cả hai chiều.
- **Thu hồi mạnh hơn một nấc:** gạch tên một máy **trước khi nó kịp lấy hộp** thì khóa không bao
  giờ tới nơi. (Vẫn không với tới ciphertext máy đó đã lấy về từ trước — mất máy thật thì vẫn phải
  xoay `VAULT_KEY_OPERATOR`, rồi bấm **Cấp lại khóa** cho từng máy.)
- **Cột "Khóa operator" nói *"chưa cấp"*, không nói *"chưa có khóa"*.** Có đường thứ hai để một máy
  có khóa — dán tay ở trang trạng thái của cầu nối — và máy chủ mù với đường đó cho tới khi chính
  chiếc máy ấy mở web app và tự khai. Sổ chỉ khai thứ nó biết chắc.
- **Chiếc máy đầu tiên của cả team vẫn dán tay**, và đó không phải thiếu sót: lúc đó chưa tồn tại
  cầu nối nào khác để bọc khóa từ đó. Ô dán tay ở lại làm đường bootstrap và làm đường thoát khi
  ADMIN không online.

## 06/08/2026 (khuya, 2) — Cài cầu nối: từ bốn lượt chép tay xuống một cú bấm

Cầu nối **bản 2**. Cài một máy trước đây là chép tay bốn giá trị giữa hai màn hình, sửa JSON, rồi
tắt bật lại. Ba trong bốn giá trị đó **máy chủ vốn đã biết** — bắt người ta làm người đưa thư là
ma sát không đổi lấy gì.

- **`/relay-devices` có thẻ "Cài máy này".** Bấm → trình duyệt đọc khóa công khai từ `127.0.0.1`,
  gửi lên, máy chủ ghi vào sổ rồi trả mã máy về, trình duyệt đẩy ngược xuống cầu nối. Trình duyệt
  làm người đưa thư ở cả hai chiều — đúng vai nó đã làm với vé.
- **`webOrigin` nay nung vào `.exe` lúc build**, không còn là ô phải điền. Đây là mảnh gỡ thế bí:
  cầu nối chưa cấu hình thì `allowedOrigin` là `null` nên **không trả header CORS nào**, tức web
  app không thể nói chuyện với chính chiếc máy nó cần cấu hình hộ. Nới CORS lúc chưa cấu hình là
  lối ra sai — lúc đó trang web bất kỳ cũng trỏ được cầu nối sang máy chủ của nó, biến một máy
  đang giữ `VAULT_KEY_OPERATOR` thành **máy giải mã thuê**. Đổi domain vẫn ghi đè được bằng file
  cấu hình, không phải build lại.
- **Hai đường ghi cấu hình, tách hẳn nhau.** `/configure` nhận `deviceId` + `serverPublicKey` từ
  web app; `/set-operator-key` nhận khóa vùng operator và **chỉ trang của chính cầu nối gọi được**.
  Khóa đó đi qua trang web là đi qua máy chủ, và GĐ3 mất nghĩa ở đó. Cả hai đều giữ nguyên phần
  của đường kia khi ghi.
- **Cả hai tự đối chiếu `Origin` trong thân hàm**, không nhờ CORS. CORS chặn việc *đọc phản hồi*,
  không chặn request rời đi — một `POST` kiểu "simple request" vẫn tới nơi và tác dụng phụ vẫn xảy ra.
- **Cấu hình nạp nóng.** Không còn chỗ nào phải tắt bật lại.
- **`/health` khai thêm `configured`, `deviceId`, `webOrigin`** — đủ để web app vẽ đúng nút, và để
  chẩn đoán ca một bản `.exe` dựng nhầm nguồn (mọi lời gọi chết theo kiểu CORS, không câu lỗi nào
  chỉ về phía đó).

> **Ba lỗi bắt được trong lúc làm, cả ba đều thuộc loại hỏng-trong-im-lặng.**
> (1) Bộ build bọc thừa một lớp dấu nháy nên `.exe` đi tin một nguồn tên là `"https://…"` — kể cả
> dấu ngoặc. (2) Bộ nghiệm thu `.exe` lặng lẽ đo nhầm một cầu nối khác đang chạy sẵn trên máy; nay
> nó dừng ngay nếu cổng đã có người. (3) `relay:build` in ra mã băm của gói **đang nằm trên R2**
> thay vì gói vừa dựng — hai bản khác nhau ra cùng một chuỗi.

---

## 06/08/2026 (khuya) — Gói cầu nối phát qua R2: `/relay-download` hết là một nút bấm vào ra trang trống

`.exe` cầu nối dựng trên Windows còn ảnh chạy dựng trên Linux, nên nó không thể nằm trong ảnh
Docker — và `relay/dist/` lại bị gitignore, nên nó cũng không đi theo repo. Hệ quả: trang tải trên
Railway nói *"chưa có gói"* với **mọi** người mở nó. Nay có chỗ thứ ba để đặt file
([QĐ 12](../plans/260804-1752-web-chung-cho-team-phan-tan/plan.md#qđ-12--gói-cầu-nối-cất-trên-r2-app-lấy-hộ)).

- **Ngăn R2 riêng, token riêng.** Bốn biến `RELAY_RELEASE_R2_*` tách hẳn khỏi bốn biến `R2_*` của
  sao lưu. Máy chủ dùng token **chỉ đọc**; token **ghi** chỉ nằm ở `.env` của máy build. Gộp hai
  ngăn vào một chìa là mở rộng thiệt hại của một lần chiếm máy chủ chứ không thu hẹp nó — ngăn gói
  cài chứa thứ công khai được, ngăn sao lưu thì không.
- **`npm run relay:publish`** đẩy gói lên, rồi **đọc lại từ R2 để đối chiếu**. Một lượt `PUT` trả
  200 chứng minh R2 nhận request, không chứng minh thứ nằm trên đó là thứ mình định gửi.
- **Tách khỏi `relay:build` có chủ ý.** Build là việc làm nhiều lần kể cả để thử; phát hành là việc
  cả team nhìn thấy — nó đổi thứ mọi người tải về và bật dải *"cầu nối bản cũ"* trên máy người khác.
- **Mã băm băm một lần lúc phát hành**, đính vào metadata của object. Máy chủ đọc nó bằng một
  request `HEAD` thay vì kéo 32 MB về ở mỗi lượt mở trang. Mức tin cậy không đổi: con số vẫn đi
  cùng đường với file, vẫn không phải chữ ký số. Mã băm sai hình dạng bị chặn ở cửa — một chuỗi rác
  đi tới trang tải sẽ được người cài đem đối chiếu, thấy lệch, rồi kết luận file hỏng.
- **Không khai ngăn thì máy chủ tìm trên đĩa** như trước. Đó là đường của máy dev vừa build xong,
  để mở thử trang tải mà không phải dựng R2 trước.
- **Lỗi mạng không hóa thành "chưa có gói".** Hai chuyện đó dẫn tới hai việc phải làm khác hẳn
  nhau, và câu sai sẽ cử người quản trị đi build lại một gói vốn đã nằm sẵn trên R2.

> Module R2 dời từ `lib/backup/` sang `lib/r2/` — nay nó phục vụ hai tính năng, tên cũ nói dối.

> **Làm sớm hơn mốc đã hẹn.** QĐ 12 định hoãn tới đợt TikTok hoặc bản cầu nối thứ hai, với lý lẽ
> "1-2 máy thì chép USB là xong". Lý lẽ đó cân chi phí code với tần suất dùng nhưng bỏ sót cột thứ
> ba: đây không phải một tính năng vắng mặt mà là một **màn hình hỏng đang bày ra** cho đúng người
> được bàn giao đầu tiên.

---

## 06/08/2026 (tối) — GĐ5: web lên máy chủ thật, deploy tự động, và bản sao lưu tự rời khỏi Railway

Ba mảnh cuối của GĐ5, và cả ba đều đóng cùng một lỗ: **thứ cần một người nhớ thì sớm muộn cũng có
ngày không ai nhớ.**

- **Web chạy thật ở `mkttool-web-production.up.railway.app`.** Postgres `postgres-ssl:18` có ổ đĩa
  riêng, kho cũ nạp sang đủ (10 proxy + sổ migration đối chiếu khớp), đăng nhập Google vào được, và
  danh sách biến môi trường đã soi bằng mắt: đủ 12 biến cần, **không có `VAULT_KEY_OPERATOR`** —
  tức GĐ3 vẫn còn tác dụng trên máy chủ thật, không chỉ dưới máy dev.
- **Đẩy commit lên `master` là web tự cập nhật.** Nối bằng
  `railway service source connect --repo … --service mkttool-web`, tức **đổi nguồn của chính
  service cũ** chứ không dựng lại — giữ nguyên domain, biến môi trường và redirect URI đã khai.
  Vướng nửa buổi vì repo thuộc org mà tài khoản chỉ là `member`: cài GitHub App phải là OWNER, và
  đường CLI chỉ nối được một nửa. Trước đó mỗi lần deploy là một lượt `railway up` gõ tay — mà
  `railway up` thiếu `--service` thì deploy web **đè lên dịch vụ Postgres**, triệu chứng là một câu
  lỗi Prisma chỉ về phía mạng.
- **Máy chủ tự `pg_dump` rồi tải lên Cloudflare R2 mỗi đêm** (`BACKUP_DAILY_AT` + bốn biến `R2_*`).
  Đây là **đổi hướng so với hôm qua**: chốt cũ nói app không tự sao lưu vì `data/backups/` trong
  container là ổ tạm. Chốt đó đúng phần chẩn đoán, sai phần kết luận — vấn đề không phải "app
  không nên sao lưu" mà là "bản sao không được nằm cùng nhà với bản gốc". Ghi thẳng lên R2 thì
  chỗ chứa không còn là ổ tạm nữa, và không cần ai nhớ chạy lệnh gì.
  - **Bốn biến `R2_*` phải đủ cả bốn hoặc rỗng cả bốn.** Khai một nửa thì app **dừng**: "chạy một
    nửa" ở đây nghĩa là tin rằng mình có bản sao mà thật ra không.
  - **Tự ký S3 SigV4, không kéo AWS SDK về.** Ký sai thì R2 trả `403 SignatureDoesNotMatch` ngay
    lượt đầu, không có đường hỏng lặng lẽ; đổi lại là ~160 dòng thay cho một cây phụ thuộc.
  - **Dump rỗng thì KHÔNG được tải lên**, mà ghi là thất bại — vì một bản sao *trông như* thật
    nguy hiểm hơn không có bản sao nào.
  - **Trang Hôm nay kêu đỏ trong ba ca**: lượt gần nhất hỏng, bản mới nhất quá 2 ngày tuổi, hoặc
    bật rồi mà chưa chạy lần nào. Một lịch sao lưu tắt tiếng là một lịch sao lưu không tồn tại.
- **Đã đi trọn cả vòng, thật.** Object `mkttool/2026-08/mkttool-prod-20260806-125954.sql` (35 KB)
  nạp lại bằng `psql -f` với `ON_ERROR_STOP=1` vào một database rỗng: exit 0, **22 hàng trong 6
  bảng**, khớp từng con số với dòng log. Dump từ server 18 đổ vào Postgres 17 dưới máy dev vẫn nạp
  được. Hai chỗ vấp trong lượt đó: **giờ hẹn đã trôi qua trong ngày thì lịch bắn ngay lúc khởi
  động** (cơ chế bắt kịp lượt lỡ, cố ý — nên vừa khai đủ biến là có bản đầu tiên luôn), và **bản
  dump tải từ R2 về rơi vào gốc repo** chứ không vào `data/backups/`, phải thêm luật
  `mkttool*.sql` vào `.gitignore` trước khi nó lọt vào một commit.
- **`pg_dump` nay có trần 10 phút.** Trước đó `runPgDump` chỉ kết thúc khi tiến trình con đóng —
  tiến trình treo (mạng nội bộ đứt giữa chừng) thì Promise **không bao giờ giải quyết**, và lượt
  sao lưu đêm im lặng tuyệt đối: không log, không hàng nào ghi vào `ScheduledJobRun`, nhìn từ ngoài
  giống hệt "chưa tới giờ hẹn". Quá giờ thì `SIGTERM`, chờ 5 giây cho `pg_dump` kịp hủy truy vấn
  đang mở, rồi `SIGKILL`. 10 phút là trần rộng rãi chứ không phải ước lượng sát: bản dump thật hiện
  nay 35 KB, xong trong vài giây — trần này để phân biệt *chậm bất thường* với *không bao giờ xong*.
- **Cố ý KHÔNG tự xóa bản cũ trên R2.** Mỗi bản ~35 KB, tức 13 MB một năm, trong khi hạn miễn phí
  của R2 là 10 GB. Dọn dẹp không giải quyết vấn đề nào có thật, còn một lỗi trong logic dọn thì âm
  thầm xóa đúng thứ cả tính năng này sinh ra để giữ.
- **Hai chốt nhỏ, cùng một họ hỏng — cấu hình đúng dưới máy dev, sai trên máy chủ.**
  `prisma.config.ts` chưa được chép vào image nên bước pre-deploy không chạy được migration; và
  một lượt tick của bộ lịch từng **trộn giờ giả với giờ máy** — lỗi chỉ CI mới thấy, vì dưới máy
  dev hai đồng hồ đó tình cờ trùng nhau.

**Kiểm chứng:** `typecheck` + `lint` + **874 test xanh** (87 file) trên CI của `master`, và lượt
sao lưu R2 đã đi trọn cả năm dòng nghiệm thu ở
[deployment-guide.md](deployment-guide.md#lớp-tự-động-app-tự-đẩy-bản-sao-lên-r2-mỗi-đêm).

**Sao lưu ổ đĩa của Railway: đã quyết bỏ**, không phải để đó chờ làm. Nó đòi gói Pro $20/tháng mỗi
workspace, trong khi thứ nó thêm vào chỉ là ca *lỡ tay xóa / migration hỏng giữa hai lượt sao lưu
đêm* — bản sao của Railway nằm **cùng tài khoản với bản gốc**, tức không chống được ca tệ nhất, đúng
ca mà R2 đã phủ. Bù bằng nếp tay: **chạy `db:backup:remote` ngay trước mỗi lần deploy có đổi cấu
trúc database**, vì `prisma migrate deploy` không tự sao lưu.

Còn lại của GĐ5: thử domain với Facebook, và một lượt dò shadowban thật — lượt 09:00 ngày 06/08 ghi
đúng câu *"bỏ qua vì chưa có proxy quan sát viên"*, hành vi đúng nhưng chưa phải một lượt dò thật.

> **Cập nhật cuối ngày 06/08:** proxy quan sát viên **đã khai và đã kiểm sống** — `Observer1` (US),
> nút *Kiểm* lúc 15:31 trả về *"proxy sống, IP ra khác IP máy này"*. Vế thứ hai mới là vế đáng
> giá: proxy sống mà **không** đổi IP thì bộ dò đang nhìn Reddit bằng chính IP nhà, và kết luận
> trông vẫn hợp lý mà thật ra vô nghĩa — hỏng theo kiểu không ai phát hiện.
>
> **Chặn của "một lượt dò thật" vì thế đã đổi người:** không còn là proxy, mà là **nick Reddit
> trong kho trên máy chủ**. Không có nick thì lượt dò chạy xong và không kết luận được gì. Việc
> nhập nick nằm ở GĐ6 — tức todo cuối của GĐ5 không tự đóng được trong GĐ5.

---

## 06/08/2026 (chiều) — GĐ5: bộ dò tự chạy hằng ngày, và bản sao lưu kéo được về máy

Hai việc của GĐ5 mà không cần chờ tài khoản Railway. Cả hai đi **khác chốt ban đầu**, và cả hai
đổi vì cùng một lý do: chốt cũ dựng ra một cơ chế hỏng lặng lẽ.

- **Lịch dò shadowban nằm TRONG app, không dùng cron của hãng.** Khai
  `HEALTH_CHECK_DAILY_AT="09:00"` là máy chủ tự dò một lượt mỗi ngày; vắng biến đó là lịch tắt,
  và tắt là mặc định vì máy dev nào cũng trỏ vào một database thật. Cron của Railway bị loại vì
  nó chỉ nhận giờ **UTC**: giờ hẹn khi đó nằm ở hai nơi — `TEAM_TIMEZONE` trong app và một chuỗi
  `0 2 * * *` trong bảng điều khiển — nên đổi múi giờ team mà quên sửa chuỗi kia là dò sai giờ
  **mà không có gì báo**. Đúng họ hỏng với `pg_dump` lệch major và luật firewall WebRTC. Thêm hai
  lẽ: cron là cấu hình riêng của hãng, trong khi cả `Dockerfile` dựng ra để chạy được ở nhiều
  hãng bằng một file; và cron của Railway đòi một dịch vụ thứ hai, tức deploy thêm một bản ảnh
  4.86 GB để chạy mười phút mỗi ngày.
- **Hai thứ cron cho sẵn thì phải tự lo, và cả hai đều rẻ.** Chạy đúng một lần dù có nhiều bản
  app: một hàng `ScheduledJobRun` đòi quyền bằng `updateMany` có điều kiện `lastRunAt < mốc hẹn`
  — quyết trong một lệnh, không có khe giữa "kiểm" và "ghi", đúng nguyên tắc của `HealthCheckLock`.
  Không mất lượt khi khởi động lại: mốc nằm trong database chứ không trong bộ nhớ, nên deploy lúc
  09:05 **không** bắn lại lượt 09:00, còn app tắt cả buổi sáng thì bật lên chạy bù **đúng một**
  lượt dù lỡ mấy ngày.
- **Bỏ qua thì nói ra lý do, và không thử lại mỗi phút.** Hai cửa kiểm trước khi sinh tiến trình:
  đang có lượt bấm tay chạy dở, hoặc chưa có proxy quan sát viên nào bật. Phải kiểm *trước*, vì
  `stdio: "ignore"` nuốt sạch câu lỗi của một tiến trình chết ngay dòng đầu — sổ sẽ ghi "đã bắn"
  cho thứ chưa từng chạy. Bỏ qua rồi thì tới mai mới thử lại: thứ đang chặn cần một người sửa,
  còn lặp lại chỉ đẻ ra mười lăm tiếng log rác che mất dòng đáng đọc.
- **Lịch tắt không được phép im lặng.** Trang `/health` có khối *"Lịch dò hằng ngày"* nói giờ hẹn,
  lượt gần nhất lúc nào và lượt đó đã bắn hay bị bỏ qua vì gì. Khay cảnh báo vận hành thêm một
  mục: máy chủ production chưa khai biến thì nhắc ADMIN, khai sai dạng thì kêu **đỏ** — chứ không
  lặng lẽ coi như tắt, vì người gõ `9h00` vào đó đang tin là lịch đã bật.
- **`npm run db:backup:remote` hút bản sao từ máy chủ thật về máy quản trị**, đọc
  `PRODUCTION_DATABASE_URL` khai ở `.env` của máy mình. Ba chốt, cả ba chống cùng một kiểu hỏng —
  bản sao lưu *trông như* thật: tên file mang nguồn (`mkttool-prod-…`) để bản của máy dev không
  bị khôi phục nhầm lên máy chủ; thiếu biến thì **dừng**, không bao giờ lùi về `DATABASE_URL`; và
  mỗi lượt in ra **số hàng dữ liệu**, nói thẳng khi là 0 — `pg_dump` chạy trên database rỗng vẫn
  cho file `.sql` hợp lệ đủ cấu trúc bảng, mà bản sao lưu là thứ chỉ được kiểm chứng vào ngày
  muộn nhất có thể.
- **Máy chủ cố ý KHÔNG tự chạy `db:backup` hằng đêm**, dù bộ lịch đã có sẵn ngay trên. Trong
  container `data/backups/` là ổ **tạm**, mất sau mỗi lần deploy — một bản sao chết cùng lúc với
  thứ nó bảo vệ thì tệ hơn không có, vì nó trông như có. Nửa tự động là nút bật sao lưu ổ đĩa của
  Railway; nửa này kéo bản sao về nơi không mất theo máy chủ.

Còn lại của GĐ5 đều cần tài khoản: dựng dự án Railway, khai biến môi trường (và **xác nhận bằng
mắt là không có `VAULT_KEY_OPERATOR`**), thử domain với Facebook, và phép thử hai tiến trình thật
chạy song song.

---

## 06/08/2026 — GĐ4: cầu nối thành một chương trình chạy trên máy operator

GĐ3 để lại một trạng thái đã hẹn trước: máy chủ không còn mở được mật khẩu nick nào, và **cũng
chưa ai mở được** — ba việc (lấy mật khẩu/OTP, mở profile, tạo/sửa nick có bí mật mới) chờ một
chương trình chưa tồn tại. Hôm nay chương trình đó có mặt, và tải về được.

- **`relay/` — một chương trình riêng, không phải một phần của web app.** Nghe `127.0.0.1:47821`,
  CORS đúng một nguồn, mọi phản hồi mang số phiên bản. Nó **không có đường vào database**: tất cả
  những gì nó biết là thứ tấm vé mang xuống. Có test hình dạng mã nguồn chặn `relay/` import
  `prisma`, `next`, React, alias `@/` và cả lớp phân quyền — kiểu hỏng đó không làm test nào đỏ,
  chỉ làm `.exe` phồng lên và mọc một client database trên đúng chiếc máy mà cả kiến trúc dựng ra
  để không có nó.
- **Ba lối vào chạy thật.** Mật khẩu và OTP hiện ở tab do chính cầu nối phục vụ (chỗ **duy nhất**
  trong cả hệ mở được mật khẩu nick), vé nằm ở fragment nên không lên máy chủ nào; trang xóa vé
  khỏi thanh địa chỉ ngay khi mở và tự đóng sau 60 giây kèm nút *"Giữ mở"*. Mở profile đi qua
  MultiZen trên máy đó, giữ nguyên quy tắc đẩy proxy hỏng thì không mở. Form tạo/sửa nick bọc bí
  mật bằng khóa vùng operator **trước khi** gửi lên — đường này cố ý không cần vé: thứ đi vào là
  bí mật người dùng vừa tự gõ, bắt xin phép máy chủ để mã hóa chuỗi của chính mình chỉ thêm một
  vòng gọi mà không thêm lớp bảo vệ nào.
- **`.exe` 87.4 MB dựng bằng Node SEA, không phải bun** — đảo với kế hoạch. Phần khó của cầu nối
  là mật mã lạ (X25519 sealed box, Ed25519), và bộ test chứng minh nó đúng *trên Node 24*; SEA thì
  `.exe` chính là `node.exe` đã chạy bộ test đó. `npm run relay:verify` đo trên **chính file
  `.exe`**, 16/16: tiến trình test phát vé thật, `.exe` mở ra, so mật khẩu với chuỗi đã gửi. Phép
  kiểm rẻ hơn ("gọi `/health` thấy 200") vẫn xanh khi mật mã hỏng sau lúc gói, và triệu chứng đầu
  tiên sẽ là một operator đứng trước câu *"không mở được ruột vé"* vào ngày bàn giao.
- **Tải ở `/relay-download`, sau lớp đăng nhập.** Gói `.zip` 32.6 MB gồm `.exe` + bộ cài — đưa
  mỗi `.exe` là đưa một bộ cài chắc chắn hỏng vì `setup.bat` tìm hai file kia cạnh chính nó. Route
  stream chứ không đọc cả file vào bộ nhớ: 87 MB mỗi lượt tải đồng thời trên gói Railway nhỏ là
  tiến trình chết vì hết bộ nhớ, và triệu chứng sẽ là "web tự khởi động lại". Chạy `setup.bat` lần
  hai là **nâng cấp**: tắt bản cũ, chép bản mới, giữ nguyên `relay-config.json` — ghi đè file đó là
  xóa khóa vùng operator của máy, thứ không lấy lại được ở đâu.
- **Mã băm SHA-256 thay cho chữ ký số.** Chứng chỉ ký mã tốn vài trăm USD/năm, đòi pháp nhân và
  token phần cứng, để đổi lấy việc bỏ một màn hình SmartScreen mà mỗi người chỉ gặp một lần. Mã
  băm miễn phí và trả lời được câu *"file tôi đang cầm có đúng bản của team không"* — trang nói
  rõ luôn phần nó **không** làm được: mã nằm cùng máy chủ với file nên không chứng minh nguồn gốc.
- **Mã máy hiện ở `/relay-devices`, và dải "cầu nối bản cũ" ở chỗ có nút bấm.** Luồng cài đi hai
  chiều — khóa công khai đi lên, mã máy đi xuống — và chiều xuống trước nay không có đường nào.
  Dải cảnh báo kêu **cả khi cầu nối bị từ chối vé**: máy cũ tới mức vé bị chặn chính là máy cần
  nhắc nhất. Không có bộ tự cập nhật (QĐ 11), nên dải này là đường duy nhất nhắc được trước khi
  một tấm vé hỏng.
- **Ba lỗi Windows chỉ lộ ra khi chạy thật**, cả ba đã vá và ghi lại tại chỗ: `noopener` trong
  chuỗi features làm `window.open()` trả `null` — đúng giá trị của "popup bị chặn" — nên **mọi**
  cú bấm mật khẩu đều rơi vào nhánh báo chặn popup (qua được typecheck, lint và 770 test);
  cmd.exe dò file `.bat` theo vị trí **byte** nên tiếng Việt có dấu làm nó chạy nhầm nửa dòng
  lệnh; `WScript.Shell` ép mọi chuỗi về bảng mã ANSI nên shortcut tên tiếng Việt không lưu nổi.
- **Bỏ `relay/dist` khỏi ESLint.** ESLint không đọc `.gitignore`, nên từ lúc có thư mục build thì
  `npm run lint` chết ngay ở bước dựng cấu hình — cả lệnh hỏng chỉ vì có người vừa build.

**Kiểm chứng:** `typecheck` + `lint` + **787 test xanh**, `npm run relay:verify` 16/16 trên `.exe`,
bộ cài chạy trọn vòng từ `.zip` giải nén ra (kể cả đường nâng cấp).

> ✅ **Đã nghiệm thu trên máy Windows thứ hai.** Tiêu chí chính của GĐ4 đã hoàn thành. `.exe` chạy trơn tru trên một chiếc máy Windows sạch chưa cài Node, chứng minh runtime đã được đóng gói thành công. GĐ4 chính thức khép lại.

## 06/08/2026 — GĐ3 đóng: máy chủ không còn mở được một mật khẩu nick nào

Bốn việc cuối của GĐ3. Trước hôm nay, bộ phát vé đã chạy và có test hai đầu nhưng **chưa lối vào
nào gọi nó** — tức là toàn bộ việc chia hai vùng khóa chưa có tác dụng gì. Hôm nay ba lối vào
được nối vào, và lỗ mở từ GĐ2 (*"một phiên bị trộm vẫn đọc được mật khẩu nick"*) đóng lại.

- **Hai server action lấy bí mật nay phát vé, không giải mã.** `revealCredential` /
  `requestOtpCode` thành `requestCredentialTicket` / `requestOtpTicket` — đổi tên vì tên cũ nói
  dối về việc hàm làm. Máy chủ lấy **nguyên văn ciphertext trong database**, bọc lại cho đúng
  chiếc máy đang ngồi, ký tên, rồi đưa trình duyệt mang đi. Nó không đọc được thứ nó vừa phát.
  - **Bí mật đi qua tab của cầu nối, không qua trang web** (QĐ 3). Tab đó cùng nguồn với cầu nối
    nên không dính luật Local Network Access — lấy được mật khẩu kể cả trên máy chưa bấm "Cho
    phép". Vé nằm ở **fragment** của URL: fragment không được gửi lên máy chủ nào, không vào
    `Referer`, không nằm trong dòng log nào.
  - **`AuditLog` ghi lúc phát vé**, kèm tên máy nhận. Đó là mốc máy chủ tự biết; mốc "người dùng
    đã nhìn thấy mật khẩu" thì nó chỉ biết nếu tin lời trình duyệt khai.
  - **Hạn nhịp 10 vé bí mật mỗi phút cho mỗi người.** Không chặn người ngoài — hai lớp gác đã
    làm việc đó. Nó chặn **một phiên bị trộm**: không có hạn thì "rút sạch kho" là chuyện của vài
    giây, có hạn thì thành chuyện của nhiều phút, và nhiều phút là đủ để một người nhận ra tab
    của mình đang tự bấm nút.
- **Nút mở profile phát vé kèm cấu hình proxy dựng sẵn.** Máy chủ vẫn kiểm proxy còn sống trước
  (mật khẩu proxy thuộc vùng khóa của nó), rồi bỏ cấu hình đã dựng vào **ruột vé đã mã hóa** —
  mở devtools ra chỉ thấy chuỗi mã hóa, không thấy mật khẩu proxy. Việc đẩy proxy và mở trình
  duyệt chuyển sang cầu nối, vì MultiZen chỉ nghe `127.0.0.1` và từ GĐ5 thì `127.0.0.1` của máy
  chủ là một máy khác hẳn.
  - Nhật ký đổi từ `PROFILE_LAUNCHED` sang `PROFILE_LAUNCH_TICKET_ISSUED`: máy chủ không biết
    profile có mở được không, và ghi thứ nghe kể là làm hỏng chính cuốn nhật ký.
- **Form tạo/sửa nick mã hóa ba ô bí mật ở máy người dùng.** Mật khẩu đi từ ô nhập xuống
  `127.0.0.1` rồi dừng ở đó; thứ gửi lên máy chủ là ciphertext. Máy chủ mất phép kiểm "TOTP
  secret có phải base32 không" (nó không đọc nổi nữa) — phép kiểm đó chuyển sang cầu nối. Thứ
  máy chủ **còn** kiểm được là hình dạng ciphertext, và nó kiểm: một form hỏng gửi mật khẩu trần
  lên bị từ chối ngay, thay vì ghi vào database rồi chỉ lộ ra vào ngày ai đó mở bản sao lưu.
  - Ba ô bí mật **bị khóa cho tới khi JavaScript sẵn sàng**. Không có nó thì người gõ nhanh rồi
    Enter trước lúc trang hydrate xong sẽ để trình duyệt gửi form theo cách mặc định — mật khẩu
    dạng trần bay thẳng lên máy chủ, im lặng.
- **Câu từ chối quyền nay tới được người dùng.** `guardedAction` bọc cả **thân hàm**, nên
  `AuthorizationError` mà `requireNickOwner` ném ra thành `ActionResult` ở mọi lối vào cùng lúc.
  Trước đó OPERATOR bấm nhầm nick của đồng nghiệp chỉ thấy một nút chết lặng: chặn vẫn đúng, chỉ
  có lời giải thích là mất.
- **`encryptCredential` / `decryptCredential` bỏ khóa mặc định.** Quên tham số khóa ở một cột
  vùng operator thì trước đây **không có gì hỏng** — chuỗi vẫn mã hóa, hàng vẫn ghi, không test
  nào đỏ — và chỉ lộ ra vào ngày chạy `vault:rekey --domain=operator`, lúc cột ghi nhầm đã thành
  rác. Nay khai rõ ở cả 20 chỗ gọi, và vùng khóa của một cột hiện ngay tại chỗ đọc mã.
- **Lượt grep nghiệm thu thành một bài test thường trực.** Kế hoạch ghi việc cuối là *"kiểm bằng
  grep"*; grep chứng minh được hôm nay và chỉ hôm nay. Ngày mai ai đó thêm một tính năng "xuất
  danh sách nick kèm mật khẩu" là ranh giới mất, mọi test khác vẫn xanh. Cùng lối với phép cấm
  giờ máy và phép kiểm gác lối vào: kiểu hỏng nào không làm test nào đỏ thì phải có một phép kiểm
  hình dạng mã nguồn nhắm thẳng vào nó.

> ⚠️ **Tới khi GĐ4 xong, ba việc cần cầu nối mới làm được**: lấy mật khẩu/OTP, mở profile, và
> tạo/sửa nick *có nhập bí mật mới*. Đây là trạng thái đã hẹn trước của QĐ 8 (làm hết rồi bàn
> giao một lần), không phải hồi quy ngoài ý muốn — chưa ai ngoài tác giả dùng công cụ. Sửa karma,
> trạng thái hay proxy của nick vẫn chạy bình thường: ba ô bí mật để trống nghĩa là giữ nguyên,
> và form không gọi xuống `127.0.0.1` khi không có gì để bọc.

### Khay cảnh báo vận hành — "kho có thật sự đang tách hai vùng khóa không?"

Việc cuối của GĐ3, và là thứ làm cho mọi việc phía trên **kiểm chứng được từ trong app** thay vì
phải đi đọc file `.env` của máy chủ.

- **Một vùng cố định dưới thanh đầu trang, có mặt ở mọi trang, mỗi vấn đề một dòng với việc phải
  làm riêng.** Không nằm ở trang Hôm nay như bảy dải cảnh báo cũ: những dải đó nói về **dữ liệu**
  (proxy chết, token sắp hết hạn) và xử lý xong thì tắt, còn khay này nói về **cấu hình hệ thống
  đang sai** — thứ khiến cả một tính năng mất tác dụng trong khi mọi màn hình vẫn trông bình
  thường. Người dùng không có lý do gì phải ghé trang Hôm nay trước khi làm việc.
- **Hai mục, không phải một.** *Hai vùng chung một khóa* là **đỏ**: một phiên bị trộm vẫn đọc
  được mật khẩu nick, tức toàn bộ GĐ3 đang không có tác dụng gì — mà cấu hình thì nhìn y hệt lúc
  đã tách xong. *Máy chủ vẫn giữ `VAULT_KEY_OPERATOR`* là **vàng**: khóa đã tách thật, nhưng bản
  sao vẫn nằm trên máy chủ, và trạng thái này trước nay **không có tiếng nói nào** — kể cả
  `console.warn` cũng không nói.
- **Thiếu `VAULT_KEY_SERVER` cố ý không vào khay.** Chỗ đó đã hỏng ồn ào bằng lỗi ngay lần mã hóa
  đầu tiên. Vẽ thêm một dòng cho thứ đã kêu to là dạy người ta lướt qua khay.
- **Lọc theo ai sửa được, không theo ai quan tâm.** OPERATOR không đổi được biến môi trường của
  máy chủ, nên đưa họ một dòng đỏ vĩnh viễn chỉ dạy họ phớt lờ — và thói quen đó dính sang cả
  những mục họ sửa được. Cảnh báo *"cầu nối bản cũ"* của GĐ4 đi hướng ngược lại (người ngồi máy
  đó tự tải lại `.exe`) nên nó sẽ hiện cho tất cả.
- **Dòng `console.warn` cũ giữ lại**, nhưng nay cả hai đọc chung một hàm: nó phục vụ lúc chạy
  dưới máy mình, còn đường tới người dùng thật là khay. Trên Railway (GĐ5) `console.warn` in một
  lần lúc khởi động rồi trôi — không ai đọc.

**Kiểm chứng:** `typecheck` + `lint` + **678 test xanh** (thêm 10 test cho khay, gồm ca "cùng một
khóa dán hai chỗ viết hoa/thường khác nhau" — bỏ sót ca đó là bỏ sót đúng lúc cảnh báo cần kêu
nhất).

## 05/08/2026 (tối) — Chỗ chạy thật: Dockerfile, khóa vào database, ba lỗi chỉ Docker mới thấy

Việc của GĐ5, chạy song song với GĐ3. Ba thay đổi dưới đây có chung một chủ đề: **thứ đúng khi
app chạy trên đúng một máy thì sai khi nó chạy ở nhiều nơi.**

- **Khóa chống hai lượt dò sức khỏe chạy chồng chuyển từ file vào database.** File
  `data/health-check.lock` chặn được đúng hai tiến trình trên **cùng một máy**. Từ GĐ5 điều kiện
  đó không còn: cron trên Railway, nút "Dò cả đàn" trong web app, và dev gõ `npm run health` ở máy
  mình — ba nơi, ba hệ thống tệp, không nơi nào thấy file của nơi kia. Khóa im lặng mất tác dụng
  đúng lúc bắt đầu cần tới nó.
  - **Đi khác chốt ban đầu của plan** (advisory lock Postgres), vì advisory lock **hỏng mở**: nó
    gắn theo session, Prisma dùng connection pool, và giữ một connection riêng suốt mười phút trên
    Railway thì lớp proxy cắt lúc nào không biết. Connection chết là Postgres tự nhả khóa cho lượt
    thứ hai chen vào — đúng thứ khóa sinh ra để chặn, mà lại hỏng lặng lẽ. Một hàng trong bảng thì
    hỏng ngược lại: tiến trình chết thì hàng ở lại và ai đó chờ tối đa 30 phút.
  - Advisory lock cũng **không mang được dữ liệu**, mà giao diện cần biết "ai đang giữ, giữ bao lâu
    rồi" — nên vẫn phải có một hàng ở đâu đó. Hai cơ chế cho một khái niệm thì sớm muộn cũng lệch.
  - `release()` xóa theo token nên chỉ xóa khóa của chính mình, và quyết trong một lệnh. Bản khóa
    file phải đọc rồi so rồi mới xóa — ba bước, có khe cho người khác giành khóa rồi bị ta xóa mất.
  - Thông báo "đang chạy" nay kèm **tên máy**: khóa bắc qua nhiều nơi rồi thì "tiến trình 4821" một
    mình không nói được gì. Cron máy chủ, người khác bấm nút, hay chính terminal của mình là ba
    việc phải xử lý khác nhau.
- **`Dockerfile` thay cho cấu hình riêng của Railway** (QĐ 9) — cùng file này chạy được ở Render,
  Fly hay một VPS. Khóa vào một hãng là thứ chỉ phát hiện ra vào đúng ngày muốn rời hãng đó.
  - Kèm **một lỗi có thật, không liên quan gì tới Docker**: `playwright`, `tsx` và `prisma` chuyển
    từ `devDependencies` sang `dependencies`. Chúng cần lúc **chạy**, không phải chỉ lúc build —
    lượt dò sinh tiến trình bằng `tsx scripts/run-health-check.ts`, và tiến trình đó gọi
    `chromium.launch()`. Ai cài bằng `npm ci --omit=dev`, tức cách cài production tiêu chuẩn, đều
    nhận một app mà nút "Dò cả đàn" sinh ra tiến trình chết ngay dòng đầu — và `stdio: "ignore"`
    nuốt sạch câu lỗi, nên nhìn như *"đã bấm rồi mà không có gì xảy ra"*.
  - Dựng trên ảnh Playwright chính chủ, ghim theo `package.json`. Tự cài trên ảnh trần thì lệ thuộc
    một danh sách gói apt đổi theo từng bản Debian — hỏng vào ngày nâng cấp, không hỏng lúc viết.
  - **Không** dùng `output: "standalone"`: nó chỉ gói những gì Next truy vết được từ đồ thị import,
    mà tiến trình dò sinh bằng `spawn` nên không nằm trong đồ thị đó. Ảnh phải mang theo `src/`,
    `scripts/` và `tsx`. Ảnh to hơn là cái giá đã biết của quyết định "lượt dò chạy ở tiến trình riêng".
  - `TEAM_TIMEZONE` là `ARG` lúc build chứ không phải biến lúc chạy, vì `next.config.ts` nhúng nó
    thẳng vào bundle cho ô chọn giờ phía client. **Đổi múi giờ team thì phải build lại.**
- **Prisma client dựng trễ — và ba lỗi mà 601 test, `typecheck` lẫn `lint` đều không thấy**, vì cả
  ba đều chạy trong môi trường **có `.env`, trên Windows**. Lần build ảnh đầu tiên làm lộ hết.
  1. **App không build được nếu thiếu `DATABASE_URL`.** `prisma-client.ts` dựng client ngay ở thân
     module, nên chỉ cần *import* là đã đòi biến. `next build` phải nạp mọi route để đọc cấu hình
     đoạn, mà `layout.tsx` → `SessionBadge` → `require-actor` → file đó, nên build dừng ở
     `/_not-found`. Máy dev không thấy vì `next build` tự nạp `.env`; ảnh Docker **cố ý không có**
     file đó — khóa kho danh tính không đi vào ảnh. Sửa theo đúng lối `getAuth()` đã đặt sẵn cho
     Better Auth, dùng `Proxy` nên không phải sửa hơn trăm chỗ gọi và không sinh ra hai cách lấy
     client cùng tồn tại. Gỡ kèm một tác dụng phụ âm thầm: trước đây chỉ nạp module là mở sẵn một
     connection pool, kể cả trong test không hỏi database câu nào.
  2. **`RUN chown -R pwuser /app` một mình nó nặng 998 MB.** `chown` đụng metadata mọi file nên
     Docker coi cả cây là đã đổi và chép lại nguyên `/app` thành một tầng nữa. Thay bằng
     `COPY --chown` và đổi user trước khi chép: **6.6 GB → 4.86 GB**.
  3. **`pg_dump` của Ubuntu Noble là bản 16, mà server là 17.** `pg_dump` **từ chối** dump từ server
     có major cao hơn nó — bản mặc định trông như cài xong nhưng hỏng đúng ngày cần sao lưu, và
     nặng hơn thế: `vault:rekey` tự sao lưu trước khi ghi, nó sẽ dừng ngay ở bước đó. Chuyển sang
     kho PGDG lấy `postgresql-client-17`. *Nâng Postgres lên 18 thì phải sửa `ARG PG_CLIENT_MAJOR`
     trước, nếu không mọi bản sao lưu im lặng ngừng chạy.*

> **Ảnh đã nghiệm thu chạy thật trong container**, không chỉ kiểm file có tồn tại: chạy bằng
> `pwuser`, có `tsx`, Prisma CLI, `pg_dump` 17.10, `scripts/` và `src/` đủ, và Chromium mở được thật.

---

## 05/08/2026 — Kho tách làm hai vùng khóa, và máy chủ có chữ ký

GĐ3 đang chạy (7/11 việc). Đích của cả giai đoạn: **chiếm được máy chủ không mở được một mật
khẩu nick nào**. Đợt này đặt xong phần nền, chưa tới đích — máy chủ vẫn còn giữ khóa vùng
operator, xem ghi chú cuối mục.

- **`VAULT_KEY` tách thành `VAULT_KEY_SERVER` và `VAULT_KEY_OPERATOR`** — **đổi vỡ tương thích,
  phải sửa `.env` trước khi chạy.** Vùng server giữ mật khẩu proxy và token Facebook (máy chủ cần
  chúng để kiểm proxy sống và gọi Graph API); vùng operator giữ mật khẩu, email, TOTP của nick.
  `loadVaultKey` bắt buộc nói rõ vùng và **không đọc lùi** về `VAULT_KEY` cũ: im lặng chạy tiếp
  bằng khóa cũ là kiểu hỏng chỉ lộ ra đúng lúc cần mở mật khẩu. Đang nâng cấp từ bản một khóa thì
  đặt cả hai biến bằng giá trị cũ, và bộ nạp khóa **cảnh báo khi hai vùng còn trùng nhau** —
  trạng thái đúng lúc chuyển đổi nhưng nhìn y hệt lúc đã tách xong, nên phải nói ra.
- **Vùng của từng cột khai ngay cạnh cột trong `schema.prisma`** (`vault:server` / `vault:operator`),
  và test đọc thẳng schema nên khai lệch hoặc **khai thiếu** đều đỏ. Đặt dấu cạnh cột chứ không
  chỉ trong registry vì người thêm cột mới nhìn thấy nó lúc đang gõ.
- **`vault:rekey` nay bắt buộc `--domain=server|operator`** và xoay đúng một vùng. Chính lệnh này
  là đường tách hai vùng lần đầu. Nguyên tắc cũ giữ nguyên: giải mã sạch toàn bộ trước khi ghi.
- **`vault:smoke` thêm phép thử "khóa vùng server KHÔNG mở được mật khẩu nick"**, và **báo FAIL
  khi hai khóa còn trùng** thay vì báo PASS cho thứ chưa kiểm được. Đã xanh trên DB thật.
- **Cặp khóa ký vé Ed25519 của máy chủ** (`TICKET_SIGNING_KEY`). Chỉ một biến — hạt giống khóa
  riêng; khóa công khai suy ra từ nó chứ không khai riêng, vì hai biến rời nhau là mở đường cho
  một cặp lệch, mà cặp lệch thì mọi vé bị từ chối và không nhìn vào đâu để biết vì sao. Test đối
  chiếu **vector chuẩn RFC 8032 mục 7.1**, không phải ký-rồi-tự-kiểm: tự kiểm chỉ chứng minh
  module nhất quán với chính nó, còn cầu nối ở GĐ4 sẽ được viết độc lập.
- **`npm run keys:server-pubkey`** in lại khóa công khai của khóa đang dùng. `keys:server-keygen`
  sinh cặp *mới* mỗi lần chạy, nên trước đó không có đường nào tra khóa công khai hiện hành —
  trong khi mỗi lần cài cầu nối lên một máy mới lại cần đúng thứ đó.
- **Sổ đăng ký máy chạy cầu nối** — model `RelayDevice` + màn hình `/relay-devices`. Mỗi máy khai
  một khóa công khai **X25519** (không phải Ed25519: máy chủ *ký*, máy *nhận đồ mã hóa gửi tới* —
  hai việc ngược chiều, hai họ khóa). Máy chủ bọc nội dung vé bằng khóa của đúng máy nhận, nên
  trình duyệt chỉ là người đưa thư. ADMIN đăng ký / thu hồi; cả team đọc được sổ, đúng nguyên tắc
  đã theo từ đợt trước: chia **quyền làm**, không chia **tầm nhìn**.
  - Đúng 64 ký tự hex **chưa đủ** để nhận một khóa: có một nhóm điểm bậc thấp cho ra bí mật chung
    toàn số 0 với *mọi* khóa đối diện — tức ai nhặt được vé cũng mở ra được. Màn hình đăng ký thử
    trao khóa một lần với cặp tạm để chặn cả nhóm, thay vì chép bảng điểm xấu vào mã rồi mong nó
    đủ. Test đối chiếu **vector chuẩn RFC 7748 mục 6.1**, cùng lý lẽ với vector RFC 8032 ở trên.
  - Khóa chuẩn hóa về hex chữ thường trước khi ghi. Không chuẩn hóa thì cùng một chiếc máy dán
    lại bằng chữ hoa sẽ lọt qua `@unique` thành hàng thứ hai, và người thu hồi hàng thứ nhất tưởng
    đã chặn xong.
  - **Thu hồi là một chiều và giữ nguyên hàng trong sổ.** Khóa của máy đã mất coi như đã lộ; cho
    đăng ký lại đúng khóa đó là xóa sạch ý nghĩa của lần thu hồi. Giữ hàng lại thì `@unique` còn
    chặn được, và câu *"bị chặn từ lúc nào"* còn chỗ trả lời.
  - **Ranh giới phải nhớ:** thu hồi chặn **vé mới**, không với tới ciphertext chiếc máy đó đã lấy
    về từ trước. Mất máy thì vẫn phải xoay `VAULT_KEY_OPERATOR` — câu thông báo sau khi bấm nút
    nói thẳng điều đó, và có test canh.
- **`npm run keys:relay-keygen`** sinh cặp khóa X25519 cho một máy. Chạy **trên chính máy đó**:
  khóa riêng ở lại, chỉ khóa công khai đi ra. Tới GĐ4 cầu nối tự sinh khóa lúc cài và lệnh này
  thành đường dự phòng.
- **Bộ phát và xác minh vé** (`src/lib/tickets/`). Máy chủ bọc ruột vé cho riêng máy nhận — cặp
  khóa **dùng một lần cho mỗi tấm vé**, X25519 → HKDF → AES-256-GCM — rồi ký Ed25519 phủ lên cả
  bao ngoài lẫn ruột đã bọc. Vé sống 30 giây, tiêu được đúng một lần.
  - **Bọc trước, ký sau**, nên cầu nối xác minh chữ ký *trước khi* giải mã bất cứ thứ gì. Làm
    ngược lại thì chữ ký nằm trong lớp mã hóa, và cách duy nhất để biết vé có thật hay không là
    cứ giải mã đã.
  - **Ký lên chuỗi, không ký lên object.** Cầu nối GĐ4 là chương trình viết độc lập, và
    `JSON.stringify` của hai chương trình có thể xếp khóa khác thứ tự. Cả hai đầu ký/xác minh
    trên đúng chuỗi base64url truyền đi, không bên nào tuần tự hóa lại — cùng lý do JWS làm vậy.
  - **Cặp khóa dùng một lần**, không phải cặp cố định của máy chủ: cặp cố định thì mọi vé gửi
    tới cùng một máy dùng chung một khóa AES, lộ một lần là lộ cả lịch sử. Bí mật chung đi qua
    HKDF chứ không dùng thẳng — đầu ra X25519 là tọa độ một điểm, không phải khóa phân bố đều.
  - **Chống dùng lại nằm ở cầu nối**, là hệ quả của QĐ 5 chứ không phải lựa chọn: cầu nối không
    nối mạng nên không hỏi máy chủ được, và máy chủ cũng không biết vì nó phát vé rồi thôi.
  - Thứ tự kiểm là một phần của thiết kế: chữ ký → **hai số phiên bản** → hạn → đúng máy → chưa
    tiêu → mới giải mã. Đặt phiên bản ngay sau chữ ký để cầu nối cũ luôn nhận được *"bản quá cũ,
    tải lại"* (QĐ 11) thay vì một lỗi giải mã mơ hồ.
  - **Chưa lối vào nào gọi module này** — nối vào nút bấm là ba việc còn lại của GĐ3.
- **Ghi đè bí mật nick nay phải là chủ nick** — đối xứng với `revealCredential`, vốn đã gác từ
  GĐ2. Không gác thì trạng thái là *"tôi không đọc được mật khẩu nick của bạn, nhưng tôi ghi đè
  được nó"*. Chỉ gác khi form **thật sự mang bí mật lên**: sửa karma / trạng thái / proxy cho nick
  của đồng nghiệp vẫn mở, vì đó là việc chung hằng ngày và một phép kiểm cản việc thật thì sẽ bị
  gỡ chứ không được sửa.
  - Chuyện `status` bị kéo từ `SHADOWBANNED` về `HEALTHY` **cố ý không giải bằng phân quyền**:
    chủ nick cũng ép được, nên phép kiểm chủ sở hữu không nhắm đúng chỗ. Thay vào đó
    `ACCOUNT_UPDATED` nay ghi cả chiều đổi, khớp với `HEALTH_STATUS_FORCED` mà đường còn lại đã
    ghi từ lâu — hai đường tới cùng một hậu quả thì nhật ký phải đọc được như nhau.
- **`AuditLog.action` gom về `lib/audit/audit-log-actions.ts`.** 15 chuỗi literal rải 9 file; gõ
  sai một chữ thì hàng vẫn ghi và không test nào đỏ, chỉ có câu truy vấn đi tìm nó sau này là
  hụt mất hàng — im lặng, và đúng vào ngày cần nhật ký nhất.

> **Chưa đóng ở đợt này:** máy chủ vẫn giữ `VAULT_KEY_OPERATOR`, vì bốn chỗ còn cần nó — tạo nick,
> sửa nick, xem mật khẩu, sinh OTP. Chỉ gỡ được sau khi bốn chỗ đó chuyển sang phát vé. Nghiệm thu
> cuối GĐ3 là gỡ hẳn biến đó khỏi máy chủ mà app vẫn chạy đủ mọi chức năng.

---

## 05/08/2026 — Đăng nhập Google, phân quyền, và bỏ cờ `-H`

Hàng rào chuyển từ **chỗ app lắng nghe** sang **đăng nhập**. Hai thứ này phải đổi trong cùng một
đợt: bỏ cờ `-H` trước khi gác xong là biến kho danh tính thành trang web công khai.

- **Route `/api/auth/[...all]` + màn hình `/login`.** Một nút Google, không có ô nhập, không có
  tự đăng ký — Google chỉ chứng minh *"người này sở hữu email đó"*, không chứng minh *"người này
  thuộc team"*. Thanh trạng thái ở đầu trang hiện email + vai trò và có nút đăng xuất.
- **`GOOGLE_CLIENT_SECRET` sai giờ có câu tiếng Việt.** Đó là thứ duy nhất `npm run auth:check`
  không kiểm được (lệnh đó không bao giờ gửi secret đi đâu), và nó chỉ lộ ra ở nhịp đổi code lấy
  token. Better Auth trả về mã `invalid_code`; `sign-in-error-messages.ts` dịch mã đó thành
  đúng câu "vào Credentials lấy lại Client secret".
- **Email ngoài danh sách trắng bị từ chối tử tế**, và thông báo nêu đúng email vừa bị từ chối
  (ca gặp nhiều nhất: gõ nhầm một chữ, hoặc trình duyệt tự chọn tài khoản Google khác). Hai
  ràng buộc, cả hai đều phải sai một lần mới tìm ra, và cả hai chỉ lộ khi bấm thử chứ không lộ
  khi đọc code:
  1. Phải ném `APIError` chứ không phải `Error` thường — `handleOAuthUserInfo` nuốt lỗi thường
     và trả về đúng chuỗi `"unable to create user"`.
  2. Thông điệp của `APIError` **không đi vào chỗ hiển thị mà đi vào chỗ mã lỗi**: `callback.mjs`
     làm `result.error.split(" ").join("_")` rồi gắn vào `?error=`. Viết cả câu tiếng Việt vào
     đó thì người dùng nhận nguyên câu với mọi dấu cách thành gạch dưới, cụt đuôi ở rìa màn
     hình. Nên tầng dưới chỉ gửi mã `EMAIL_NOT_ALLOWED:<email>` (không dấu cách nên đi qua
     nguyên vẹn), còn câu tiếng Việt nằm ở `sign-in-error-messages.ts`.
- **Gác nốt 18 lối vào còn lại — `NOT_YET_GUARDED` về rỗng.** 30 server action và 5 route
  handler. Gác nằm ở chữ ký định nghĩa (`export const x = guardedAction(...)`) chứ không phải
  một dòng trong thân hàm: dòng đó quên được và lách được (nằm trong nhánh `if`), và không phép
  kiểm tự động nào phân biệt nổi "gọi luôn" với "gọi khi biến X đúng".
- **Phép kiểm hàng đợi đổi nghĩa.** Trước đây nó kiểm từng dòng trong `NOT_YET_GUARDED` có
  trung thực không; giờ nó đòi danh sách **rỗng**. Từ lúc bỏ cờ `-H`, mỗi dòng ở đó là một
  endpoint công khai — không còn tồn tại thứ gọi là "tạm thời chưa gác", và khai tên vào danh
  sách không còn là đường thoát khi test báo đỏ.
- **`AuditLog` ghi được ai làm.** `actorId` đính ở mọi đường: mở profile, lộ credential, ghi đè
  luật, đăng Fanpage, sửa nick, phân công nick.
- **Phân công nick (chỉ ADMIN).** Chủ nick quyết định đúng một thứ: ai lấy được mật khẩu và OTP
  của nick đó. Danh sách người nhận chỉ gồm người **đã đăng nhập ít nhất một lần** — khai email
  vào `ALLOWED_EMAILS` thôi thì chưa đủ, và màn hình nói thẳng điều đó thay vì hiện ô rỗng.
- **Truy vấn bộ luật vẫn quét toàn bộ đàn nick** — có test riêng canh
  ([rule-queries-ignore-owner.database.test.ts](../src/lib/rules/rule-queries-ignore-owner.database.test.ts)),
  seed hai chủ khác nhau rồi hỏi ba truy vấn nhạy cảm với quyền sở hữu. Lọc theo chủ sở hữu là
  làm luật 8 mù đúng ca nó sinh ra để bắt: hai nick cùng nhà đụng một thread, mà hai nick cùng
  nhà thì thường do hai người khác nhau cầm. Kiểu hỏng đó không đỏ ở màn hình nào.
- **Gác cả trang, không chỉ hành động** (`src/proxy.ts`). Bắt được lúc nghiệm thu: đăng xuất
  xong vẫn duyệt app bình thường. `guardedAction`/`guardedRoute` gác đường **làm**, nhưng trang
  trong `app/` là server component tự gọi thẳng Prisma rồi trả HTML — không đi qua wrapper nào.
  Gác đủ 35 lối vào mà quên trang, lại vừa bỏ cờ `-H`, thành ra cả lớp mạng đọc được username
  nick, email gốc và host/port/username của proxy. Tên file phải là `proxy.ts` — Next 16 bỏ
  `middleware.ts`, và cùng với đổi tên là đổi mặc định: proxy **luôn** chạy Node runtime, nên
  không phải khai `runtime: "nodejs"` nữa (khai lại là lỗi build). Đó là điều kiện sống của lớp
  này: ở edge, Prisma không nạp được, và vì nó chết ở tầng chặn nên **mọi trang thành 500**.
- **Bỏ `-H 127.0.0.1` khỏi `dev` và `start`** — bước cuối cùng, chỉ làm sau khi danh sách chưa
  gác về rỗng.
- **Tắt `agentRules`** trong `next.config.ts`. Next 16 tự sinh `AGENTS.md` và `CLAUDE.md` ở gốc
  kho mỗi lần chạy dev; dự án đã có `README.md` và `docs/` nên hai file đó chỉ là nguồn sự thật
  thứ hai, không ai viết và tự ghi đè sau mỗi lần nâng cấp Next. Tắt ở nguồn chứ không
  `.gitignore` — bỏ qua trong git thì chúng vẫn mọc lại trong thư mục làm việc.
- **CI sống lại sau 10 lượt đỏ liên tiếp.** Nó đứt từ PR #2 — đúng PR chuyển nền dữ liệu sang
  Postgres — vì workflow vẫn cấp `DATABASE_URL: file:./ci.db` trong khi bộ test đã đòi một
  Postgres thật. Master cũng đỏ suốt từ đó. Sửa bằng service container `postgres:17` kèm health
  check, **không** bằng cách bỏ qua các test chạm database: chúng là thứ duy nhất chứng minh
  truy vấn *lọc đúng*, mà lọc sai là kiểu hỏng nguy hiểm nhất ở đây. Thêm `prisma migrate deploy`
  — đúng lệnh sẽ chạy lúc phát hành ở GĐ5, và là đường khác với cách global setup áp SQL bằng
  tay, nên nó bắt được migration mà Prisma CLI từ chối.
- **Bài học đắt hơn cả bản vá:** vì `npm test` đứng trước và đỏ, bước `npm run build` **10 lượt
  liền chưa hề chạy tới**. Nó vừa chạy lại là bắt ngay một lỗi thật đã đi lọt qua cả buổi nghiệm
  thu tay (`runtime` thừa trong `proxy.ts`) — `next dev` không kiểm phần đó. Một CI đỏ triền miên
  không phải phiền toái nhỏ: nó **giấu** những gì các bước sau lẽ ra đã bắt.

Chưa đóng ở đợt này: một phiên bị trộm vẫn đọc được mật khẩu nick (hai vùng khóa tách ở GĐ3).
