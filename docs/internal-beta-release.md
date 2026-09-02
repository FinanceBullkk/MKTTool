# Internal beta boundary

**Updated:** 2 September 2026
**Status:** Lane A Web/Facebook is **SIGNED CONDITIONAL GO**; the Browser/Relay rollout is **NO-GO**.

## Consolidation truth — 1 September 2026

Lane A Web/Facebook and the Browser fleet contract are separate. The MKTTool web candidate was
merged to `master` after green branch/master CI and a fresh current-DB backup/restore. The latest
Railway deployment and its exact commit are recorded in the successor P4a evidence report; the
post-merge `/api/healthz` probe is 200 and the authorized `/v16` full GET is hash-exact. It did not
need a Browser engine archive or a five-artifact tuple. The disposable rollback rehearsal and
bounded credentialed/admin smoke are complete. The owner signed CONDITIONAL GO for Lane A on
1 September 2026 and accepted residual risks 1–8. Any real rollback remains human-approved and
requires a fresh healthcheck-setting check.

The current MKTBrowser branch head is `b9f9477`; the accepted
provenance receipt was generated from its preceding source commit
`5ef710dd931028d4d608bea098311bf54bf5dc31`. The Browser tuple is still a separate P4b technical OPEN because the exact
CloakBrowser Stable `.2` archive is absent. No tuple was fabricated or published. Q16 closes Lane C:
there is no CloakBrowser channel, no request will be sent, and there is no date or “coming soon”
promise. MKTBrowser remains a controlled Lane A/B demo with human login and no identity-isolation
claim.

The historical intermittent production 503 incident is mitigated, not forgotten: the current
deployment has 947/947 successful health responses over 24 hours, a fresh 24/24 ready burst, and an
exact authorized Relay v16 replay. The former 450 ms shared R2 readiness budget was replaced by
per-dependency budgets and cached immutable metadata. The exact upstream R2-latency trigger remains
unconfirmed; keep monitoring and do not treat this as a platform-edge root-cause finding.

This guide describes the smallest safe internal surface while the release, identity, network,
operator, and canary gates remain open. A green local check is not a Browser identity-isolation or
real-account approval.

## Fingerprint gate decision - 2 September 2026

The current pinned CloakBrowser Stable `.2` engine remains `BLOCKED`: Phase 02 obtained `0/10`
valid profile readings because the engine would not launch. The free fallback candidate, official
Brave `v1.94.117`, was measured at the declared pool of five with two runs per profile and an exact
Chromium `152.0.7977.64` same-machine CFT control.

Brave failed all three experimental criteria. It produced `65` restart mismatches and `20`
cross-context mismatches; all `10/10` profile pairs collided on stable subsets of `62` and `63`
components; and cohort plausibility failed on restart-drifting audio/canvas plus invariant UA-CH and
screen differences. Audio was not an invariant Brave mark, but its rendered hashes changed after
restart, so it was not a persistent identity either.

The owner signed the Phase 05 **NO-GO for Brave integration and for any identity-isolation claim**.
The Browser boundary remains unchanged: no engine integration, rollout, or real accounts. The
signed decision does not alter the Lane A decision, and `G2-IDENTITY` remains `FAIL`.

## What the team can use now

**Rollout scope decision, 2 September 2026: Reddit and Facebook are withdrawn from the team rollout
scope.** The implementation stays in the tree and stays deployed; nothing was deleted. What changed
is what operators are asked to use. No Reddit or Facebook workflow — Pages publishing included — is
part of the team surface, and no operator should be onboarded onto one. Re-entry is an explicit
owner decision.

- **MKTTool Web, in scope:** the shared account vault, proxy ownership, and operator-device
  registry. These are the platform-independent parts: one responsible person and one PC per
  browser-backed account, secrets split across two key domains, admin-controlled proxy inventory.
