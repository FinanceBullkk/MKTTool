# Lộ trình phát triển

**Updated:** 9 September 2026

## Single-entry installer acceptance - 9 September 2026

Browser 0.3.15 / Relay 17 is the next candidate, with publication HOLD. Exact 0.3.14 installed cleanly
(9/9), completed supported enrollment/bootstrap and passed the former shutdown failure during signed
sequence 18 activation. Smoke then failed: Browser ignored the Relay-installed CFT runtime because
`current.json` was absent, attempted an unauthenticated candidate download and received HTTP 401.
The Browser correction recognizes the stable runtime only when its metadata matches the signed pin;
the actual bootstrap regression fails before the correction and four focused tests pass afterward.
No protected state or engine pin was edited to make the VM pass. Failure snapshot and diagnostics
remain retained. A separately observed ipapi.co RateLimited response on the original test proxy also
requires a verified observer input for the next trial.

Candidate `20260909-browser-0.3.15-relay-17-activated-engine-cache-cft` retains the exact Relay 17 ZIP
`d8bf25dcb446d779bd5461419ea7562044e280ac1d16592a71a52f156f6359cf`. Relay A2/B2 EXE, ZIP and sidecar
remain byte-identical from `78a8a84`. Previous full Web quality passed 2,168/2,168 with zero skips;
security and database contracts passed separately. New source/metadata checks, Browser A/B builds,
signed tuple, VM acceptance and owner-run MSI checks remain required before publication.

**Activation defect found; exact A is rejected for promotion.** Authenticated VM enrollment and
operator-key bootstrap succeeded. Tray reopen/Quit passed with no active profile; Quit retained the
same Relay process. Signed sequence 17 downloaded/staged all five artifacts after correcting a local
fixture filename, but activation stopped at `stopping`. The packaged Relay v16 process-stop command
returns exit 1 when the runtimes are already absent, because Windows PowerShell preserves the failed
`Get-Process` status. The exact empty-process case was reproduced on VM and in new Windows regression
tests. The fix explicitly completes successful shutdown with exit 0, holds process handles, waits
for termination and tolerates verified concurrent exit. All 450 Relay tests, typecheck and lint pass.
A new Relay payload and combined installer require a new frozen tuple and repeated acceptance;
retained A/sequence 17 evidence must not be rewritten as passing. Physical MSI testing stays pending.

**PUBLICATION HOLD.** Independent build B reproduced all 129 normalized payload files from A,
digest `607e229dea5506b0ffa6bfffb2714b7826634d1f2fad4548a411abaf04f779b8`, with zero differences.
Outer EXE hashes differ. Retain exact A for acceptance and eventual delivery:
`25e8fc156c0769245623dfc7b082cd9f88886b3516fbca24ea9509114928e8a3` (145073829 bytes).
Embedded Browser version stays `0.3.13`; candidate identity is
`20260909-browser-0.3.13-relay-16-single-entry-5ff43b2`, with Relay v16 and CFT 152.0.7977.64.

Signed compatibility sequence 17 verifies the exact five-artifact tuple and authority. It permits
fresh installation from sequence 0 only; migration from an already active sequence 16 remains
unapproved. The EXE remains unsigned. Candidate-specific immutable installer metadata is prepared;
57/57 DB-free tests across four files, full typecheck and lint pass. Read-only R2 preflight found
all prospective keys absent. No upload, operator promotion or metadata deployment occurred.

Clean restored VM installation passes 9/9. Installed welcome/profile creation reaches a missing
verified engine-pin error; supported signed ADMIN repair is still required before profile use.
Close-to-tray passed without an active profile. A fresh 1-vCPU VM repair passes 13/13 with bound
raw/receipt hashes; Browser-only launch from proven absent processes/listeners starts exactly one
owned Relay. Cold-login service startup and uninstall 15/15 also pass; the guest is shut down after
verified cleanup. Login startup was slow on 1 vCPU (Browser-only at about 100 seconds, both services
verified by about 211 seconds); physical-PC performance is unmeasured. Tray reopen/Quit, active
profile/proxy use, independent Relay retention and physical MSI acceptance remain open. The earlier
2-vCPU repair dispatch lost guest SSH and heartbeat responsiveness before a receipt; its saved
snapshot preserves that failed environment attempt. The owner requested background work while
using the host and will perform physical MSI testing manually after VM qualification.

The actual publisher CLI also accepts exact A and the prepared frozen manifest/provenance in a
bounded test with all R2 I/O simulated (zero real network calls). This is file-contract verification,
not upload or remote byte read-back evidence.

See the [current acceptance report](../../plans/260908-2130-single-entry-browser-startup/reports/release-acceptance-20260909.md)
and [MSI checklist](../../plans/260908-2130-single-entry-browser-startup/reports/msi-acceptance-checklist.md).
The following 8 September checkpoint is historical; its build-B resource blocker is superseded.

## Single-entry Browser startup - 8 September 2026

**WEB DEPLOYED / BROWSER DELIVERY HOLD - no new installer delivered and no MSI acceptance.**
The approved path makes normal packaged Windows Browser the entry point: activate one manager,
check/start only the verified installed current-user Relay, and keep profiles running behind a
usable tray. Explicit Quit closes profiles and Browser control while Relay remains available for
vault operations. Development, disposable roots, and compatibility smoke are excluded.

Combined installation transfers only the owned Relay Startup entry to Browser `--background`;
uninstall restores standalone Relay startup when that Relay is retained. Conflicts fail closed.
No automatic enrollment, owner repair, retirement restart loop, schema change, or Relay v16 binary
change is part of this work. The earlier frozen installer tuple is not rebuilt or overwritten.

The deployed Web checks the effective create-profile version floor (currently 13) independently
from Browser runtime health. Current Relay failures no longer imply an update; **Check again**
rechecks health and profile inventory with safe state-specific copy and no raw errors.

Local checkpoint: lifecycle tests **11/11 PASS**; fresh full Browser/Web lint and typecheck PASS.
Browser `test:installer` exited 0 using authentic frozen MKTTool source `b4ef969b`; machine integration
was skipped and remains OPEN. That named sibling input is not current-master coherence evidence.
Initial Web regression tests **44/44 PASS** across four DB-free files; the real Chromium fixture passes
rendering/retry/recovery checks but is not MSI acceptance. Independent Browser re-review has no
findings after three P2 corrections. Browser two-build comparison, clean-VM, and physical-PC
acceptance remain **OPEN**.
Browser production dependency audit passes with no suggestions; critical coverage passes 121/121,
zero skipped, across 14 protected modules (91.48% lines, 84.23% branches, 91.39% functions).
First hosted Web PR run `34237885978` failed one existing route-contract assertion: it expected
`/setup#download` in the profile card after that link moved to the extracted readiness helper.
Result: 1 failed / 2,122 passed / 17 skipped. Contracts, dependency audit, secret scan, and the
Windows Relay executable job passed. The assertion now follows the helper and real status render;
the Chromium fixture verifies the exact outdated-Relay download href. Local recheck: 47/47 across
five DB-free files, full typecheck/lint, and the browser fixture passed. No route assertion was
replaced with a dummy literal. PR #70 merged as `8e80fcffe9f6488310c058743df70b1aa3bb95d5` only after
rerun `34244893863` and secret scan `34244893848` passed at `9b63442b`. Both hosted full-test and
coverage runs report **2,124 passed / 17 skipped**, with 228 passing / three skipped files. Coverage:
81.01% statements, 76.59% branches, 82.34% functions, 83.59% lines; Next build passed.

Railway deployment `e68597cb-4679-4115-85cf-605baff7d6d9` reached SUCCESS for exact behavioral merge
`8e80fcff`; GitHub deployment `6331220213` agrees. Public health at 15:38:22 UTC returned HTTP 200,
ready, database/releaseMetadata/R2 OK, Relay 16. Post-merge CI `34245676858` and secret scan
`34245676970` passed; full tests/coverage retain the same counts and build passes. Post-merge Relay
executable is policy-SKIPPED (its PR job passed), not another executable pass. These server checks
do not verify the MSI UI journey.

