# Project changelog

## 2026-09-22 - Packaged sequential reuse accepted; identity gate failed

- Confirm the licensed binary `--version` probe consumed the only provider session, then resolve
  CloakBrowser's Chromium version from verified pin/bootstrap metadata without executing the binary.
- Pass packaged Stage A on R27: `P1 -> P2 -> P1 -> P2`, 4/4 usable launches in 3.647-3.929 seconds,
  persistent separate storage, all native flags, graceful close, no surviving engine process and
  provider capacity back at `0/1` after every close.
- Complete R28 with five profiles twice and 10/10 clean launches. Fingerprint criteria A, B and C
  all fail, so `G2-IDENTITY=FAIL` and the ban on antidetect, identity-isolation and account-safety
  claims remain. Raw host-identifying evidence was deleted after redacted receipt verification.
- Fix cancellation races so close/app shutdown cannot start an engine after a capacity observation
  or cooling-hold persistence has been invalidated. Focused Browser and Web/Relay regressions pass.
- Keep delivery OPEN: Relay 18 artifact, two-process contention, real proxy/DNS/WebRTC, two clean
  builds, exact clean-VM installer lifecycle, second-PC, human acceptance and canary remain separate.

## 2026-09-21 - Fast sequential Cloak profile switching source checkpoint

- Add MKT Browser contract 5 with a generation-aware, bounded count-only capacity observer and one
  desktop coordinator for refresh, local admission, durable reservation, refusal invalidation, and
  one-attempt launch serialization. Enabled Windows CloakBrowser uses attached process ownership;
  `MKT_BROWSER_FAST_LICENSE_REUSE=0` retains the conservative detached/cooldown behavior.
- Add sanitized availability/reason/freshness/vendor-count fields and the authenticated
  `refresh_license_capacity` profile-lifecycle tool. Relay exposes an origin-checked local POST;
  Web uses a 10-second timeout and coalesced refresh flow that never launches or queues a profile.
- Preserve native fingerprint arguments, profile directories, managed authorization, proxy
  fail-closed behavior, and one local active profile even when vendor entitlement reports more.
  Aggregate count can retire a reconciled hold only as `expired`, never `confirmed-released`.
- Source verification passes: Browser focused 39/39, MCP/auth 37/37, MKB-02/MKB-03, typecheck,
  lint, builds and packaging (one intentional machine skip); MKTTool 2285/2285, focused 19/19,
  typecheck, lint and build. Root and both nested repository diffs pass whitespace checks.
- Keep live/packaged acceptance separate. No Cloak launch, attempt budget, Relay 18 artifact,
  commit, push, publication, deployment, or promotion occurred. Product switching, packaged
  contention, fingerprint A/B/C, proxy/DNS/WebRTC, second-PC, human, and canary remain OPEN;
  `G2-IDENTITY=FAIL` remains.

## 2026-09-21 - Licence capacity and engine integrity source checkpoint

- Record the correction of false vendor-release assumptions on clean close, process exit, and
  orphan cleanup. Use persistent local waits of 25 minutes after close and 30 minutes after
  refusal; one operator request makes one engine attempt, without automatic retries.
- Enforce CloakBrowser capacity in Web even without its capability flag, fail closed when capacity
  is missing, and show a sanitized optional earliest retry time when the pool is exhausted.
  Another cooling slot does not block a genuinely free slot; CFT capacity behavior is unchanged.
- Require valid checksums for new CloakBrowser downloads and preserve pinned CFT verification.
  Keep the existing unpinned development CFT path unchanged. Record harness pin-drift checks and
  sanitized `.6` provenance as source work, separate from complete measurement evidence.
- Add the [local retry policy](../../docs/licence-seat-retry-policy.md). Vendor timer reset remains
  a hypothesis; 25/30 minutes are local policy, not a vendor release guarantee. The one-shot quiet
  smoke still received exit `76` after 31.25 minutes. Browser correctly returned cooling with a
  30-minute retry deadline; no second launch followed. Successful real clean-close acceptance stays
  OPEN. Targeted Web validation passed 170 tests, typecheck and lint.
- Keep Cloak identity **BLOCKED**, historical `.2` `0/10` unchanged, and require five profiles with
  ten complete readings. No new release, installer, push, deployment, or operator promotion is
  recorded by this checkpoint.

## 2026-09-14 - Gates closed, two gates defined, and a secret-scan blind spot

- Close the proxied-launch gate on this host against the exact installed 0.3.23: real CloakBrowser
  engine, the installer's own WebRTC containment, and a correlated `PROXY_REJECTED` for the
  closed-port case followed by recovery. Host acceptance only; it does not close the second-machine
  gate.
- Close the packaged Relay gate against the archive the exact installer shipped, and separately
  rebuild the Relay from source and verify the fresh executable through the full ticket, sealing,
  restart, forced-termination and retirement cycle.
- Make live machine integration a required release step rather than an opt-in that had been skipped
  for four consecutive releases. `QUALITY_STEPS` goes from seven to eight; the hermetic
  `test:packaging` suite keeps its guard.
- Stop the Relay from asserting a wrong cause on `ENGINE_UNAVAILABLE` and `PROXY_REJECTED`. Both
  codes have several causes, and the old wording sent an operator to wait for an engine that was
  not loading, or to check a proxy that was alive.
- Extend the secret scan to tracked repository-root files. `README.md`, `AGENTS.md`, `package.json`
  and `.env.example` had never been in scope because the root list holds only directories. Teach the
  placeholder detector the Vietnamese placeholders this repository actually writes, so the gate stops
  crying wolf on its own examples.
- Record that a push to `master` here deploys production, at the top of `AGENTS.md` where pushes
  happen rather than in one clause of the workspace file. Eight deployments went out this way during
  the session; none touched `src/` or `app/`, so none changed server behaviour.
- Add the credential rotation runbook. Take a verified production backup with a passing restore
  check as the rollback point the rotation order requires.
- Keep Browser `0.3.23` promotion **NO-GO**. Remaining: second machine powered off,
  unfamiliar-operator walkthrough, seven-day canary at day 1, unsigned installer, and the credential
  rotation itself.

## 2026-09-13 - Team Web handoff boundary clarified

- Mark the MKTTool Web shared-workspace surface (`nick` vault, proxy ownership, Relay PC registry,
  and Relay-first setup) as the controlled internal team handoff.
- Keep Reddit/Facebook posting, TikTok posting, and ordinary-operator Browser distribution outside
  the handoff even though the parked routes and historical implementation remain in the repository.
- Mark Browser `0.3.23` promotion `HOLD / NO-GO`; retain the accepted `0.3.17` / Relay `17` tuple as
  historical evidence only because the current source and deployment approval are not the same tuple.
- Add the current [team-ready rollout guide](team-ready-rollout.md) and require the owner to confirm
  the actual `ALLOWED_EMAILS` roster before onboarding people.