- **MKTTool Web, out of scope:** Reddit posting-safety workflows and Facebook Pages publishing. The
  deployed service still contains them and the earlier CONDITIONAL GO evidence still stands as a
  technical record — but that record is no longer a rollout instruction for these platforms.

Consequences worth keeping straight:

- **Nothing in code enforces this.** `TARGET_PLATFORMS` still lists `REDDIT`, `FACEBOOK_PAGE`, and
  `FACEBOOK_GROUP`; the screens still render and the buttons still work. The boundary holds by
  agreement, not by a check that fails closed. If it must fail closed, that is a separate change.
- **The rollout surface is now small.** With both platforms out, no posting path remains, so the
  team-facing product is a shared identity vault rather than a posting console. That is a coherent
  thing to hand over, but it is much less than what is built.
- **Re-entry is an owner decision, not a default.** Whoever reopens a platform inherits the open
  items recorded against it — including the unowned cross-operator publish path on Facebook Pages.
- **MKT Browser + Relay:** the current Windows x64 `0.3.13` tree is a controlled technical draft
  from `5ef710dd`. Its payload is measured, but the full installer still has an unresolved NSIS
  resource-order variance and the five-artifact tuple is not publishable. Use one profile at a time,
  one static proxy per browser-backed account, and human login/input only. Profile-local storage and
  proxy assignment are operational controls, not proof of unique or isolated browser identity.

Reddit/TikTok real-account rollout, unattended automation, and posting automation remain paused.
A disposable technical profile may be used only for a bounded, admin-led demonstration.

## Candidate tuple (draft, not published; P4b only)

| Field | Value |
|---|---|
| Product | MKT Browser `0.3.13` |
| Source join key | Current tree `5ef710dd931028d4d608bea098311bf54bf5dc31` (`release/consolidation-20260830`); `3f376536…` is historical baseline context only |
| Platform | Windows x64, per-user install |
| Bundled Relay | v16; `33,342,752` bytes; SHA-256 `5c98cf460e62f83b484c9ecd55bc80b650f2e19a09e8ded6e99eafb682e1842e` |
| Relay EXE (inside archive) | `87,987,200` bytes; SHA-256 `300646e1ea35aa47ece1b0d608d9b9681ee5bde82dd084bcdc5145345d07b60e` |
| Engine record | CloakBrowser stable `.2`, `151.0.7922.108.2`; metadata SHA-256 `7b16ae3070bfcbed9cd381d03d1a8d57a8baf8f4540650397d620eb8dbe89561`; exact archive is not present locally |
| Installer SHA/size | `145,140,593` bytes; SHA-256 `e5623b8a5275ca2ca917caebc9b4baa9640379747da8c9d5ba0fccbe256876cc` (unsigned draft) |
| Payload manifest | 130 files; digest `5a8385a27ed70e67ae5368aa5e5f09e8db23dc47b52e67bdb281ce7965fddf37` |
| Signing | Unsigned internal-only exception, 60 days from the S3 build date; Authenticode is required for Lane C |
| Provenance | Accepted (`source.clean=true`); this is not a signature or Browser tuple publication |
| Publication/deployment | Browser tuple **NOT PUBLISHED / NOT DEPLOYED** (P4b); independent P4a MKTTool web deployment is live and verified |

The immutable Relay v16 R2 object was published and verified with a full GET/hash read-back under
the Phase 2 authorization. That does not publish this Browser installer. The old R2 Browser
`0.3.12`/Relay-v15 object is quarantined historical evidence; never patch or reuse its tuple.

## Operator path (when the draft is released)

1. Sign in to MKTTool and open `/setup`.
2. Ask ADMIN to approve the detected PC and assign the account, static proxy, and Relay device.
3. Download only a complete metadata tuple shown by `/setup`; if metadata is missing, the page must
   disable the download and show **unpublished**.
4. Install the per-user package. Do not download a raw Relay ZIP, run an old script, or copy a
   token, key, port, profile directory, or `.env` value.