Browser source `5ff43b27` is pushed only to its feature branch; main is unchanged. Isolated build A
passed seven frozen quality commands and packaging, retaining an unsigned 145,073,829-byte installer
with SHA-256 `25e8fc156c0769245623dfc7b082cd9f88886b3516fbca24ea9509114928e8a3`.
Build B dependencies are installed; its packaging/comparison and exact-installer VM acceptance are
paused for host resources (approximately 0.5-1 GiB free RAM; C: 13.3 GiB, below the 15 GiB VM floor).
This is a resource blocker, not an implementation failure. No installer was uploaded, signed,
installed, or promoted; old frozen bytes remain unchanged. Resume from the
[candidate checkpoint](../../plans/260908-2130-single-entry-browser-startup/reports/browser-candidate-checkpoint.md).

Lead owns a new exact candidate; installer acceptance must cover login startup,
close/reopen/Quit, conflicts, retained-Relay uninstall, and profile use. Source checks do not approve
installed-user delivery. See the [active plan](../../plans/260908-2130-single-entry-browser-startup/plan.md).

## Relay owner cleanup - 8 September 2026

The Web candidate lets an owner begin, complete, and finalize signed local cleanup only for their
exact already-revoked Relay record. Every server entry point checks ownership/revocation under the
transaction advisory lock. ADMIN retains active retirement and account unpinning; owner cleanup
never unpins accounts. Signed recipient proof, durable finalization, local ID/public-key matching,
and the Relay v11+ floor remain intact.

Setup offers **Finish local cleanup** only for the exact owned revoked binding. Other binding or
ownership conflicts remain ADMIN recovery. Pending receipt state routes to recovery without
claiming owner match. After finalization, restart Relay and return to Setup for a fresh identity.

Recorded RED evidence: backend 9 FAIL / 5 PASS; Setup state 2 FAIL / 29 PASS. The corrected local
run passes **226/226 tests across 23 files**, using only loopback `mkttool_test`. Full-project
typecheck/lint, the 20-file scoped secret scan, and diff check PASS. Backend specification/quality
and adversarial reviews found no findings. UI review found a P2: an RSC remount could erase
success-only restart/Setup instructions. The receipt control now keeps conditional guidance naming
the PC; review confirmed the fix with no new findings. UI rerun **17/17 PASS**; final full-project
typecheck/lint rerun PASS. Deployment and real MSI/physical-PC cleanup acceptance remain **OPEN**.

Relay v16, Browser/Relay binaries, schemas, and migrations are unchanged. Frozen installer,
clean-VM, and Browser release gates remain separate. Lead owns the remaining deployment
evidence; the operator and lead must verify the real recovery journey before closing acceptance.

## Relay download public-origin hotfix - 8 September 2026

The owner observed Download on a physical second PC redirecting to
`localhost:3000/api/relay/download/v16`. The Web candidate now builds the versioned redirect with
the existing `appUrl` helper, using the browser-visible Host and forwarded protocol rather than
Next's internal `request.url`. The authenticated download route and released package selection
remain unchanged.

Local regression validation: pre-fix 4 FAIL / 12 PASS; corrected run 16/16 PASS (seven route tests
plus nine existing URL-helper tests). Cases cover public HTTPS, forwarded protocol lists, local
development ports, production HTTPS fallback, authentication 401/403 and unavailable-release 404.
The expanded targeted suite passes 99/99 across seven files; full-project typecheck and lint pass.
The four changed source/test/doc files pass the secret scan; independent code review found no
scoped findings. Local full build is deferred while the VM runs; Railway's Web build is still OPEN.

Deployment is not yet verified. The corrected redirect and actual download on the physical second
PC remain OPEN pending post-deployment observation. This is a Web-only hotfix: frozen Browser and
Relay artifacts are unchanged; no Browser/Relay release, enrollment, activation or product-ready
claim follows from these local tests. Earlier release and acceptance evidence remains separate.

## Accepted product direction - 8 September 2026

The owner accepted **MKT Browser as a browser profile manager with proxy binding**. Active
antidetect/identity-engine research, custom Chromium fingerprint work, and further Brave/Cloak
identity experiments are closed. Lane C remains **CLOSED** and `G2-IDENTITY=FAIL` stays recorded.
No vendor contact or new engine integration is scheduled. Security and compatibility maintenance
remain in scope.

Delivery priority is **Proxy vault -> Relay handoff -> reliable manual browser-profile operations**.
The shared nick vault, proxy ownership, and Relay PC registry remain the team surface. Browser use
stays within bounded demonstrations with disposable data and human input. The current Browser draft
still needs release evidence before distribution; accepting this direction closes no technical gate
and grants no real-account approval.

