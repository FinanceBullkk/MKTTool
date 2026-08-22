# Project changelog

Records behavior-changing milestones by date and delivery phase. Internal cleanup is omitted.
Current delivery status lives in [development-roadmap.md](development-roadmap.md).

The product is still an internal `0.1.0`; milestones are grouped by delivery phase rather than
semantic versions.

Older entries move to archives when the live file approaches the 800-line documentation limit:

- [7 to 11 August 2026](archive/project-changelog-07-to-11-august-2026.md)
- [5 to 6 August 2026](archive/project-changelog-05-to-06-august-2026.md)
- [Through 4 August 2026](archive/project-changelog-den-04-08-2026.md)

Historical entry prose remains unchanged. Only relative link destinations change when required by
the archive location.

---

## 22 August 2026 - Vulnerable packaged ZIP extraction is removed

MKT Browser no longer ships the vulnerable direct runtime dependency `extract-zip@2.0.1`. Engine
ZIPs and verified CRX/ZIP extensions now use one owned fail-closed extraction boundary built on
pinned `yauzl@3.4.0`. It rejects traversal and absolute paths, Windows device names, links and
special entries, case-folded collisions, excessive entry/file/archive sizes, extreme compression,
truncation, and CRC mismatch; failed extraction removes staging and never publishes partial state.

The Windows CI workflow now runs a production-only high-severity dependency audit. The packaged
runtime verifier inspects `resources/app.asar` and its `package.json`, requiring `yauzl@3.4.0` and
rejecting direct `extract-zip` metadata or files. Local Node 22 verification passed the production
audit, typecheck, zero-warning lint, MKB-02, MKB-03, the complete installer suite, the Windows
directory build, and packaged runtime/profile lifecycle. The rebuilt unsigned `0.3.12` executable is
221,933,568 bytes with SHA-256
`6a3809d6ec83ad4f01459821b3de7cb0072483f42d67520dee8e729bdd2d2c69`.

This closes release-readiness Phase 1 only. Packaged-CI determinism, merge enforcement, signing,
real Windows/network/recovery proof, and the seven-day canary remain open, so rollout stays NO-GO.

## 22 August 2026 - P0 browser and proxy technical hardening is green; rollout remains NO-GO

MKT Browser now refuses a proxied launch when its egress probe is unavailable, empty, or malformed.
The disposable correct-proxy smoke follows the signed MKTTool ticket and Relay handler path, waits
for the local Browser listener, and does not open page-control, cookie, or raw-CDP tools.

The licensed-engine recovery foundation now has a crash-safe versioned journal, last-committed
recovery, strict transition/schema checks, serialized concurrent writes, and deterministic recovery
fixtures. Full keys never enter the journal or runtime capacity response; short keys are masked too.
Aggregate capacity excludes pending recovery and cooling seats from free capacity.

Relay and the Web UI now use current Browser profile inventory and allowlisted stable failure codes.
Launch is blocked when local profile state is unknown, running filters/counts reflect actual Browser
profile IDs, stale polling cannot overwrite a successful launch, and operator messages no longer
expose capability IDs, contract internals, engine details, paths, ports, proxy endpoints, or local
exception text. The Browser renderer also closes three React lifecycle warnings, including an
autosave cleanup that could use the prior profile's managed-state boundary.

`license-capacity-v1` remains deliberately unadvertised. The vendor session protocol has not been
captured with owner-controlled disposable keys, so the journal and recovery state machine are not
yet wired into a sidecar or the Chromium driver lifecycle. Advertising capacity now could claim a
seat is free while the vendor still holds it.

Automated evidence is green: MKTTool passes 207 files / 1,903 tests, typecheck, lint, and production
build; MKT Browser passes typecheck and zero-warning lint, the full automated installer suite,
desktop build, and packaged runtime/profile-lifecycle verification under Node 22. Real proxy/DNS/
WebRTC proof, human login/input, live lease recovery, second-PC setup, crash/reboot evidence, and the
seven-day canary remain required before rollout.

## 20 August 2026 - Licensed engine lifecycle and DNS hardening reach desktop 0.3.12

MKT Browser now treats licence capacity as one concurrent engine session per configured key. It can
rotate away from a key refused with exit 76, records which profile holds each local key, and reports
licence refusal as an operator action rather than disguising it as a Chromium crash. Startup closes
orphaned profile browsers it owns, while a detached engine process can survive an Electron crash long
enough for deterministic recovery instead of consuming a seat invisibly.

DNS and network-privacy switches now apply consistently to every profile and have a dedicated
regression test after two fixes moved them accidentally. These changes shipped in desktop package
version `0.3.12`, but they did not make local key-pool state vendor-authoritative; that is why the
later P0 checkpoint still withholds `license-capacity-v1`.

## 19 August 2026 - TikTok becomes an identity scope and the console is reskinned around profiles

The account domain now accepts `TIKTOK`, requires its static proxy, applies the browser-backed
readiness boundary, and supports managed profile creation and manual launch. The console gained the
dark profile grid/table shell, a TikTok creation sheet, bulk proxy entry, and a setup stepper. A
server-side regression covers the full TikTok create action after the first UI attempt failed because
the form enum and server schema did not agree.