## 2026-09-13 - Exact installer lifecycle and credential follow-up

- Verify exact Browser 0.3.23 installer clean `9/9`, repair `13/13`, and uninstall `15/15` on the
  restored Defender-enabled VM. Correct the local PowerShell 5.1 wrapper to retain the process
  handle before waiting; all three later bound receipts have exit 0. Prior wrapper failures remain.
- Keep real CFT activation, managed Relay/proxy lifecycle, frozen-source quality receipt, machine
  integration, human/hardware/canary, and full release acceptance OPEN. Do not promote the candidate.
- Rotate the Relay release-download token after a diagnostic output exposure. Verify old inherited
  credentials return 401 and refreshed User-scope credentials download exact v17 bytes over HTTP 200.
- Record remaining production-credential exposure as OPEN. Inventory and coordinated rotation are
  still required, particularly for encryption and signing keys with data/device dependencies.

## 2026-09-13 - Browser 0.3.23 compatibility publication

- Cut Browser `0.3.23` / Relay `17` candidate with byte-identical independent builds and the real
  CFT `152.0.7977.64` archive.
- Publish signed immutable compatibility sequences 23 and 24. Sequence 24 provides the direct
  migration path from the operator-approved sequence 21; no existing object was overwritten.
- Synchronize the Relay build token and verify full live HTTP GET/hash read-back for Relay v17 and
  all five sequence-23 compatibility artifacts. Keep operator promotion **NO-GO** pending exact
  CFT activation and clean-VM acceptance.
- Record product behavior: upgrade preserves engine cache; uninstall removes engine cache while
  retaining operator/profile data. Machine-integration, unfamiliar-operator, second-PC, canary,
  and unsigned SmartScreen/UAC evidence remain open.

## 2026-09-10 - Quality review source repairs

- Contain malformed Relay request targets and asynchronous page failures without terminating or
  hanging the local server. Keep unexpected rendering errors generic.
- Select the measured local Relay PC when requesting profile creation, including owners with
  multiple active devices; recheck ownership/revocation under a device lock before storing a profile.
- Protect account assignment against concurrent device revocation and reject stale account writes.
- Preserve exact vault secret input and remove plaintext fields before server submission; remove
  account-specific details from login redirect URLs.
- Refuse queue recheck updates after a job leaves its open states, retaining publication results.
- Add HTTP, PostgreSQL concurrency, browser UI, secret preservation and redirect regressions.
  These are source repairs; the accepted Browser/Relay installer bytes remain unchanged.

## 2026-09-10 - Browser 0.3.17 physical MSI acceptance

- Accept exact installer SHA-256
  `6d07fd4ef529b3505a8de385c7d0d3214258e8a020abbd00de51e8f9810a4ca8` on the physical MSI laptop.
  Browser 0.3.17, Relay 17, CFT 152.0.7977.64 and compatibility sequence 21 remain bound with no
  pending transition and Defender enabled.
- Pass profile/proxy launch, active-profile tray close, tray reopen, desktop shortcut reuse, explicit
  Quit, Windows restart, repair, uninstall and reinstall. Browser uninstall retains the independent
  Relay identity, profile data and active compatibility state.
- Record the repair prerequisite observed on the physical machine: stop the running independent
  Relay before retrying the combined installer. No configuration or identity reset is required.
- Replace stale Relay v16 literals in the installer publisher with the reviewed candidate's Relay
  version and add regression coverage. PRs #73 and #74 merged as `71bdafb1` and `d161dd52`;
  Railway deployment `54091ee1-f46e-4b8d-8bdb-d6d111ba5cd7` is successful for the latter commit.
- Publish the exact accepted installer under its immutable candidate key. Conditional creation and
  full GET/hash read-back pass. The production release probe reports complete metadata, and an
  authenticated download returns HTTP 200 with 146,047,736 bytes and the accepted SHA-256. The
  release is operator-available for controlled internal Windows x64 use.

## 2026-09-09 - Browser IP observer correction (candidate only)

- Reject 0.3.16 activation evidence after its browser-page IP probe receives a Cloudflare HTML
  challenge despite a valid TLS connection and successful Node proxy preflight.
- Prepare Browser 0.3.17 / Relay 17 candidate metadata. The Browser uses an IP-only HTTPS observer,
  requires exact egress equality and fails closed on redirects or malformed addresses with safe
  operator errors. Nine regression cases fail before; 12/12 smoke tests pass after.
- Preserve exact 0.3.16 installer, clean install/nonblocking notice/tray/cold-login passes and
  separate activation failure. Disposable CFT observer diagnostics are not installer acceptance.
- New frozen A/B build, signed metadata, VM lifecycle and physical MSI acceptance remain OPEN.
  No replacement upload, publication or deployment has occurred.

Records behavior-changing milestones by date and delivery phase. Internal cleanup is omitted.
Current delivery status lives in [development-roadmap.md](development-roadmap.md).

The product is still an internal `0.1.0`; milestones are grouped by delivery phase rather than
semantic versions.

Older entries move to archives when the live file approaches the 800-line documentation limit:

- [12 August 2026](archive/project-changelog-12-august-2026.md)
- [7 to 11 August 2026](archive/project-changelog-07-to-11-august-2026.md)
- [5 to 6 August 2026](archive/project-changelog-05-to-06-august-2026.md)
- [Through 4 August 2026](archive/project-changelog-den-04-08-2026.md)

Historical entry prose remains unchanged. Only relative link destinations change when required by
the archive location.

---

## 9 September 2026 - Reproduced single-entry installer; release held

- Retained 0.3.15 is rejected: its synchronous Relay failure dialog blocked installed Browser MCP
  until dismissed. Prepare Browser 0.3.16 / unchanged Relay 17 with asynchronous, deduplicated
  notification and preserved ownership checks. Five notification regressions pass; independent
  builds, signed metadata and exact VM/MSI acceptance remain required. No publication or deployment.

- Fresh release security scan found critical Next.js and high sharp production advisories. Raise
  Next.js and matching ESLint config to 16.3.3; lock sharp 0.35.4. Production audit passes with
  the patched lockfile. Full frozen checks and exact VM acceptance remain required; no deployment.

- Exact 0.3.14 / Relay 17 VM activation reached smoke but failed because Browser required its own
  download index despite an already installed, pinned engine. The next 0.3.15 candidate recognizes
  the stable runtime against the signed version and retains unchanged Relay 17. Actual bootstrap
  regression fails before the correction; four focused tests pass afterward. No new acceptance or
  publication claim; the failed exact installer and VM snapshot remain preserved.

- Replacement Relay 17 build uses relative SEA paths to prevent checkout location from changing the
  delivered executable. Fresh A2/B2 EXE, ZIP and metadata are byte-identical. Candidate Browser 0.3.14
  pins the retained Relay archive. Installer validation uses the reviewed candidate Relay version and
  rejects stale/future Relay metadata even with explicit tuple approval. Updated exact health,
  provenance and version fixtures; 84 focused tests pass. Full frozen gates and VM/MSI remain open.