Use the [product decision and acceptance criteria](project-overview-pdr.md#product-direction-decision---8-september-2026)
for new work. Installer/CI, real network containment, recovery, second-PC/operator, and canary work
support a controlled profile-manager release; they do not reopen identity research. Earlier posting
targets and engine plans are historical context, not the next delivery milestones.

## Ready-to-use closeout checkpoint - 8 September 2026

**Web/Relay handoff is delivered; Browser remains a technical candidate, not ready for normal
fresh installation or distribution.** MKTTool PR #68 merged as `46a99f2bc3c209fd3bc0b8943f60d217505b5295`.
Post-merge CI `34171586969`, deploy verification, Railway production deployment, and secret scan
`34171586987` passed. The post-merge Relay executable job was policy-skipped; its green PR check
is separate evidence, not a post-merge executable run.

Browser commits `c7e17429` and `36939cdd` (tree `35a1dc6d91b6680dad02eb20b6e5849b4991e38d`)
repair repeated PowerShell/CIM startup overhead and default fresh settings to CFT. Process queries
remain fresh and serialized, with no cached process-table acceptance. Exact process/listener
ownership, the 15-second readiness budget, signed tickets, and proxy fail-closed behavior remain
unchanged. Explicit saved engine selections are preserved. Browser source `36939cdd` is pushed
with local/remote parity `0/0`; no new Browser PR, CI trigger, merge, or publication occurred.

| Evidence surface | Current result |
|---|---|
| Local Browser | PASS: 391 installer-suite tests; 1 intentional live-host SKIP; typecheck/lint; critical coverage 121 tests, 91.48% lines / 84.23% branches / 91.39% functions; independent reviews reported no findings |
| Prior repaired directory package on VM | PASS: two complete signed managed lifecycles, including a real guest reboot; create, open/close, reopen, broken-proxy refusal while stopped, and recovery. All six successful launches used normal 15-second readiness |
| New installer package | Built locally from the recorded tree, unsigned and unpublished; exact identity is in the [owner handoff](../../plans/260908-0644-ready-to-use-closeout/owner-handoff.md#technical-candidate) |
| New local packaged fixture | PASS: 1/1 CFT compatibility lifecycle in 6.395 seconds; explicit test fixture, not normal installed first-run evidence |
| New installer VM lifecycle | PASS: clean install 9/9, repair 13/13, initial and post-repair uninstall 15/15 each; exact new artifact. Defender enabled, operator data/token/Relay state preserved; zero residual product processes, listeners, firewall rules or gate tasks |
| Browser hosted CI | BLOCKED: latest technical run `34165090202` passed quality and package build but failed artifact upload on storage quota; packaged-contract SKIPPED |
| Normal packaged first run | BLOCKED, observed on the clean installation without overrides: contract 4, CFT, engine version absent, engine status error, no active pin or CFT runtime. The installer does not provision the required compatibility-set pin |
| Browser-page network/operator/canary | OPEN: current-candidate IP/DNS/WebRTC observations, unfamiliar-operator acceptance, and seven actual canary days |

Only about 56 KB of unexpired Browser artifacts were observed; expired entries must not be counted
as current storage. The logged-in organization member lacks billing access (`admin:org` absent).
An organization owner must resolve the shared storage/access blocker before another justified
hosted attempt. Do not bypass required checks or hand-edit activation state. The official CFT
`152.0.7977.64` archive is measured, but no signed CFT compatibility set is activated or released.
The [owner handoff](../../plans/260908-0644-ready-to-use-closeout/owner-handoff.md) lists safe current use and blocked
next actions. Lane C remains CLOSED; `G2-IDENTITY=FAIL` is unchanged.

Installed runtime receipt: `local-test-artifacts/profile-manager-closeout-20260908/closeout-installed-runtime.json`
in the workspace, observed `2026-09-08T00:09:23.4261693Z`. Its ASAR matches the new candidate.

## Earlier finishing-pass checkpoint - 8 September 2026

The earlier local verification candidate was Browser source `ad0c7182` with a README-only working
diff, still version `0.3.13` with Relay v16. It is unsigned, unattested, and unpublished; it does not
replace the historical P4b tuple. These results remain historical; the closeout checkpoint above
records subsequent repairs without relabeling the failed attempts. Exact hashes and boundaries are in the
[release checkpoint](./internal-beta-release.md#finishing-pass---8-september-2026).

| Evidence surface | Current result |
|---|---|
| Local Browser | PASS: lint/typecheck; installer suites 374 passed, 1 live-machine test skipped; critical coverage 90.87% lines / 83.06% branches |
| Local packaged fixtures | PASS: pinned CFT `152.0.7977.64` verifier 1/1; exact bundled Relay executable 35 checks. Compatibility/contract evidence only |
| Disposable clean VM | PASS: install 9/9 and initial uninstall 15/15, with Defender enabled and profile/token/unrelated Relay state preserved |
| Fresh-snapshot repair | PASS: repair 13/13 and post-repair uninstall 15/15 from the same exact clean snapshot; Defender enabled, no repair threats recorded, data retained |
| Managed proxy integration | FAIL: VM verification hit DevTools discovery failure; diagnostic retry failed CFT version inspection. Complete create/open/reopen/rejection/recovery acceptance remains OPEN |
| Independent proxy probes | PASS: one dedicated test entry produced an exit distinct from direct traffic; this is not browser-page egress evidence |
| GitHub Actions | BLOCKED: run `34002472571`, attempt 5, built the package but failed artifact upload on quota; packaged-contract skipped; PR #17 unmerged |
| Real network and human acceptance | OPEN: browser-page IP/DNS/WebRTC containment, unfamiliar-operator acceptance, and seven-day canary |

The one post-cleanup CI retry exhausted the bounded infrastructure retry. An organization
administrator must resolve storage/billing access before another hosted attempt: billing returned
404 requiring `admin:org`, and Packages returned 403 requiring `read:packages`. Do not replace the
hosted gate with local/VM evidence. CFT remains an isolated test fixture, not a released engine
manifest or an installer engine-pin change. Browser distribution and real accounts remain NO-GO.

## Rollout scope decision — 2 September 2026

**Reddit and Facebook are withdrawn from the team rollout scope.** Scope only, nothing deleted: the
posting pipeline, Pages publisher, and health checks stay implemented and deployed but are handed to
nobody. The team surface narrows to the nick vault, proxy ownership, and the Relay PC
registry; the 1 September Lane A GO stays a technical record and stops being a rollout instruction;
posting entry points enforce the boundary through `rollout-scope.ts`. Detail and re-entry condition:
[internal-beta-release.md](internal-beta-release.md).

## Operator-console redesign — 5 September 2026

The five in-scope surfaces now share one calm operations-console hierarchy: Home is a distinct
**Workspace overview**, while **Nick vault**, **Proxy vault**, **Relay PCs**, and **Set up this Relay
PC** each answer one operator question. Desktop navigation uses readable labels, mobile uses a
bottom navigation bar, and the content width, typography, focus treatment, surfaces, and status
colors are consistent across routes.

Home and the vault tables keep one primary state and one next action visible. Secondary metadata,
checksums, public keys, compatibility controls, and destructive Relay PC actions move behind
explicit disclosure. Active and revoked Relay PCs are separated. This is presentation and
information architecture only: routes, schema, authorization, ticket trust boundaries, setup state
machine, and parked-platform scope are unchanged.

A second hierarchy pass removes the remaining table-inside-card treatment from the Relay PC
registry: each active PC now has one summary row, key work is not duplicated in a separate warning
table, and revoked PCs stay collapsed as history. Nick lifecycle fields and proxy endpoint details
are also folded by default, reducing the daily index views to the decisions operators actually make.

The same system now covers the parked Content, Queue, Facebook, Targets, and Health routes so an
operator never changes visual grammar when opening historical data. Shared forms, confirmations,
error/empty states, and secure profile handoff use icon-led summaries and reveal long recovery or
safety guidance only when requested. Mobile data tables become labeled record cards; controls keep
44px touch targets. The signed-out login screen and route-level not-found/error states also use the
bounded canvas and the same amber industrial language.

## UX navigation and vocabulary — 3 September 2026

The Phase 2 UX work makes the current product boundary legible without changing data or rollout
scope. The left rail exposes `/accounts` as **Nick vault** with permanent labels. Home now reads as
the **Workspace overview**, routes its primary action to `/accounts`, and uses a working local search
over visible nick fields. The global search, `Ctrl K` badge, and global running/total counters were
removed because they did not reflect real state.

The canonical display terms are **nick** for the shared `Account` record, **browser profile** for
local browser data, and **Relay PC** for a registered `RelayDevice`. Home, `/setup`, `/accounts`,
nick detail, and browser actions use those terms. `TeamScopeNotice` and `rollout-scope.ts` are
unchanged; setup readiness/stepper behavior, owner/device/concurrency rules, routes, schema, and
parked platform scope are also unchanged. See [ui-glossary.md](ui-glossary.md).

## Shared-use safety — 3 September 2026

Phase 4 closes three shared-vault ambiguity and overwrite paths without changing rollout scope or
the authorization model. Home and `/accounts` expose the responsible owner and assigned Relay PC;
an unassigned device is shown as missing data rather than a fabricated “Local PC”, and launch
conflicts keep the server's cleaned owner/device explanation.

Owner/Relay PC, proxy, and compatibility updates now ask for confirmation only when the submitted
value really changes. The confirmation shows before/after values and consequences; compatibility
updates state before confirmation that Relay and MKT Browser restart and require the exact PC name.

Account edit and cluster assignment now use `Account.updatedAt` as an optimistic revision. Their
conditional update and audit rows share one transaction, and a stale loser returns before audit or
queue-recheck writes. Real-PostgreSQL tests execute two sequential writes from one revision and prove
that the second changes nothing. No schema migration or app-wide locking mechanism was added.

## Proxy assignment authorization and audit — 3 September 2026

The owner decision left by PR #55 is closed with options B + D. `updateAccount` compares the
normalized submitted proxy with the stored `proxyId` and requires ADMIN only when that value changes;
operators retain the existing shared ability to update karma, status, voice, and browser-profile ID.
The operator edit form renders the current proxy read-only and points to the primary administrator
contact derived from `ADMIN_EMAILS`; only ADMIN receives the editable selector and consequential
proxy-change confirmation.

`ACCOUNT_UPDATED` audit detail now appends before-to-after proxy and browser-profile IDs only when
each value changes. The audit row stays in the same transaction as the conditional account write and
contains no proxy endpoint or credential. No migration or rollout-scope change was made.

## Relay-first setup handoff — 3 September 2026

`/setup` now leads operators through the existing Relay release channel in three steps: download
Relay, register the current Relay PC, then complete the nick/proxy handoff. The previously orphaned
`RelayDownloadSection` is rendered on the page, so `/relay-download` and every `/setup#download`
link land on a real download control. The canonical authenticated `/api/relay/download` route and
its versioned target are unchanged.

MKT Browser is no longer a setup download or prerequisite. It appears only as secondary boundary
copy in Step 3 and remains in the separate blocked Browser lane. This UX correction does not change
Browser APIs, rollout gates, `G2-IDENTITY=FAIL`, Relay authentication, schema, or ownership rules.

## Current operational update - 1 September 2026

Production now runs Railway deployment `0a696033-b610-492c-b75a-3e918cca102a` at master commit
`2734e2f0ba9c2a2f9c3731a44540c01d263b36e2`, status `SUCCESS`. The intermittent 503 incident is
**mitigated / monitoring**: the last 24-hour evidence is 947/947 `/api/healthz` HTTP 200, zero
non-2xx, and zero server 5xx; a fresh external burst is 24/24 HTTP 200/ready. Health upstream
latency is p95 179 ms, max 767 ms. Memory peaked at 0.42 GB and 120 one-minute samples show no
restart discontinuity, so OOM/restart/browser-launch explanations are not supported by available
metrics. R2 latency remains an unconfirmed hypothesis; direct host probes are not serving-region
telemetry.

The authorized `/api/relay/download/v16` route was reverified by full GET: HTTP 200, 33,342,752
bytes, exact SHA-256 `5c98cf460e62f83b484c9ecd55bc80b650f2e19a09e8ded6e99eafb682e1842e`. Keep proxy
streaming for now because the pinned installer rejects redirects and depends on Range/resume.

One owner machine has completed the 0.3.13 self-serve reinstall and reports Relay v16 with a
contract-compatible Browser. The second owner machine remains open. `MIN_RELAY_VERSION` stays 13 —
as the correct floor, not as a holding position; see the note below.
The bounded credentialed/admin smoke is PASS; the owner signed CONDITIONAL GO for Lane A on
1 September 2026 and accepted residual risks 1–8. Lane C remains CLOSED; Browser P4b and installer
reproducibility remain OPEN.

## Consolidation truth — 30 August 2026, post-deploy reconciliation

The consolidation branch `release/consolidation-20260830` contains the source/docs follow-up;
MKTTool CI contracts are required in
`.github/workflows/ci.yml`. Branch run `33292005382` and post-merge master run `33292350436` are
green for the required MKTTool jobs (check, PostgreSQL contracts, secret scan, and deploy
verification where applicable). The earlier `33291209847` remains failure evidence only.

P4a is the **MKTTool Web/Lane A** deployment and does not require a Browser engine archive or the
five-artifact Browser tuple. A fresh current-database backup and `db:restore:verify` both pass, and
the rollback tuple is recorded. PR #40 merged to `master` at
`380962a49576a4663438ef50685dcb386c86aa08`; the latest Railway deployment and exact commit are
recorded in the successor P4a evidence report. `/api/healthz` returns 200 and the authorized full
`/v16` GET matches the immutable published hash.

U3 remains **OPEN**: the detached experiment's 128-file payload was deterministic, while the current
controlled 130-entry provenance manifests are also equal. The outer Windows installer keeps a
103-byte NSIS/resource-order variance across clean runs. No normalizer was accepted, and no claim of
full installer reproducibility is made; see the successor U3 report for the exact source boundary.

U5 keeps `MIN_RELAY_VERSION=13`. One owner machine is now observed at v16; the second remains open.
Both v15 devices are the owner's own machines, so the upgrade path is self-serve reinstall of 0.3.13
on each; no notification channel is needed.

**The floor and the fleet are separate questions, and earlier wording here ran them together.**
`MIN_RELAY_VERSION` is not "the current version" — it is the oldest build the server will still talk
to, and `ticket-types.ts` states the only condition for raising it: a security reason, to stop
talking to builds with a known hole. That is why it moved to 13, for the C26 trust-root replacement.
Relay 14 fixed a bootstrap deadlock and 15 made installer upgrades version-aware; neither is a hole,
and 16 carries no security fix of its own. So 13 is where the floor belongs, and observing the second
machine at v16 is fleet hygiene rather than the trigger for a bump.

Raising it anyway would not be free. The shared floor governs the `CREDENTIAL` and `OTP` tickets, so
any device below it loses password reads and OTP generation the moment it moves — which is exactly
the outage the second, unobserved machine would take. A future ticket kind that genuinely needs v16
belongs in `MIN_RELAY_VERSION_BY_KIND`, which exists so a new capability costs nothing to the people
not using it. U6 closed the
custom-engine build track after the measured RAM gate; no custom Chromium
build or CloakBrowser seat was consumed.

**Lane C is CLOSED for this product shape.** `G2-IDENTITY` remains FAIL on the recorded font/audio/
WebGL collisions, and there is no CloakBrowser channel. No vendor request, date, or “coming soon”
promise exists. A future alternative-vendor decision would be a new, separately owned product
scope. MKTBrowser remains a controlled Lane A/B demo and does not claim identity isolation.

**Fingerprint gate decision - 2 September 2026:** the current pinned CloakBrowser Stable `.2`
engine remains `BLOCKED` with `0/10` valid readings because it could not launch. Official Brave
`v1.94.117` was measured at five profiles and two runs each against exact-revision same-machine CFT;
it failed A consistency, B stable-subset collision, and C cohort plausibility. Brave audio did not
form an invariant vendor mark, but five rendered hashes changed after restart and every profile pair
still collided on a `62`/`63`-component stable subset. No current engine path proves identity
isolation. The owner signed the Phase 05 `NO-GO`: no Brave integration plan is authorized,
`G2-IDENTITY` stays `FAIL`, and the product remains a profile/proxy/ownership manager rather than an
identity-isolation tool.

Đây là **nguồn duy nhất về trạng thái** của dự án. Chi tiết thi công nằm ở
[plan công cụ gốc](../plans/260801-2030-multi-account-posting-console/plan.md),
[plan Web chung](../plans/260804-1752-web-chung-cho-team-phan-tan/plan.md) và
[plan MKT Browser](../plans/260810-0244-mkt-browser-noi-bo/plan.md); vì sao làm ở
[project-overview-pdr.md](project-overview-pdr.md).

Dự án đang chạy **ba luồng song song**:

| Luồng | Là gì | Trạng thái |
|---|---|---|
| **A — Công cụ** | 5 giai đoạn gốc: kho danh tính → hàng đợi → sức khỏe → Facebook → tự đăng Reddit | GĐ1-4 xong, GĐ0 kẹt ở tiền + cold-start, GĐ5 chưa bắt đầu |
| **B — Web chung** | Biến app một máy thành web chung cho 5-6 người ở 5-6 nơi | **GĐ0-4 xong 06/08**, GĐ5 web **đã chạy thật trên Railway** cùng ngày |
| **C — MKT Browser** | Fork the MultiZen desktop layer; Windows-only in v1 while Web, Relay, and upstream UX/UI remain intact | **MKB-00 through MKB-02 verified; MKB-03 is a controlled technical draft with Browser CI, vendor/engine, real-proxy, second-PC, and canary gates open; Lane C real-account promotion is CLOSED; the experimental Brave gate failed A/B/C and opens no engine migration**; MKB-04 remains NO-GO; macOS deferred to MKB-07; [plan](../plans/260810-0244-mkt-browser-noi-bo/plan.md) |

**Historical pre-consolidation stream table:** the earlier `3f376536` join-key wording described a draft before
the consolidation branch. The accepted Browser provenance receipt was generated from `5ef710dd`; the
current Browser branch head is `b9f9477`; its provenance is accepted, but
the exact five-artifact tuple remains a separate P4b technical OPEN. This does not gate P4a Web. Use
one profile at a time with human login/input. Profile-local storage, proxy routing, and technical
readiness checks are operational controls only; they do not prove browser identity isolation. See
[internal-beta-release.md](internal-beta-release.md). Browser/Relay real-account rollout remains
NO-GO for the unresolved identity and operator gates; Lane C itself is closed because there is no
vendor channel.

**TikTok scope decision, 19 August 2026 (technical-only wording):** the console contains account/
profile setup and manual-launch code paths that may be exercised only in a controlled technical
demo. This is not rollout readiness or authorization for real-account automation. These controls do
not certify browser identity isolation. TikTok is deliberately absent from
`TARGET_PLATFORMS`: content, scheduling, warmup, and posting automation are parked and must not be
inferred from the TikTok-focused profile UI.

Luồng B sinh ra sau khi chốt bàn giao cho team — xem
[plan web chung](../plans/260804-1752-web-chung-cho-team-phan-tan/plan.md). Nó **không thay thế**
luồng A: tự đăng Reddit vẫn nằm ở luồng A và vẫn chờ nick thật.

Stream C replaces MultiZen at the **desktop execution layer**; it does not replace Web, the database,
the rule engine, or Relay. W01 proved compatible behavior, then W02 deliberately moved the active
first-party package/preload/MCP/consumer identities to an owned contract before operational use.
**Platform decision, 10 August 2026:** v1 commits to **Windows x64 only**; macOS Apple Silicon moves
to MKB-07 after v1. Mac hardware is available, so this is a priority choice rather than a hardware
constraint: the Windows slice is already verified end to end, while macOS still needs Apple Developer
enrollment, notarization, a LaunchAgent helper, and Keychain storage, none of which is started or
owned, and no operator workflow depends on macOS today. The control against paying for this twice is
that the Relay keeps a shared core with thin OS adapters, so MKB-07 adds a platform instead of
reopening one. V1 does not redesign MultiZen or develop a Chromium engine.

**Immediate delivery target, 15 August 2026:** complete pre-MKB-04 remediation on top of the verified Windows x64
managed-mode contract. An owner-led demonstration may use disposable profiles and show the
Web → Relay → MKT Browser flow, but it is not a pilot, distribution approval, or permission to use
real accounts. The one-download onboarding journey, secure enrollment/migration, controlled updates,
pilot duration, and real-account gates remain separate. Code signing is no longer among them: on
12 August the owner decided v1 ships **unsigned** for the internal fleet, so SmartScreen appears once
and the setup journey must announce it in advance.

**P0 technical checkpoint, 22 August 2026:** the automatically verifiable browser/proxy foundation
is green. MKT Browser fails closed before launch when proxy egress is unavailable or malformed; its
lease journal is atomic, schema-validated, mutation-serialized, crash-recoverable, and redacts both
normal and short keys; capacity reports expose aggregate counts only. Relay launch results carry
allowlisted stable codes. The profile grid/table polls current Browser inventory, blocks unknown
state, marks actual running profiles, and prevents stale polls from undoing a successful launch.
MKTTool passes 1,903 tests plus typecheck, lint, and a warning-free production build. MKT Browser
passes typecheck and lint with zero warnings, the complete automated installer suite, desktop build,
and packaged runtime/profile-lifecycle verification under Node 22.

**Release-readiness extraction checkpoint, 22 August 2026:** Phase 1 is verified locally on Windows.
The vulnerable direct packaged dependency `extract-zip@2.0.1` is gone. Engine ZIP and signed CRX/ZIP
extension paths use one owned `yauzl@3.4.0` boundary with path, link, collision, size, compression,
CRC, cleanup, and final-tree containment checks. The production dependency audit reports no
suggestions, and the packaged verifier now inspects `app.asar` to reject `extract-zip` and require the
pinned replacement. This removes one release blocker; it does not close packaged-CI, signing, live
Windows/network/recovery, or canary gates.

**Release-readiness packaged-CI checkpoint, 22 August 2026:** Phase 2 implementation is locally
verified but remains in progress. MKT Browser now uses an OS-assigned DevTools port, accepts only a
fresh bounded port record whose loopback listener belongs to the owned profile process, preserves one
total 15-second operator budget, records sanitized process/listener failure evidence, and bounds every
verifier health/RPC request. The Windows workflow builds one directory package, hashes and uploads it,
then downloads and tests that exact archive in a fresh job. The rebuilt package passed 5/5 cold
lifecycle iterations while ports 9222 and 9223 were occupied. The required PR artifact run and seven
independent 20/20 Windows runner runs have not happened, so packaged-CI stability is not yet a closed
release gate.

This checkpoint is still **NO-GO for rollout**. `license-capacity-v1` is deliberately not advertised
because live vendor schema capture and sidecar/driver integration are not yet release-ready. Two real
disposable proxy/profile assignments, in-browser egress plus DNS/WebRTC proof, human-controlled
login/input, second-PC setup, and the seven-day canary remain open. Crash and reboot recovery are now
covered by the final G3 evidence below.

**Vendor and network gates measured, 23 August 2026.** Still **NO-GO for rollout**, but four of the
gates above moved from unknown to measured, and one blocker was found and fixed while measuring.

| Gate | State after 23 August |
|---|---|
| Vendor session protocol | Measured. `start` → `lease_id`, TTL 900s, heartbeat 300s, `end` → `{"ok":true}`. Sessions are counted **per licence**, not per account or per install: two keys granted two concurrent sessions on one `install_id`. N concurrent profiles would require N vendor seats on one machine; this measured model is not a current entitlement or capacity promise |
| Per-profile network routing | Passed on two profiles measured **sequentially**. Each browser's egress matched only its own proxy probe, each resolved DNS at that proxy rather than the operator's ISP resolver, WebRTC gathered no candidates, and the operator's real address appeared nowhere. This is network evidence, not browser identity evidence |
| Concurrent two-profile operation | **Deferred out of v1, 25 August.** Only one licence seat is free, so the owner capped v1 at one profile at a time. No concurrent identity-isolation claim may be inferred |
| Normal close returns the seat | Passed, measured twice. Seconds, not the 900s lease |
| Crash, hard kill, Relay restart, reboot | **Passed 27 August on the final bounded recovery rerun (historical v15 path).** Normal close, hard-kill cooling, and active Electron-crash startup recovery remain green. Packaged Relay v15 preserved its device binding, rejected the spent ticket as `ALREADY_USED`, and accepted a fresh ticket. The final Browser `55b8587` disposable-VM run validated `active` with capacity `1/0/1/0/0`, performed one real VirtualBox poweroff, observed no Browser process after boot while the exact lease remained `active`, moved it to `cooling` with `pendingRecovery=0`, returned to `1 free / 0 active / 0 pendingRecovery / 0 cooling` after TTL, relaunched the same profile, and cleanly released it. Evidence: `local-test-artifacts/phase5/real-power-cycle-recovery-evidence-20260827-ownership-fix-r2.json`. `G3-RECOVERY` is **PASS for that tested path**; it does not close the current candidate rollout |
| Clean second-machine install and uninstall | **Passed 25 August** on the VM guest acting as PC B, recorded as virtual. From snapshot `clean-with-ssh-defender-20260825` with Defender engine `1.1.26070.7` and signatures `1.457.331.0`, current-source candidate `7849947` / tree `b060da0` passed clean combined install 9/9, repair 13/13, and combined uninstall 15/15, with no detection and no Defender event 1116/1117 in any gate window. The artifact is unsigned, unattested, and not releasable, so this closes the lifecycle slice only, not rollout |
| Capacity advertised to operators | Still withheld. `license-capacity-v1` stays unadvertised until live vendor schema/sidecar integration and the remaining rollout gates close |

The blocker (historical 23 August investigation): the Browser declared a launch successful before
the engine's licence verdict arrived, so a refused key came back as a running profile and the
key-rotation loop never ran. The current one-seat policy deliberately passes only the primary key to
the pool; multi-key rotation and multi-profile capacity are not part of the internal candidate.

Evidence: [`ket-qua-260823-1910-gate-cach-ly-va-loi-khong-xoay-khoa.md`](../../plans/reports/ket-qua-260823-1910-gate-cach-ly-va-loi-khong-xoay-khoa.md).

**Lifecycle and installer repair reconciliation, 24 August 2026.** Still **NO-GO**. On the current
local directory artifact (`c802fabb` / tree `bd87f752`), one disposable unmanaged profile with no
proxy or account data launched and closed normally. Capacity moved `free 1 / active 0 / cooling 1`
to `0 / 1 / 1`, then back to `1 / 0 / 1`; the log reached `Browser.close`, child exit 0, and
`SHUTDOWN-COMPLETE` with method `Browser.close`. The cooling seat came from an earlier live key
refusal and correctly did not become false-free.

The installer repair VM produced an environmental failure, not a product pass: Microsoft Defender
remediated `Behavior:Win32/PShellCobStager.A` twice while the mandatory Administrator/PowerShell
custom-install work was incomplete. Defender was not disabled or allow-listed. The corrected clean
and repair harnesses now require installer exit zero, Browser payload, pinned Relay, both WebRTC
firewall rules, both shortcuts, Publisher, and Relay ownership metadata before launch. Evidence:
[`lifecycle-installer-repair-evidence-20260824.md`](../../plans/260821-1925-antidetect-browser-proxy-p0/reports/lifecycle-installer-repair-evidence-20260824.md).

**Lifecycle and installer continuation, 25-26 August 2026.** The Defender block above was diagnosed
as a behavioural COM-stager match rather than any script's contents. Removing the
`HNetCfg.FwPolicy2` firewall reader and moving nine call sites off `-ExecutionPolicy Bypass` was
enough: on an updated-Defender snapshot the same guest passed clean combined install 9/9, repair
13/13, and combined uninstall 15/15 with no detection. Repair restored the exact Browser tree
digest, both shortcuts and Publisher while operator token, profile database and Relay config
survived; uninstall removed Browser payload, shortcuts, both firewall rules and the Browser-owned
Relay executable while leaving operator data intact.

Recovery moved too. Browser hard kill and an active Electron crash now both converge, the second
after startup was taught to bind a sweep verdict to the exact owned engine path instead of a bare
PID. The Relay restart subset then passed on 27 August with the **historical** packaged Relay v15 path: a process restart
preserved the device/replay state, replay of the consumed ticket returned `ALREADY_USED`, and a fresh ticket still
reached the Browser-operation boundary. The first 27 August real power-cycle attempt was blocked
before an active lease because the disposable VM could not attribute the DevTools listener to the
live Browser process (`portOwnerPids=none`). A follow-up proved listener ownership after warming the
Windows provider, but its one-shot scheduled arm task ran twice and invalidated the checkpoint. The
owner-approved rerun removed future task triggers and warmed both providers immediately before
launch; the packaged Browser still failed closed with a live child and `portOwnerPids=none` before
an active checkpoint could be retained. Cleanup returned `confirmed-released`, then capacity
returned after cooldown to `1 free / 0 active / 0 pendingRecovery / 0 cooling`. No recovery power cut
was made; the later VM poweroff was cleanup only. At that point `G3-RECOVERY` was **OPEN** on
`VM_PRECUT_ACTIVE_CHECKPOINT_UNAVAILABLE`, and the host reboot blocker remained named rather than
silently converted to a pass.

The next root-cause rerun reviewed Browser source `55b8587` with bounded native Windows process and
listener discovery plus fail-closed identity rechecks. Local Node `22.23.2` verification is green,
but the VM gate stopped before an active checkpoint: scheduled task filenames did not match the
transferred files, and a PowerShell UTF-8 BOM made the settings JSON unreadable, yielding capacity
`total=0`. Those harness defects are fixed locally, yet no checkpoint-qualified recovery power-cycle
was made; preparation and cleanup poweroffs are excluded. The disposable clone was deleted.
`G3-RECOVERY` was **OPEN** at that point; a fresh owner-reviewed run required the exact pre-cut tuple. The owner
chose to keep the existing licence key; no key value is retained in evidence, and later gates must
continue to stream it without logging.

The next bounded rerun reached the active tuple and performed one real VirtualBox poweroff only after
`ValidateCut` returned `checkpointValid=true`, with `active` journal, `1/0/1/0/0` capacity, live
Browser/profile processes, and demand-only tasks. After boot, the exact lease was still `active` and
the Browser process table was empty, but the `cutCheckpoint` update had disappeared from
`gate-state.json`. This exposed a harness durability defect, not a recovery verdict. The gate now uses
a write-through file handle plus `Flush(true)` and requires the persisted checkpoint after boot.
Evidence: `local-test-artifacts/phase5/real-power-cycle-recovery-evidence-20260827-durable-checkpoint-review.json`.
`G3-RECOVERY` was **OPEN** at that point on `GATE_STATE_NOT_DURABLE_ACROSS_POWER_CYCLE`; no rollout
phase proceeded from that run.

The final owner-approved bounded rerun then passed the complete power-cycle gate. Evidence
`local-test-artifacts/phase5/real-power-cycle-recovery-evidence-20260827-ownership-fix-r2.json`
validated the exact pre-cut tuple (`active`, capacity `1/0/1/0/0`, live pinned Browser/profile
processes, demand-only tasks), performed one real VirtualBox poweroff, observed the exact lease still
`active` with no Browser process after boot, then observed `cooling` with `pendingRecovery=0`, free
capacity after the vendor TTL, same-profile reuse, and final `confirmed-released` cleanup. This
supersedes/resolves `REBOOT_LEASE_STUCK_PENDING_RECOVERY`,
`VM_PRECUT_ACTIVE_CHECKPOINT_UNAVAILABLE`, and `GATE_STATE_NOT_DURABLE_ACROSS_POWER_CYCLE`.
`G3-RECOVERY` is now **PASS**. The existing real key was kept; no revoke or rotation was performed,
and no key value is retained in evidence. Rollout remains **NO-GO**, and no Phase 2, Phase 5, or
Phase 6 work starts.

Three owner decisions on 25 August narrow v1: one profile at a time, unsigned reaffirmed, and the
clean VM guest serves as PC B. At that point the one-seat cap raised the cost of a reboot failure
sharply; the final 27 August power-cycle evidence above closes that recovery risk. The decisions
themselves remain in force. Still **NO-GO** for rollout.

Two harness defects were found and fixed rather than hidden: the repair harness hashed `profiles.db`
while an installer-triggered relaunch held it open, and the uninstall harness checked before the
temporary NSIS worker converged. Failed-attempt evidence is retained separately and is not counted
as a product verdict.

**Audit closed, 17 August 2026.** A deep audit spanning both repositories completed all six phases:
fix re-verification, cryptographic protocols, the local control surface, Windows lifecycle, release
authority, the data layer and business logic, and breadth completion. No P0, P1 or P2 findings
remain, and the test suite has no expected failures.

Findings kept arriving **after** the phases closed, and the running total is deliberately not
restated here — it was copied into two documents and went stale in both, twice, within a day. The
findings register is where the count and the per-finding state are maintained.

What those late findings share is worth more than their number. Most are one shape — *the check that
would have caught the problem was not the check that runs* — and the durable output is a rule now
recorded in the register: **a check not proven to run in the environment its artifact lives in does
not exist.** Several changed how this project is operated rather than what its code does: the Relay
acceptance suite runs on a Windows CI runner instead of relying on someone remembering it; a failed
production deploy now turns the build red instead of going unnoticed for nine hours; the pre-deploy
database backup works again after nine days in which the rule was documented but its tool was
broken; and `MIN_RELAY_VERSION` was raised for the first time in the product's life, after the lever
for doing so turned out to have been broken since it was written. **Historical note:** that sentence
predates the current reconciliation; the live floor for this release remains 13.

Three things are examined and sound rather than merely untested: the one-nick-one-proxy-one-profile
invariant is enforced by database constraints and not only by application code; no secret reaches a
log, an error message or the DOM unredacted on any traced route; and every server action passes
through an authorization guard.

**What the audit did not do**, because a clean report is worth nothing if it hides its own edges: the
human Windows gates — Authenticode once signing is enabled, power loss during an update, and a
withdrawn installer on a clean machine — remain unrun, and code cannot close them. The two-account
Windows exercise was waived as an unsupported topology, which is a waiver and not a pass. The full
list of what was left unexamined is in the closing coverage statement.

Defects fixed so far include two identity-boundary ones — the proxy bridge accepting a destination
that could rewrite the request sent to the proxy provider, and device revocation leaving an aliased
second copy of a key usable — a rollback that could strand a device on a half-restored state, and two
found on 17 August: public keys that make signatures forgeable were accepted at import, and an
enrolled Relay's trust root could be replaced over `/configure`. Nothing above P2 has been found.

**Operationally actionable now:** every MKT Browser build from `v0.2.0` to `v0.3.1` carries the
unfixed bridge, so machines on an older build stay affected until they update.

Two limits are worth stating rather than leaving implied. Cross-user Windows isolation is **not**
verified; it is out of scope by an owner decision that the product supports one Windows user per PC,
which would need revisiting if that ever changes. And the human Windows gates — Authenticode after
signing is enabled, power-loss during an update, and a withdrawn installer on a clean machine —
remain unrun; code cannot close them.

Findings and remaining open items are in the workspace-level `plans/reports/` directory, which sits
above both repositories because the audit spans them and is version-controlled there; it is **not**
this repository's `plans/reports/`. The closing statement is
`audit-260817-1333-coverage-statement.md`; the merged finding index is
`260816-0507-full-codebase-deep-audit/findings-register.md`.

Phase 01 implementation now produces one installer carrying a pinned Relay archive and MKT
Browser. Relay releases use retained `MKTTool-Relay-vN.zip` R2 objects, carry measured version, size,
and SHA-256 metadata, and refuse publication when the local build sidecar is missing, stale, or does
not match the archive. The combined installer verifies pinned size before hashing, keeps its NSIS
include ASCII-only, and records whether Relay pre-existed so uninstall removes only an owned Relay;
unknown ownership preserves it. It writes only under `release/installer/` and leaves the frozen
MKB-02 directory artifact unchanged. Clean-account install, reboot, and uninstall verification remain
a human gate because this machine's live Relay and Browser must not be stopped.

Relay v16 is the current verified candidate for the combined installer. It accepts Browser contract
v4, preserves the v11 minimum for the signed retirement endpoint, carries version-aware installer
downgrade protection, and fixes operator-key delivery without requiring the key it is delivering.
The immutable archive is 33,342,752 bytes with SHA-256
`5c98cf460e62f83b484c9ecd55bc80b650f2e19a09e8ded6e99eafb682e1842e`; its full R2 GET/hash read-back
passed. The Browser `0.3.13` tuple remains draft and operational distribution remains blocked by
the current installer/provenance, live Windows, proxy, vendor, second-PC, identity, and canary
gates. The earlier v15 tuple is retained as historical evidence only.

The release-authority ceremony is complete and verified. The public receipt binds root key
`a6d3237649c2586e48b6e4fa744f7a089160fd80250fd29360513f5f625b146c`, delegated key
`6e5d47d894206e69e6464748333eb76c99b18da1f1b42ddafb2e3f265a7b786e`, and delegation expiry
`2027-08-14T00:00:00.000Z`. Two encrypted root backups are in separate physical custody, and the
required recovery rehearsal from backup B passed. The implementation consumes only the receipt and
public evidence; private backups, the passphrase, and the DPAPI-protected delegated private key stay
outside the repositories. Phase 05 is now complete in code — validation, activation, convergence,
bounded rollback, smoke, and revocation memory — and remains the MKB-04 NO-GO gate until the live
Windows evidence lands. See [release-signing-key-ceremony.md](release-signing-key-ceremony.md).

Phase 06 setup-conflict integration is implemented and locally verified. Relay v16 forwards the
additive Browser capability without weakening the existing ticket or retirement floors. The
combined installer persists its standard-user PowerShell detector beside MKT Browser. Contract v4
adds the runtime-dependent `local-install-ready-v1` capability only when that same detector accepts
the expected running Browser and Relay and finds no foreign process, fixed-port, MultiZen-process,
or startup-entry conflict. The Relay-first `/setup` journey no longer uses that Browser capability
as a handoff gate: it verifies Relay version, device ownership, registration, grant delivery, and
local configuration, while Browser data remains diagnostic. Browser profile operations retain their
separate managed-capability checks. Clean-Windows matrices, Browser distribution, identity, and the
unfamiliar-operator gate remain open.

**Team-installation boundary, updated 3 September 2026:** an authenticated operator may download the
current Relay ZIP from `/setup`, install its three packaged files, confirm the detected PC, and reach
the non-error `Waiting for administrator approval` or Relay `Ready` state. The page does not offer,
bundle, or require MKT Browser. Browser distribution stays blocked in its separate lane, and its
health appears only in support details. Operators never handle keys, tokens, ports, localhost pages,
or manual configuration; the first-device secret bootstrap remains a separate ADMIN-only local
ceremony.

The frozen MKB-02 Windows technical package was regenerated on 12 August at
`E:\MKTWorkspace\MKTBrowser\apps\desktop\release\win-unpacked\MKTBrowser.exe`; that checkpoint's
SHA-256 was `238d5d6fd5e373b052c484ceab90698f6dc295205a59be6573f9928b01db4f42`. Node guards passed 2/2,
W02 passed 8/8, MKB-01 passed 8/8, MKB-01E passed 7/7, MKB-02 passed 18/18, and
Windows packaging guards passed 3/3. That frozen checkpoint passed typecheck, build, and packaged
verification. Current Phase 00 remediation adds real workspace lint and CI/package quality guards;
23 packaging contracts, the complete Node 22 installer suite, lint, and typecheck pass on 14 August.
The historical desktop package was version `0.3.12`. Two distinct artifacts carried that checkpoint's
evidence and neither was releasable. The VM installer lifecycle passed on the local candidate built from source
`7849947` / tree `b060da0`, installer SHA-256
`ad1af433cea4070b5860a3c841d170bb1ef91ec3df33e2c11309acd0ba5d945c`. The 25 August recovery gates
ran on a dirty-source directory build, executable SHA-256 `50b0ccb3...5469` and `app.asar`
`7160c85a...a557`. Sandbox process restrictions prevent a cryptographic PID-to-image-path binding,
so the local lifecycle record is not release provenance.

That dirty source is now committed, and it was rebased onto the self-hosted verifier hardening, so
no commit reproduces those two hashes exactly. The behavioural difference is confined to dead-field
removal in DevTools port discovery plus CI workflow files, so the recovery verdicts still stand -
but the hashes must be regenerated from the frozen tree before any artifact is attested.

The attested combined installer was built 23 August from older source `eac77f8f` / tree `cce7b897`
and embeds the exact historical Relay v15 archive and manifest. It now trails the Browser fixes above and stays
quarantined, so it is not an approved rollout artifact. The packaged verifier proves contract-v4 capability
reporting, a profile-management-only tool inventory, deterministic managed create/retry, correlated
create/launch diagnostics, direct-launch and delete locks, endpoint-free proxy summaries, atomic
managed launch, Windows Chrome launcher-PID handoff, OS-assigned owned DevTools discovery,
per-iteration engine/timing evidence, sanitized process/listener failure snapshots,
process-confirmed close, and clean application/profile cleanup with no disposable Chrome process
left behind. Packaging retries
`rcedit` only for the transient `Unable to commit changes` failure; every other edit failure stops
immediately. The executable is still unsigned, so this is technical checkpoint evidence, not a
release, distribution approval, or pilot approval. The earlier dedicated-proxy exit-IP match remains
separate real-proxy evidence.

> **Language rule — 10 August 2026:** all new or materially revised project artifacts and product
> copy must be in English. Direct conversation with the project owner may remain in Vietnamese.
> The active MKT Browser records are maintained in English; historical records remain intact.

---

## Sổ cái lịch sử trước hợp nhất

Các bảng luồng A/B/C, đường găng cũ và danh sách blocker trước hợp nhất đã chuyển sang
[archive/development-roadmap-historical-pre-consolidation.md](archive/development-roadmap-historical-pre-consolidation.md)
ngày 02/09/2026, giữ nguyên văn. Chúng là ảnh chụp lịch sử, không phải sổ cái phát hành hiện tại —
trạng thái hiện tại nằm ở đầu file này.

## Đã kiểm chứng bằng thực tế

Danh sách này là ranh giới giữa "code có chạy" và "đã chạy thật". Bảng đầy đủ kèm bằng chứng ở
[README](../README.md#đã-kiểm-chứng-bằng-thực-tế).

| Việc | Ngày |
|---|---|
| Web chạy thật trên Railway: đăng nhập Google, kho sang đủ, lịch dò tự bắn đúng giờ team | 06/08/2026 |
| Sao lưu tự động lên R2 đi trọn vòng: app đẩy lên → tải về → khôi phục vào database rỗng, đúng 22 hàng/6 bảng | 06/08/2026 |
| Mở profile antidetect qua MCP | 02/08/2026 |
| Đẩy proxy vào profile, IP trong profile khớp proxy | 02/08/2026 |
| Bộ dò shadowban đọc HTML Reddit thật (bắt được 2 lỗi parser) | 03/08/2026 |
| Đăng thật lên Fanpage qua Graph API | 03/08/2026 |
| Posture GĐ3 đo thật trên production: máy chủ **không** giữ `VAULT_KEY_OPERATOR` — đọc qua Railway CLI, giá trị không lọt ra log hay file nào | 17/08/2026 |
| Sao lưu production kéo về được sau 9 ngày công cụ hỏng: client Postgres 18.4, 71 KB, 120 hàng / 14 bảng | 17/08/2026 |

**Chưa kiểm chứng:** đăng bằng nick Reddit thật, và lượt `npm run health` đầy đủ với nick thật +
proxy quan sát viên.

## Historical posting milestones

The targets below predate the September scope decisions. They are retained as historical context;
current delivery priorities are recorded at the top of this roadmap.

| Mốc | Điều kiện đạt |
|---|---|
| **M0B — Fork tương thích** | Windows build từ nguồn ghim mở được profile qua **proxy thật**, IP ra khớp |
| **M0C — Desktop pilot** | Bộ cài Windows + managed mode + rollback xanh trên máy A và máy ảo sạch đóng vai PC B trong 7 ngày. (Chốt 25/08/2026: PC B là **máy ảo**; bằng chứng phải ghi rõ là máy ảo, không được đọc thành ngang bằng máy vật lý — khác biệt phần cứng ở tầng host chưa được chứng minh.) (Sửa 17/08/2026: điều kiện này ghi "đã ký", mâu thuẫn với quyết định 12/08 ở bảng blocker phía trên — v1 phát hành **không ký** cho đội nội bộ. Bỏ chữ "đã ký"; SmartScreen hiện một lần và hành trình cài phải báo trước.) |
| **M0D — Nick thăm dò** | Một nick ít quan trọng đi hết 14 ngày cold-start, không sai IP/profile |
| **M1 — Kho danh tính có nick thật** | 8 nick Reddit + 3 nick FB đã nhập, mỗi nick một proxy tĩnh, cold-start đang chạy |
| **M2 — Bài đầu tiên lên Reddit** | Hết cold-start, xếp lịch qua hàng đợi, bộ luật cho qua, đăng tay thành công |
| **M3 — Vận hành đều 2 tuần** | 15-20 bài/ngày, không nick nào bị ẩn, `npm run health` chạy hằng ngày |
| **M4 — Bắt đầu Phase 05** | M3 đạt, có đủ dữ liệu tương tác để bộ luật đụng độ thread có nghĩa |

## Tiêu chí thành công tổng thể

- 6/8 nick Reddit sống và không shadowban sau 8 tuần
- Bạn MKT đăng được 15-20 bài/ngày trong ~1 tiếng
- 0 lần đăng trùng nội dung giữa 2 nick cùng nền tảng
- Có số liệu lead thật quy về được từng nick

## Rủi ro còn mở

| Rủi ro | Vì sao đáng lo | Đang xử lý bằng |
|---|---|---|
| **Nguồn nick kém** | Nick mua về chết trong 2 tuần đầu | Phase 00 tồn tại để phát hiện sớm, trước khi đổ content vào |
| **Content không đủ** | 3 người viết không nuôi nổi nhiều nick | Đã hạ quy mô xuống 5-8 nick |
| **Reddit mod là người thật** | Không có giải pháp kỹ thuật | Phụ thuộc chất lượng nội dung, không phụ thuộc công cụ |
| **Cold-start chưa chạy** | Đường găng thật, code đã đi trước khá xa | Không có cách nào ngoài mua nick sớm |
| **Fork trôi xa upstream** | Tự gánh bản vá Electron/MCP/profile migration | Repo riêng, module `mkt-*`, upstream SHA và contract test mỗi lần nhập bản vá |
| **Engine và app khác license** | MIT của MultiZen không tự cấp quyền phân phối binary engine | Gate license riêng, không bundle engine theo quán tính, SBOM/NOTICE mỗi release |
| **Không engine hiện tại đạt gate identity** | Cloak Stable `.2` không tạo được dataset; Brave trượt A/B/C, gồm restart drift và stable-subset collision | Không dùng nick thật, không khai identity isolation, không mở integration plan; chỉ một quyết định sản phẩm mới có owner và bằng chứng riêng mới được mở lại đường engine |
| **Hoãn macOS làm Windows ăn sâu vào lõi** | Viết thẳng hành vi Windows vào lõi thì MKB-07 phải mổ lại chứ không phải cắm thêm | Lõi chung + adapter OS mỏng cho path/autostart/kho khóa; test contract và mật mã đánh vào lõi |
| **Đến MKB-07 mới biết Mac vướng** | Rosetta, Gatekeeper, helper, Keychain hoặc WebRTC có thể lệch hành vi thật, và lúc đó team đã quen bản Windows | arm64 native là cổng cứng, notarization, hai máy Mac pilot; không cho nhân viên chạy `xattr` |
| **Redesign làm chậm fork** | UI riêng không giải quyết rủi ro profile/proxy | Giữ UX/UI MultiZen trong v1; MKB-06 để sau dữ liệu sử dụng thật |
| **Reddit đổi giao diện** | Bộ dò đọc HTML `old.reddit.com` sẽ hỏng | Hỏng thì báo "Không dò được", không bao giờ báo "khỏe"; `npm run health:smoke` đối chiếu Reddit thật |
| **Một seat licence, hỏng bẩn là đứng 15 phút** | Không còn key để xoay; browser chết bẩn khoá cả sản phẩm tới hết lease 15,1 phút | Gọi API kết thúc phiên lúc tắt (Phase 5, ưu tiên cao nhất); pool đã từ chối launch trước khi spawn và báo thời gian chờ thật thay vì báo lỗi mù |
| **Nhiều key tạo từ nhiều tài khoản** | CloakBrowser đếm phiên theo từng licence và **nhìn thấy `install_id`** — hai key đã bị đo chung trên một `install_id` ngày 23/08. Gom key từ nhiều tài khoản để lách trần free là thứ nhà cung cấp phát hiện được, và bị thu hồi giữa canary thì mất luôn bằng chứng | v1 chạy **một key, một tài khoản** — trần một seat khiến chỗ key thừa không cần dùng. Muốn N profile song song thì mua N seat trả phí, không farm tài khoản |

The original MultiZen feasibility risk closed on 02/08/2026. W01 and W02 now verify the Windows
technical fork, owned contract, port independence, and disposable consumer lifecycle, but they do
not prove pilot readiness. Runtime fallback has been removed; rollback is the frozen W01 checkpoint
and independently installed upstream application, not a dual-name adapter path.

## Ngân sách

| Khoản | Một lần | Hàng tháng |
|---|---|---|
| Nick Reddit cổ (8 cái) | 2-5 triệu | – |
| Nick FB (3 cái) | 1-3 triệu | – |
| Proxy tĩnh (11 IP) | – | ~700k |
| MKT Browser + engine ngoài | Chứng thư ký Windows: **0đ — chốt 12/08 không mua, tái xác nhận 25/08 là không có ngân sách; v1 dùng nội bộ nên chấp nhận SmartScreen**. Apple Developer vẫn **chưa chốt**, thuộc MKB-07 | **Chưa chốt** — engine mới nhất có thể cần subscription. Mỗi profile chạy song song tốn một seat licence riêng: v1 chạy một seat nên 0đ, muốn N profile cùng lúc phải mua N seat |
| Máy chạy | dùng máy sẵn có | 0đ |
| Thay nick hao hụt | – | ~500k-1tr |
| **Tổng** | **3-8 triệu + chi phí fork/ký chưa chốt** | **~1,2-1,7 triệu + engine nếu có** |