This was a deliberate UI and identity rescope, not a TikTok publishing launch. TikTok remains absent
from `TARGET_PLATFORMS`; content, queue, posting rules, warmup, and publishing code are parked. The
legacy Reddit/Facebook routes remain available but show their parked-scope state instead of implying
that the TikTok profile console automates those actions.

## 18 August 2026 - Relay 14 and 15 fix key delivery and make installer upgrades version-aware

Relay 14 removed a bootstrap deadlock where accepting the sealed operator-key grant incorrectly
required the operator key that the grant was meant to deliver. Relay 15 then added its version to the
installer contract, refuses to overwrite a newer installed Relay, and became the Browser combined-
installer pin. The current immutable v15 archive is 34,285,450 bytes with SHA-256
`cfeefc7f1284492a64f5cf8b29603b3e9a36e5d488ac676d2d109b2c4364b261`.

MKTTool also began recording the Relay version each device reports and blocks publication of a
Windows installer whose embedded Relay is below the configured floor. `/setup` became the single
operator onboarding surface, replacing the split download-page path. These changes supersede the
17 August changelog's then-current Relay 13 instruction; current operators require Relay v15.

## 17 August 2026 - Six safety rules that could pass a bad thing, all closed

The audit reached the data layer, the business rules and the breadth sweep. Everything below changes
what the tool accepts or refuses, which is why it is here; the audit records themselves are not.

**Two nicks could touch the same Reddit thread without the tool noticing.** Rule 8 blocks that, and
it is the only rule with no override, because two of your accounts in one thread is the clearest
coordination signal a platform can catch. It recognised threads by their link, and understood only
the long `/comments/` form. A `redd.it` short link — the one the Reddit app's Share button produces —
produced a different key, so the same thread looked like two. Short links now resolve to the same
key. The newer `/r/<sub>/s/<id>` share links cannot be resolved without asking Reddit, so the two
places you paste a link by hand now refuse that format and ask for the full permalink instead.

**Rule 10 approved a health verdict it did not recognise.** The shadowban prober has six verdicts and
the rule enumerated five, so `UNTRACKED_POSTS` — outsiders can see posts your ledger does not have —
fell through to "post away", and that is precisely the verdict meaning the daily cap, spacing and
promo-ratio counts are running short. It now warns and names the fix. Any verdict the rule does not
recognise is refused outright rather than allowed, matching how rule 1 already treats an unknown
account status.

**Deleting a nick needed no more permission than viewing one.** Anyone signed in could delete another
person's nick, while deleting a proxy required an administrator. Deletion now uses the same check
that guards that nick's password, email password and TOTP secret — because deleting the row destroys
exactly those, and for a nick added minutes ago the vault holds no other copy. Nicks with any history
were already undeletable and still are.

**A placeholder signing key was accepted.** The server signing seed was checked for length and
character set but not content, so `00…00`, `ff…ff` and an ascending counter each produced a working
key — one that signs tickets, update authorizations and rollback authorizations alike. Seeds that
look filled-in-for-now are now refused, with a message naming the pattern and pointing at
`npm run keys:server-keygen`.

**The same hole was open on the vault keys, which is the worse place for it.** `VAULT_KEY_SERVER` and
`VAULT_KEY_OPERATOR` were checked for length and character set only, exactly as the signing seed had
been, so `00…00` was a working key. A guessable signing seed lets someone forge authority, and
rotating the key ends it; a guessable `VAULT_KEY_OPERATOR` decrypts every nick password, email
password and TOTP secret, and rotating changes nothing for backups already made — they still open
under the old key. The same three pattern checks now guard both, and they are one shared piece of
code rather than two copies.

The Relay's own paste box had the identical hole, and that is where this key really lives once the
server has given it up — so it is guarded too, and its input no longer suggests a row of zeros as an
example. If you have already been running with a filled-in-for-now key, **do not edit `.env`**: your
data is encrypted under that key, and the tool will tell you to move to a real key with
`npm run vault:rekey`, which still reads the old one.

**The shadowban prober's lock would have stopped working as the herd grows.** It treated a run as
dead after thirty minutes, but a run takes thirty to ninety seconds per nick, so at around twenty
nicks a perfectly healthy run would be declared dead and a second one would start alongside it —
both probing through the single observer proxy, which is the one thing the lock exists to prevent.
The run now reports that it is alive as it goes, so the threshold measures liveness instead of
elapsed time.

**Overriding a rule could leave no record of who did it.** The job and its audit entry were two
separate writes; they are now one transaction.

**The Relay status page reads as one language.** It previously mixed English and Vietnamese inside a
single screen.

**Historical 17 August checkpoint: Relay 13 was published and required for the changes above.** The
web app updated itself the moment the work merged, but the operator-key guard, the ticket-kind check
and the corrected paste box all live inside the `.exe` on your PC. Download the new one from
*Relay download*; until you do, your machine keeps the old behaviour. It is still unsigned, so
Windows SmartScreen asks once on each PC the first time — expected, not a fault. Relay 15 superseded
this instruction on 18 August.

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