- VM signed activation exposed a Relay v16 shutdown defect: already-absent runtimes caused a false
  PowerShell exit 1 and left the transition at `stopping`. Corrected successful completion and
  process-handle shutdown; new real Windows process tests cover absence, exact ownership, unrelated
  same-name retention and repeatability. All 450 Relay tests, full typecheck and lint pass. This source
  fix is not delivered in retained A; a new tuple and exact-installer acceptance are required.
- Build B matches A's 129-file normalized delivered payload; raw outer installer bytes differ.
  Exact retained A remains Browser 0.3.13, SHA-256
  `25e8fc156c0769245623dfc7b082cd9f88886b3516fbca24ea9509114928e8a3`.
- Prepared candidate `20260909-browser-0.3.13-relay-16-single-entry-5ff43b2`, immutable installer
  storage key, and exact Relay v16/CFT 152.0.7977.64 publisher validation. The quarantined legacy
  installer object remains untouched; deployment approval still gates operator availability.
- Signed compatibility sequence 17 validates all five artifacts, authority and fresh-install
  transition from 0. It does not authorize migration from sequence 16 or add Authenticode to the EXE.
  Source checks pass: 57/57 DB-free tests, full typecheck and lint. No artifact upload or deployment.
- Exact clean VM install passes 9/9; profile activation stops at the missing verified CFT pin.
  Tray close passes with no active profile. Separate fresh 1-vCPU repair passes 13/13 and Browser-only
  launch starts an absent owned Relay. Cold-login service startup and uninstall 15/15 also pass;
  cleanup leaves no product processes/listeners/firewall or test tasks, preserves data and keeps
  Defender enabled. Signed activation, active-profile lifecycle, tray reopen/Quit, independent
  Relay retention and MSI gates stay open. The owner will run the checklist after VM acceptance.
  See the [current acceptance checkpoint](development-roadmap.md#single-entry-installer-acceptance---9-september-2026).
## 9 September 2026 - Production dependency advisories patched

- **Dependencies:** Next.js and `eslint-config-next` move to 16.3.3, closing critical advisories
  GHSA-p293-qw3h-jr36 and GHSA-2xp9-vwfh-vxw4. sharp locks to 0.35.4, closing high advisory
  GHSA-rgj7-g3m4-5g8c. The deployed lockfile had resolved Next.js 16.3.0 and sharp 0.35.3, both
  inside the affected ranges.
- **Exposure:** `_next/image` is excluded from middleware authentication by design, so the image
  optimization route answers unauthenticated requests. That is the surface the Next.js advisory
  describes, which is why this ships separately rather than waiting for candidate acceptance.
- **Scope:** dependencies and documentation only. No release-candidate metadata, Browser, Relay,
  engine-pin, or acceptance-state change occurred in that patch. Physical MSI acceptance completed
  separately on 10 September.

## 8 September 2026 - Single-entry Browser startup candidate

- **Desktop source:** normal packaged Windows launches activate one Browser manager and check/start
  the verified installed current-user Relay. Usable tray keeps profiles running when the manager
  closes; explicit Quit closes profiles and Browser control, leaving Relay available for vault use.
  Development, disposable roots, and compatibility smoke are excluded.
- **Installer source:** Browser becomes the sole owned login entry. Exact-target shortcut checks
  protect foreign entries; uninstall restores standalone Relay startup when that Relay is retained.
  No automatic enrollment, ownership repair, or retirement restart loop is added; Relay v16 bytes
  and the frozen installer tuple are unchanged.
- **Web source:** only a measured version below the effective create-profile floor (currently 13)
  displays **Relay update required**. Browser/runtime, transport, setup, and unknown states have
  safe causes and **Check again**; raw failure details are not rendered.
- **Checkpoint:** lifecycle tests **11/11 PASS**; fresh full Browser/Web lint and typecheck PASS.
  Browser `test:installer` exits 0 with authentic frozen MKTTool sibling `b4ef969b`; skipped machine
  integration stays OPEN. Web DB-free regressions **44/44 PASS** and real Chromium fixture PASS;
  the fixture is not MSI evidence. Browser re-review has no findings after three P2 fixes.
  Browser production audit passes with no suggestions; critical coverage passes 121/121, zero
  skipped, across 14 protected modules (91.48% lines, 84.23% branches, 91.39% functions).
  Browser two-build comparison, new-installer delivery, and MSI acceptance remain OPEN.
- **Initial hosted gate:** PR #70 CI `34237885978` failed the existing setup-link source-location
  assertion after the link moved into the readiness helper (1 failed / 2,122 passed / 17 skipped).
  Contracts, audit, secret scan, and Windows Relay executable passed. The test now follows the
  extracted helper and real status rendering; Chromium also asserts the exact download href.
  Local follow-up: 47/47 DB-free tests, full typecheck/lint and the browser fixture passed.
- **Web delivered:** PR #70 merged as `8e80fcff` after CI `34244893863` and secret scan
  `34244893848` passed at `9b63442b`. Full tests and coverage each report 2,124 passed / 17 skipped,
  228 passing / three skipped files. Coverage: 81.01% statements, 76.59% branches, 82.34% functions,
  83.59% lines; build passed. Railway `e68597cb-4679-4115-85cf-605baff7d6d9` and GitHub deployment
  `6331220213` verify SUCCESS for exact `8e80fcff`; public health returned HTTP 200/ready with all
  checks OK and Relay 16. Post-merge CI `34245676858` and secret scan `34245676970` passed, with the
  same full-test/coverage counts and successful build. Post-merge Relay executable is policy-SKIPPED;
  its earlier PR result remains separate PASS evidence.
- **Browser delivery hold:** source `5ff43b27` is pushed, not merged to main. Frozen build A quality
  and unsigned installer packaging passed; no publication or installation occurred. Build B
  dependencies are installed, but comparison and clean-VM/physical-PC acceptance wait for RAM/disk
  reserves. This is a resource blocker; the prior frozen installer is unchanged. The retained A
  artifact and exact hashes are in the
  [candidate checkpoint](../../plans/260908-2130-single-entry-browser-startup/reports/browser-candidate-checkpoint.md).
  See the [startup checkpoint](development-roadmap.md#single-entry-browser-startup---8-september-2026).

## 8 September 2026 - Owner cleanup for an already-revoked Relay PC

- **Web candidate:** the owner can begin, complete, and finalize signed cleanup only for their
  exact already-revoked record; every server step rechecks access under the transaction advisory
  lock. ADMIN retains active retirement/unpinning; owner cleanup never unpins accounts.
- **Recovery copy:** Setup uses **Finish local cleanup** for the exact owned revoked binding;
  other conflicts remain ADMIN. Pending receipts route to recovery without asserting owner match.
  Completion leads to restart Relay, return to Setup, and register a fresh identity.
- **Review correction:** a P2 RSC-remount issue could erase success-only next-step instructions.
  The receipt control now keeps conditional restart/Setup guidance naming the PC; the fix was
  reviewed as addressed with no new findings.
- **Preserved:** signed recipient proof, durable finalization, local ID/public-key checks, v11+
  floor, Relay v16, binaries, and migrations. Browser and frozen-installer gates remain separate.
- **Evidence:** RED backend 9 FAIL / 5 PASS; Setup state 2 FAIL / 29 PASS. Corrected local run:
  226/226 tests across 23 files on loopback `mkttool_test`; full-project typecheck/lint, 20-file
  scoped secret scan, and diff check PASS. Backend specification/quality and adversarial reviews
  found no findings. UI rerun 17/17 PASS; final full-project typecheck/lint rerun PASS.
  Deployment and real MSI/physical-PC acceptance remain OPEN. See the
  [owner-cleanup checkpoint](development-roadmap.md#relay-owner-cleanup---8-september-2026).

## 8 September 2026 - Relay download public-origin hotfix

- **Fixed in the Web candidate:** the authenticated `/api/relay/download` redirect now uses the
  existing `appUrl` helper instead of `request.url`. This preserves the browser-visible Host and
  forwarded protocol instead of sending the second PC to `localhost:3000/api/relay/download/v16`.
- **Local regression evidence:** pre-fix run 4 FAIL / 12 PASS; corrected run 16/16 PASS, comprising
  seven route regressions and nine existing URL-helper tests. Authentication 401/403 and missing
  release 404 behavior remain unchanged.
- **Expanded checks:** 99/99 targeted tests, full-project typecheck/lint and scoped secret scan pass;
  independent code review found no scoped findings. Railway build remains pending.
- **Scope:** Web-only fix; frozen Browser/Relay artifacts unchanged. Deployment and the corrected
  download on the physical second PC are not yet verified; this is not product-readiness evidence.
  See the [hotfix checkpoint](development-roadmap.md#relay-download-public-origin-hotfix---8-september-2026).

## 8 September 2026 - VM startup repaired; first-run release remains blocked

- **Fixed Browser startup:** `c7e17429` reuses a short-lived shell for fresh serialized CIM queries;
  exact ownership, signed tickets, proxy fail-closed behavior, and 15-second readiness stay intact.
  Two real VM managed-lifecycle runs passed, including reboot and broken-proxy refusal/recovery.
- **Changed fresh settings:** `36939cdd` defaults to CFT while preserving explicit saved selections.
  Local checks passed: 391 tests / 1 intentional host skip, typecheck/lint, and critical coverage
  91.48% lines / 84.23% branches / 91.39% functions. Independent reviews reported no findings.
  Browser source is pushed with `0/0` remote parity; no new Browser PR, CI trigger, or merge occurred.
- **Delivered Web harness:** PR #68 merged as `46a99f2b`; post-merge CI `34171586969`, deploy
  verification, Railway production, and secret scan `34171586987` passed. Post-merge Relay executable
  verification was policy-skipped; the earlier PR executable PASS is independent evidence.
- **Release still blocked:** the new unsigned installer passed clean VM install 9/9, initial
  uninstall 15/15, fresh-snapshot repair 13/13, and post-repair uninstall 15/15; Defender enabled,
  data preserved, exact process/task/firewall cleanup passed. Normal installed CFT reports engine error without
  overrides: no active compatibility pin or runtime. Browser CI artifact storage and first-run
  activation remain blocked. Network/operator/canary evidence remains OPEN;
  no Browser publication, host installation, identity claim, or historical-gate promotion occurred.
  See the [current closeout checkpoint](development-roadmap.md#ready-to-use-closeout-checkpoint---8-september-2026).

## 8 September 2026 - finishing-pass evidence, release still blocked

- **Verified locally:** Browser `ad0c7182` / `0.3.13` with README-only working diff; lint/typecheck,
  installer suites (374 passed, 1 live-machine skip), critical coverage, pinned CFT packaged fixture
  (1/1), and exact Relay v16 executable (35 checks) passed. No production engine pin changed.
- **Verified on a disposable clean VM:** install 9/9, initial uninstall 15/15, fresh-snapshot repair
  13/13, and post-repair uninstall 15/15 passed with Defender enabled and operator data preserved;
  repair recorded no threats.
- **Managed lifecycle verification failed:** the VM attempts stopped at DevTools discovery and,
  on diagnostic retry, CFT version inspection. Full lifecycle acceptance remains OPEN; this is not
  a proxy-leak or vendor-failure finding. Independent proxy probes passed distinct exit, but
  browser-page IP/DNS/WebRTC containment, operator acceptance, and seven-day canary remain OPEN.
- **Hosted blocker:** run `34002472571` attempt 5 again failed artifact upload on quota after package
  build; packaged-contract skipped and PR #17 stays unmerged. Organization-admin quota/access action
  is required before another retry. Local/VM passes do not replace GitHub Actions.
- **Release boundary:** the [new local candidate](./internal-beta-release.md#finishing-pass---8-september-2026)
  is unsigned, unattested, and unpublished. Historical tuples remain unchanged; Browser distribution
  and real accounts remain NO-GO, Lane C stays CLOSED, and `G2-IDENTITY=FAIL` remains recorded.

## 8 September 2026 - profile and proxy product direction accepted

- **Changed product direction:** the owner accepted MKT Browser as a browser profile manager with
  proxy binding. Priorities are Proxy vault, Relay handoff, and reliable manual profile operations.
  Antidetect/identity-engine research is closed; security and compatibility maintenance continue.
- **Clarified scope:** Lane C stays CLOSED and `G2-IDENTITY=FAIL` remains recorded. Browser use stays
  within bounded demonstrations with disposable data and human input. The decision does not publish
  a Browser installer or approve team distribution, real accounts, or engine integration.
- **Documentation:** canonical terminology, product requirements, README entry points, roadmap, and
  release guidance now reference the [accepted decision](project-overview-pdr.md#product-direction-decision---8-september-2026).
  Older posting targets are marked historical. Runtime, schema, authorization, and engine pins are
  unchanged; no release gate is newly marked PASS.

## 6 September 2026 — documentation joins the secret gate

- The local and hosted secret scan now cover `docs/` as well as source, scripts, workflow files,
  and plan evidence. The hosted scan has its own inexpensive workflow, so documentation-only
  changes remain protected without starting the database, coverage, build, or Windows Relay jobs.
- Credential-shaped documentation examples use explicit placeholders, and collected regression
  tests prove both non-leaking findings and the Relay PC locality rendering contract.

## 5 September 2026 — the web UI becomes a calm operations console

- **Hierarchy follow-up:** the Relay PC registry replaces its five-column table and nested technical
  cards with one scan-first row per PC. Key actions appear once, technical and maintenance controls
  stay collapsed, and revoked PCs become a closed historical section. Nick and proxy indexes reduce
  visible columns, fold lifecycle and endpoint data, and use the same larger action and section type.
- **Desktop scale is bounded:** the full signed-in shell now centers inside a 1600px canvas with
  black outer gutters on wider displays. Pages, alerts, and the top bar share a narrower 1152px
  content frame, while tablet and mobile layouts still use the full viewport without root overflow.
- **Clear route ownership:** Home is now **Workspace overview**, separate from **Nick vault**.
  **Proxy vault**, **Relay PCs**, and **Set up this Relay PC** each use the same page hierarchy,
  content width, typography, surfaces, and responsive navigation.
- **Lower decision density:** Home cards and vault tables keep one primary status and one next action
  visible. Nick, proxy, ownership, Relay, and lifecycle data are grouped by operator decision instead
  of exposed as long flat tables.
- **Scan-first status language:** Relay readiness is the dominant Home signal; shared icon-first
  metrics summarize the Home, Nick vault, Proxy vault, and Relay PC indexes. Nick cards reduce owner,
  Relay PC, and proxy state to three compact signals instead of stacked explanatory sections.
- **Progressive disclosure:** proxy speed tests, Relay PC IDs and public keys, package checksums,
  compatibility controls, manual registration, and destructive Relay PC actions remain available but
  no longer compete with daily work. Rollout and launch-blocker details stay expandable, while each
  operational alert always retains its concise first sentence.
- **Whole-route consistency:** Content, Queue, Facebook, Targets, and Health history routes now use
  the same page headings, icon-led summaries, status badges, cards, forms, and disclosures. Tables
  become labeled record cards at 375px instead of forcing horizontal reading.
- **Complete system states:** login, empty results, confirmations, destructive controls, route
  errors, and not-found pages share the same dark industrial surface language and 44px targets.
  Browser-profile creation and first sign-in now lead with scannable steps while keeping identity
  isolation and human-handoff caveats available in details.
- **Behavior preserved:** routes, schema, permissions, setup state machine, ticket encryption,
  ownership rules, and parked-platform scope are unchanged. Blocked profile launches now lead to the
  relevant recovery surface instead of presenting a dead disabled control.

## 3 September 2026 — proxy reassignment becomes ADMIN-only and auditable

- **PR #55 authorization decision closed:** `updateAccount` now requires ADMIN when the normalized
  submitted `proxyId` differs from the stored value. Operators retain shared edits when proxy stays
  unchanged, including karma, status, and voice.
- **Role-aware edit form:** ADMIN keeps the proxy selector and confirmation-on-real-change behavior.
  OPERATOR sees the current proxy read-only and the primary contact derived from `ADMIN_EMAILS`.
- **Assignment audit evidence:** `ACCOUNT_UPDATED` detail records proxy and browser-profile ID
  before-to-after values only when they change, inside the existing account-update transaction and
  without proxy endpoints or credentials.
- **Authorization boundary preserved:** browser-profile ID changes remain available under the prior
  policy and now leave an audit trail. Whether to restrict them like proxy assignment remains a
  separate owner decision. No migration or rollout-scope change was made.

## 3 September 2026 — shared-use safety rejects stale account writes

- **Ownership is visible:** Home and `/accounts` now show each nick's owner and Relay PC. Missing
  device assignment is labeled as missing instead of “Local PC”, and launch conflicts surface the
  server's cleaned owner/device reason.
- **Confirmations are consequential:** owner/Relay PC, proxy, and compatibility confirmations appear
  only for real value changes. They show before/after values; compatibility updates require the exact
  PC name and warn before confirmation that Relay and MKT Browser restart.
- **Stale forms fail closed:** account edit and cluster assignment carry the rendered
  `Account.updatedAt` revision and write with a conditional `updateMany`. The account update plus its
  audit row is transactional; cluster updates plus all assignment audit rows are transactional. A
  stale loser returns before audit or queue-recheck side effects.
- **Real PostgreSQL regression coverage:** sequential winner/loser tests reuse one initial revision
  and prove the loser changes no account fields, timestamp, audit rows, or queued-job verdict state.
  No schema migration or app-wide lock was added.

## 3 September 2026 — setup becomes Relay-first

- **Existing Relay release becomes the entry point:** `/setup` now starts with the authenticated
  Relay download, continues to current-PC registration, and ends with nick/proxy handoff.
- **Dead UI is wired back into the route:** `RelayDownloadSection` is rendered by `/setup`, so the
  historical `/relay-download` redirect and every `/setup#download` link land on a real anchor and
  visible download control.
- **Browser leaves the critical path:** the MKT Browser installer CTA and release metadata are gone
  from setup. Browser health no longer determines Relay PC registration; it remains visible only in
  collapsed support details plus a secondary blocked-lane notice. Profile operations retain their
  separate Browser checks, and this flow grants no distribution or identity-isolation approval.
- **Boundaries unchanged:** Relay release/auth routes, Browser APIs, schema, ownership rules, and
  `G2-IDENTITY=FAIL` remain unchanged.

## 3 September 2026 — nick-vault navigation and vocabulary

- **Nick vault is discoverable:** the left rail now includes `/accounts`, and all five navigation
  labels remain visible without hover.
- **Home matches the product scope:** the main heading, CTA, counts, filters, and empty states now
  describe the team nick vault. The CTA opens `/accounts`; Home no longer presents TikTok browser
  profile creation as the primary next action. `TeamScopeNotice` and rollout-scope behavior are unchanged.
- **False header signals removed:** search now lives on Home and filters visible nick fields. The
  non-working global search, `Ctrl K` hint, and untrustworthy global running/total counters are gone;
  accurate local browser profile state stays on Home.
- **Canonical UI terms documented and applied:** **nick** means the shared `Account` record,
  **browser profile** means local data on one PC, and **Relay PC** means the registered
  `RelayDevice`. This is display copy only; setup behavior, ownership/concurrency rules, routes,
  database fields, models, and parked platform scope are unchanged.

## 3 September 2026 — workspace handoff and role-aware recovery copy

- **Workspace handoff unblocked:** `/setup` now calculates workspace readiness from Relay, account
  proxies, the observer proxy, accounts, and owner/device assignment only. Browser installer
  availability is informational, while targets, content, and queue remain a separate posting
  checklist that appears only when a platform re-enters rollout scope.
- **Proxy empty states follow role ownership:** ADMIN keeps the add-proxy path. OPERATOR sees that
  proxy supply is an ADMIN responsibility, receives the primary contact derived from
  `ADMIN_EMAILS`, and can wait instead of being sent to a button they cannot use.
- **Login copy is operator-safe:** the rejected Google email and administrator contact remain
  visible, but environment-variable, CLI, and OAuth configuration details move to server logs. No
  allowlist contents are disclosed.
- **Parked copy matches the 2 September boundary:** `FACEBOOK_PAGE` renders as “Facebook Fanpage”,
  parked routes say they are history-only and cannot post, and both banners and action results point
  operators back to `/accounts`. The rollout environment variable and parked routes are unchanged.

## 2 September 2026 — first fingerprint-gate application rejects Brave

- **Brave measured at the declared pool:** official `v1.94.117` ran as five disposable profiles,
  twice each, against exact-revision same-machine CFT. The extended harness covered every declared
  context/surface combination and all ten launches closed through `Browser.close`.
- **All three criteria failed:** A recorded `65` restart and `20` cross-context mismatches; B found
  `62`/`63` stable components and all `10/10` profile-pair collisions in both runs; C rejected
  restart-drifting audio/canvas plus invariant UA-CH and available-screen differences.
- **Audio finding:** Brave did not emit one invariant vendor audio mark. Seven components matched
  stock and five rendered hashes varied by profile, but those hashes changed after restart, so the
  result was not a persistent profile identity.
- **Engine decision:** Cloak Stable `.2` remains `BLOCKED` with `0/10` valid current readings, and
  Brave independently fails A/B/C. No Brave integration plan is authorized; `G2-IDENTITY` remains `FAIL`.
  Product docs continue to describe MKTBrowser as a profile/proxy/ownership manager without an
  identity-isolation claim. The workspace owner signed and approved the written Phase 05 `NO-GO`.

## 2 September 2026 — Reddit and Facebook withdrawn from rollout scope

- **Scope decision:** Reddit and Facebook leave the team rollout scope. No code was deleted; the
  posting-safety pipeline, Facebook Pages publisher, and health checks stay implemented and
  deployed. The team-facing surface narrows to the account vault, proxy ownership, and the
  operator-device registry.
- **Docs realigned:** README, the internal beta boundary, the team operating guide, and the roadmap
  now state the narrowed scope. The operating guide carries a stop banner over the posting sections
  rather than a rewrite, because the screens still exist and still work.
- **Not enforced in code:** `TARGET_PLATFORMS` is unchanged, so nothing fails closed on this
  boundary. It holds by agreement.
- **Concurrent-posting race fixed beforehand:** the Facebook publish path and the shared
  mark-posted path claimed rows with a read-then-write sequence, so two operators could put two real
  posts on a Page, and one post could leave two Interaction rows that skew the quota, promo-ratio,
  and thread-collision rules. Both now claim with a conditional update, covered by a concurrent test
  that fails against the previous code. Kept despite the scope change: the code stays in the tree,
  and a latent race is not a good thing to leave behind a door that may reopen.

## 1 September 2026 — Lane A signed CONDITIONAL GO and incident mitigation

- **Production stability restored:** hardening deployment `0a696033` at commit `2734e2f0` recorded
  947/947 `/api/healthz` HTTP 200 responses over 24 hours and a fresh 24/24 ready burst. OOM and
  restart explanations are not supported by the available metrics; the historical external R2
  slowdown trigger remains unconfirmed.
- **Relay route reverified:** an authorized `/api/relay/download/v16` full GET returned 33,342,752
  bytes with exact SHA-256 `5c98cf460e62f83b484c9ecd55bc80b650f2e19a09e8ded6e99eafb682e1842e`.
  Proxy streaming remains the current contract because the pinned installer rejects redirects and
  depends on Range/resume behavior.
- **Fleet migration partial:** one owner machine completed the 0.3.13 reinstall and reports Relay
  v16. The second machine remains unobserved, so `MIN_RELAY_VERSION` remains 13 and v15 is not
  revoked.
- **Lane A bounded smoke passed:** production OAuth/admin access, Facebook token refresh,
  destructive confirmation without submission, the 09:00 scheduler record, and the 03:00 R2 backup
  record were verified. Queue was empty, so no post was submitted.
- **Owner decision recorded:** the workspace owner signed CONDITIONAL GO for Lane A on 1 September
  2026 and accepted residual risks 1–8. Browser P4b remains OPEN and Lane C remains CLOSED.

## 30 August 2026 — consolidation and Lane A reconciliation

- **P4a Web deployed:** merge `380962a4` reached Railway successfully; `/api/healthz` returned
  200 and the authorized Relay v16 full-GET/hash matched the immutable object. The service-instance
  healthcheck is `/api/healthz`.
- **Browser remains separate:** source is 0.3.13 with P4b installer/five-artifact provenance OPEN;
  the old 0.3.12/v15 material is historical negative evidence, not a release tuple.
- **Lane C is CLOSED:** no CloakBrowser channel exists, so no vendor request, date, or “coming soon”
  promise is recorded. A future alternative vendor requires a new product decision.
- **Fleet boundary:** Q15 confirms both v15 devices are the owner's machines; migration is
  self-serve and route-first, with the floor held at 13 pending observed reinstalls.

The detailed evidence and rollback tuple are in the successor consolidation plan under
`plans/260830-0830-consolidation-and-lane-a-release/`.


## 29 August 2026 - Controlled internal beta published and scope frozen

MKTTool Web/Facebook is the normal internal handoff. MKT Browser `0.3.12` was rebuilt from clean
source `6d1b0a2` / tree `db389a54`, verified under Node `22.23.2`, and published to the authenticated
R2 setup channel with installer SHA-256
`d570ccc3326b5a046d91b7b677f4232ab76908f2fb034c60799e31695f43fc4b`. R2 read-back confirmed the
version, size, checksum, and bundled Relay v15 metadata. The packaged runtime/profile lifecycle
contract passed `1/1`, MKB-02 passed `135/135`, MKB-03 passed `31/31`, packaging contracts passed 34
with the explicit live-machine check skipped, and the production dependency audit reported no
suggestions. MKTTool passed 1,922 tests, typecheck, lint, and production build.

The release is a controlled Windows x64 beta: admin-led enrollment, one profile at a time, human
login/posting, and no token/key copying. Broad Browser rollout remains NO-GO: G1 input, G2 network,
G3 licence, G4 operator, and G5 canary remain open, while G2 identity remains FAIL. Custom Chromium,
the prebuilt-engine orchestrator, macOS, concurrency, updater/signing, and posting automation are
deferred. See [internal-beta-release.md](internal-beta-release.md).

## 27 August 2026 - Real power-cycle recovery passes and closes G3

The root-cause Browser candidate at source `55b8587` replaces the slow Windows listener/process
provider path with bounded native `netstat.exe`, absolute system PowerShell, and double process and
listener snapshots. Identity or ownership changes, ambiguous inspection, invalid system roots,
timeouts, and oversized output continue to fail closed. Fresh Node `22.23.2` verification passed
`test:mkb02` 135/135, targeted Windows ownership/runtime tests 42/42, typecheck, and lint.

The final owner-approved disposable-VM rerun passed the real power-cycle gate. Before the cut, the
exact lease was `active`, capacity was `total=1/free=0/active=1/pendingRecovery=0/cooling=0`, the
pinned Browser/profile processes were alive, and every gate task was demand-only. The host then
issued one `VBoxManage controlvm poweroff`. Before app startup after boot, the boot identity had
changed, no Browser process remained, and the exact lease was still stranded `active`. Startup moved
it to `cooling` with `pendingRecovery=0`; capacity returned to one free seat after the vendor TTL;
the same profile relaunched and then closed to `confirmed-released` with no profile Browser process
remaining.

Evidence:
`local-test-artifacts/phase5/real-power-cycle-recovery-evidence-20260827-ownership-fix-r2.json`.
This supersedes/resolves `REBOOT_LEASE_STUCK_PENDING_RECOVERY`,
`VM_PRECUT_ACTIVE_CHECKPOINT_UNAVAILABLE`, and `GATE_STATE_NOT_DURABLE_ACROSS_POWER_CYCLE` as current
blockers. `G3-RECOVERY` is **PASS**. The existing licence key was kept; no revoke or rotation was
performed, and no key value is retained in evidence. Rollout remains **NO-GO** because other gates
remain open; no Phase 2, Phase 5, or Phase 6 work starts.

## 27 August 2026 - Ownership-fix power-cycle rerun stopped before the gate

The Browser ownership candidate at source `55b8587` replaces the slow per-query
`Get-NetTCPConnection` child with bounded native `netstat.exe`, uses absolute Windows system tools,
and rechecks both process identity and listener ownership to keep the DevTools boundary fail closed.
Fresh Node `22.23.2` verification passed `test:mkb02` 135/135, typecheck, and lint.

The bounded disposable VM continuation did not produce recovery evidence. Review found that the
scheduled task actions named files that were not transferred under those names, and that the
PowerShell settings writer emitted a UTF-8 BOM which `SettingsStore` rejected, producing capacity
`total=0`. Both harness defects were corrected locally, and native `tar.exe` replaced a pathological
`Expand-Archive` preparation path. No `gate-state.json` with an active lease was validated, so no
checkpoint-qualified recovery power-cycle was made; preparation and cleanup poweroffs are excluded.
The disposable clone was reset, powered off, and deleted.

Evidence: `local-test-artifacts/phase5/real-power-cycle-recovery-evidence-20260827-root-cause-review.json`.
`G3-RECOVERY` remains **OPEN** and rollout remains **NO-GO**. The owner chose to keep the existing
licence key; no key value is retained in evidence, and later gates must stream it without logging.

## 27 August 2026 - Real cut rejected because the checkpoint was not durable

The bounded root-fix rerun reached a real active lease and returned the complete pre-cut tuple before
the host issued one `VBoxManage controlvm poweroff`: `checkpointValid=true`, `active`, capacity
`total=1/free=0/active=1/pendingRecovery=0/cooling=0`, pinned Browser/profile processes alive, and
demand-only tasks. After boot, the exact lease was still `active` and no Browser process survived, but
the `cutCheckpoint` update was absent from `gate-state.json`. The state writer had acknowledged the
write without forcing it through the guest filesystem, so the power-cycle cannot be accepted as
recovery evidence. This is a harness durability blocker, not a product recovery PASS or FAIL.

The gate now writes checkpoints with a write-through handle and `Flush(true)`, and post-boot requires
the persisted checkpoint plus a bounded boot window. Evidence:
`local-test-artifacts/phase5/real-power-cycle-recovery-evidence-20260827-durable-checkpoint-review.json`.
`G3-RECOVERY` remains **OPEN** with `GATE_STATE_NOT_DURABLE_ACROSS_POWER_CYCLE`; rollout remains
**NO-GO**, and no Phase 2, Phase 5, or Phase 6 work starts.

## 27 August 2026 - Packaged Relay v15 preserves spent tickets across restart

The real packaged Relay v15 process was stopped and started with an isolated disposable home.
The device identity stayed stable across the restart, replay of the previously consumed ticket was
rejected as `ALREADY_USED`, and a fresh ticket still reached the Browser-operation boundary.
Evidence: `local-test-artifacts/phase5/relay-spent-ticket-restart-evidence-20260827.json`.
The evidence is redacted and contains no secret values. This closes only the Relay restart/spent-ticket
subset; `G3-RECOVERY` remains **OPEN** pending the real power-cycle/licence-key gate and owner review.

The same-day real power-cycle continuation was attempted on the disposable VM with Browser source
`137a849` and Relay v15. The first run had the package and real-key setup present, but launch stopped
before an active lease because the VM could not attribute the live DevTools listener
(`portOwnerPids=none`). A fresh follow-up warmed the Windows listener provider, then proved listener
ownership and single-key capacity without changing Browser code. That rerun was still invalid: the
scheduled arm task was started immediately and retained its one-minute trigger, so it ran twice and
lost the stable active-lease checkpoint. Cleanup recorded `0 active / 0 pendingRecovery / 1 cooling`
and no profile Browser process. No power cut was made after either failed precondition.

Redacted evidence is retained at
`local-test-artifacts/phase5/real-power-cycle-recovery-evidence-20260827.json` and
`local-test-artifacts/phase5/real-power-cycle-recovery-evidence-20260827-rerun.json`. These are
environment/harness blockers, not recovery verdicts. `G3-RECOVERY` remains **OPEN** pending an
owner-approved rerun after vendor cooldown and owner evidence review. The approved continuation is
recorded in the dated entry below.

## 27 August 2026 - Approved power-cycle rerun remained blocked before cut

The owner-approved disposable rerun used Browser source `137a849`, packaged Relay v15, a real
licence key through a non-recording guest path, demand-only scheduled tasks, and Windows provider
warm-up. The launch reached a live CloakBrowser child and `DevToolsActivePort`, but the packaged
ownership query returned `portOwnerPids=none` and Browser failed closed before writing an active
checkpoint. The lease cleanup recorded `confirmed-released`; after the measured cooldown, capacity
returned to `1 free / 0 active / 0 pendingRecovery / 0 cooling`. No recovery power-cycle was made.

Evidence: `local-test-artifacts/phase5/real-power-cycle-recovery-evidence-20260827-final.json`.
The later `VBoxManage controlvm poweroff` stopped the already-clean disposable clone and is recorded
as cleanup only, not as a recovery observation. `G3-RECOVERY` remains **OPEN** with blocker
`VM_PRECUT_ACTIVE_CHECKPOINT_UNAVAILABLE`; this result is not promoted to PASS or hidden by the
successful Relay spent-ticket restart subset.

## 26 August 2026 - The installer lifecycle closes on a clean guest and two recovery gates fail by name

Removing the `HNetCfg.FwPolicy2` firewall reader and moving nine call sites off
`-ExecutionPolicy Bypass` was enough to clear the Defender behavioural block. On a guest restored
from an updated-Defender snapshot (engine `1.1.26070.7`, signatures `1.457.331.0`), the
current-source candidate passed clean combined install 9/9, repair 13/13 and combined uninstall
15/15, with no detection and no Defender event 1116/1117 in any gate window. Repair restored the
exact Browser tree digest, both shortcuts and Publisher while operator token, profile database and
Relay config survived. Uninstall removed Browser payload, shortcuts, both firewall rules and the
Browser-owned Relay executable while leaving operator data intact. The artifact is unsigned and
unattested, so this closes the lifecycle slice only.

Startup crash recovery now binds to the seat it owns. An active Electron crash previously left the
licensed browser running with the lease stuck active, because sweep outcomes carried only PIDs.
Startup now returns a profile-scoped verdict for the exact owned engine path, converges the lease to
`confirmed-released` and frees the seat; anything unmatched stays pending rather than guessing free.
A second false-free path was closed alongside it: a Windows launcher can exit 0 while the browser
runs under another PID, so a clean exit only releases a seat when the exiting child is the owned
browser. Anything ambiguous cools.

Two gates fail and are named rather than summarised. Relay restart loses spent-ticket replay
protection because spent JTI state is process-memory-only. A host reboot fails closed as
`REBOOT_LEASE_STUCK_PENDING_RECOVERY`: no false-free seat, but no convergence either. Under the
one-seat cap that second failure costs the whole application for up to the measured 15.1-minute
lease expiry, which makes ending the vendor session explicitly on shutdown the highest-value
remaining fix. Rollout remains NO-GO.

## 25 August 2026 - Concurrency is capped at one profile and the second machine is a VM

Three scope questions left open by the 24-25 August evidence were decided by the owner, and each
narrows v1 rather than adding work.

Concurrency is capped at **one profile at a time**. Only one licence seat is free, and the vendor
counts sessions per licence rather than per account or per install, so the concurrent two-profile
launch gate cannot run. That gate is now `DEFERRED`: removed from the release path by decision, not
repaired by evidence. Its 24 August `FAIL` verdict stands unchanged in the acceptance matrix, and a
`DEFERRED` row may never be counted as a pass. Cross-profile isolation remains proved sequentially.
Multi-key rotation stays in the code, unsupported and untested for v1.

The cap makes recovery more important, not less. With a second key a stranded seat cost a rotation;
with one key it blocks the entire product for the measured 15.1-minute lease expiry, with nothing the
operator can do but wait. Early vendor release - ending the licence session explicitly on shutdown -
therefore becomes the highest-value remaining Phase 5 item. The supporting parts already fail closed:
the key pool refuses a launch before spawning when no key is idle rather than burning an attempt on
the vendor, and the seat-wait message distinguishes "close a running profile" from "a dead browser
still holds the seat". The missing piece is the call that ends the session.

Keys held across several vendor accounts are not used for v1. The vendor sees `install_id` and two
keys were already measured against one on 23 August, so pooling accounts to exceed a free-tier limit
is detectable, and a revocation during the canary would destroy the evidence it was collecting. One
key on one account is enough under the cap; concurrency beyond that is a purchase, not a workaround.

Windows code signing stays unbought, reaffirmed with no budget. SmartScreen warns on every install,
the published SHA-256 and the distribution channel remain the only origin evidence, and onboarding
must name the warning before an operator meets it.

The clean VM guest is accepted as PC B. `G4-OPERATOR` may close there, provided the evidence records
the machine as virtual so it is never later read as physical-PC parity. Host hardware distinctness
stays unproved.

Rollout remains NO-GO.

## 24 August 2026 - Installer evidence is corrected and normal close is remeasured

The clean-machine installer record is downgraded after its completion condition proved incomplete.
The original harness treated `MKTBrowser.exe` appearance as a finished silent install, even though
Browser files are copied before the mandatory WebRTC firewall, pinned Relay, startup shortcut,
Publisher, and Relay ownership steps. A fresh disposable Windows 11 repair run reproduced the gap:
129 Browser files existed, but Relay and firewall rules were absent, the startup shortcut was
absent, and the uninstall metadata was incomplete.

Microsoft Defender remediated the installer-spawned PowerShell behavior twice as
`Behavior:Win32/PShellCobStager.A`. Defender was not disabled or allow-listed. The clean and repair
harnesses now require installer exit zero plus the complete Browser/Relay/firewall/shortcut/registry
contract before launch. Receive-side candidate hashing, clean preflight, Browser first-run
provisioning, and Browser-data-preservation observations remain useful, but supported combined
install, repair, and uninstall are open again.

The current local directory artifact also completed a safe normal-close gate with one disposable
unmanaged profile containing no proxy or account data. Capacity moved from one free/one cooling seat
to one active/one cooling seat and back. The lifecycle log reached `Browser.close`, child exit code
0, and `SHUTDOWN-COMPLETE` without adding pending-recovery or cooling state. The pre-existing cooling
seat came from an earlier live refusal and correctly did not become false-free.

Hard kill and Electron crash were not injected because the sandbox had no terminate access to the
new engine processes or Browser main process. Relay was not running, and host reboot was not
separately authorized. Production recovery remains unintegrated at the driver/sidecar/startup-release
boundary. Rollout remains NO-GO.

## 22 August 2026 - Packaged runtime CI adopts owned OS-assigned DevTools endpoints

MKT Browser no longer allocates monotonically increasing ports from 9222. Chromium requests port
zero and publishes its selected endpoint through a bounded `DevToolsActivePort` record in the owned
profile directory. Launch accepts the endpoint only when the record is fresh, the browser process
uses that exact data directory, and the listener belongs to the selected primary process on
`127.0.0.1`. Discovery and staged CDP attach share one 15-second operator readiness budget; startup
orphan recovery separately bounds and cancels its polite CDP close before allowing a new launch. The
packaged verifier alone receives a 60-second cold-run budget.

The Windows workflow now separates quality, build-once package, and fresh-job packaged-contract
jobs. It hashes and uploads one directory-package archive, verifies the manifest after download, and
runs five cold iterations on push/pull request or twenty on schedule/manual runs. Failure evidence
contains bounded redacted application output plus PID/parent/listener snapshots; timing JSON records
the executable, `app.asar`, Chrome version, and Chrome hashes without profile data or tokens. Every
health probe and MCP RPC has its own hard deadline, so a half-open local request cannot hang the CI
job past evidence generation.

Local Node 22 verification passed the complete installer suite, typecheck, zero-warning lint, the
production directory build, an expected-failure cleanup/redaction smoke, and 5/5 cold lifecycle runs
while ports 9222 and 9223 were occupied. The unsigned `0.3.12` executable remains 221,933,568 bytes
with SHA-256 `b62642a57c2651c071a59fe210fa2fe9633df584d16fa49e3abd855e747bc1a7`; packaged `app.asar`
SHA-256 is `8a2310fbd9341b0b45ae829a45b9fdbb40a31da5aa821513fb01e9209a919da7`.

Release-readiness Phase 2 remains in progress. The required PR artifact run and seven independent
20/20 Windows runner runs remain open, so rollout stays NO-GO.

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