5. Start Browser/Relay and verify the local technical checks. Keep one profile active at a time.
6. A human performs Google login, OTP, CAPTCHA, typing, and any posting action. Never infer identity
   isolation from the local readiness banner or the CFT compatibility verifier.

Stop and contact ADMIN when setup reports a conflict, proxy egress is unverified, the Browser engine
or contract is unavailable, metadata is incomplete, or the single licence seat is cooling. Do not
retry by opening a second profile or changing the proxy locally.

## Evidence currently available

- MKTTool consolidation branch/master: `215` test files / `1,958` tests passed, with typecheck,
  lint, critical coverage, production build, restore/rate-limit contracts, and secret scan passing;
  branch run `33292005382` and master run `33292350436` are recorded.
- MKT Browser Node `22.23.2`: focused one-seat/UI/pool/journal/recorder/recovery suites `46/46`;
  runtime/managed/bootstrap suites `33/33`; the prior full installer suite passed with one explicit
  machine-live integration skipped. Re-run on the exact S3 artifact before promotion.
- Relay v16: exact archive/EXE binding, restart replay rejection, fresh-ticket acceptance,
  crash-recovery, and corruption fail-closed harness checks passed locally; R2 full read-back passed.
- One owner machine completed the self-serve 0.3.13 reinstall and now reports Relay v16 and a
  contract-compatible Browser. The second owner machine remains unobserved; the floor stays at 13.
- Exact-revision CFT was used only as the same-machine cohort control for the Brave measurement.
  Brave failed A/B/C, so the control does not close `G2-IDENTITY` or authorize an engine change.

## Gates that remain open

| Gate | State | Meaning |
|---|---|---|
| P3 installer/provenance | OPEN | Provenance is accepted, but the exact engine archive and deterministic outer installer tuple are missing |
| G1 human input/login | OPEN | Requires human first-login/typing attestations on the promoted artifact |
| G2 network | OPEN | Real proxy/DNS/WebRTC evidence is not closed |
| G2 identity | FAIL | Stable `.2` is `BLOCKED` with `0/10` current readings; Brave failed A/B/C at pool five; no current engine proves identity isolation |
| G2 concurrency | DEFERRED | One vendor seat; one profile at a time |
| G3 licence/schema | OPEN | Live vendor sidecar/schema evidence is incomplete for the Browser tuple |
| G3 recovery | PASS for the tested historical path | Does not substitute for exact promoted-installer and real power-cycle evidence |
| G4 second PC/operator | OPEN | Unfamiliar-operator acceptance on a clean second PC is required |
| G5 canary | OPEN | Seven-day human canary and stop-condition evidence are required |

Therefore this document authorizes no public distribution, no broad Reddit/TikTok real-account
rollout, and no unattended automation. It is a boundary/runbook, not a release approval.

## Lane C closure

Lane C is **CLOSED**, not pending. The custom engine track is closed, `G2-IDENTITY` is FAIL, and
there is no channel to CloakBrowser. No vendor request will be sent; there is no deadline, date, or
“coming soon” commitment. The measured free Brave path also failed A/B/C and opens no integration
plan. MKTBrowser remains a controlled Lane A/B tool without an identity-isolation claim. Any future
engine path requires a new, separately owned product decision outside this release.

## Deliberately deferred

- custom Chromium/fingerprint-engine work remains closed; the Brave prebuilt spike completed with a
  NO-GO and is not an integration backlog;
- macOS packaging and updater work;
- multi-profile concurrency or additional licence-key promises;
- Reddit/TikTok posting automation, warmup, CAPTCHA/checkpoint, or credential/OTP automation;
- Browser tuple signing/publication (P4b) remains technically OPEN, while Lane C promotion is closed
  for this product shape; no identity-isolation or vendor-delivery promise is made.

Historical tuples and test results remain in the dated audit reports; they must not be presented as
the current candidate.
