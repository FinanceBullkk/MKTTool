# Internal beta boundary

**Updated:** 30 August 2026
**Status:** controlled technical pilot only; the Browser/Relay rollout is **NO-GO**.

This guide describes the smallest safe internal surface while the release, identity, network,
operator, and canary gates remain open. A green local check is not a Browser identity-isolation or
real-account approval.

## What the team can use now

- **MKTTool Web:** Web/Facebook workflows may continue as a low-risk, admin-led internal pilot for
  authorized operators. The deployed Railway service is older than the current hardening branch;
  verify the live route before relying on a new release claim.
- **MKT Browser + Relay:** a Windows x64 `0.3.13` candidate is being assembled from the frozen join
  key `3f376536`. It is a draft until the installer, provenance, lifecycle, and release-authority
  gates close. Use one profile at a time, one static proxy per browser-backed account, and human
  login/input only. Profile-local storage and proxy assignment are operational controls, not proof
  of unique or isolated browser identity.

Reddit/TikTok real-account rollout, unattended automation, and posting automation remain paused.
A disposable technical profile may be used only for a bounded, admin-led demonstration.

## Candidate tuple (draft, not published)

| Field | Value |
|---|---|
| Product | MKT Browser `0.3.13` |
| Source join key | `3f3765360ae6de83fd617bf8e19949fb70719af` (`feat/installed-contract-on-clean-runner`) |
| Platform | Windows x64, per-user install |
| Bundled Relay | v16; `33,342,752` bytes; SHA-256 `5c98cf460e62f83b484c9ecd55bc80b650f2e19a09e8ded6e99eafb682e1842e` |
| Relay EXE (inside archive) | `87,987,200` bytes; SHA-256 `300646e1ea35aa47ece1b0d608d9b9681ee5bde82dd084bcdc5145345d07b60e` |
| Engine record | CloakBrowser stable `.2`, `151.0.7922.108.2`; metadata SHA-256 `7b16ae3070bfcbed9cd381d03d1a8d57a8baf8f4540650397d620eb8dbe89561`; exact archive is not present locally |
| Installer SHA/size | **OPEN** until the exact installer is built and read back |
| Signing | Unsigned internal-only exception, 60 days from the S3 build date; Authenticode is required for Lane C |
| Publication/deployment | **NOT PUBLISHED / NOT DEPLOYED**; the deployed service still serves the older route contract |

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

- MKTTool hardening baseline: `214` files / `1,939` tests passed under Node `v22.23.2`, with
  typecheck, lint, and production build passing in that recorded baseline. Re-run the full quality
  suite on the current candidate branch before promotion; restore verification and DB-backed
  rate-limit checks passed in the baseline evidence.
- MKT Browser Node `22.23.2`: focused one-seat/UI/pool/journal/recorder/recovery suites `46/46`;
  runtime/managed/bootstrap suites `33/33`; the prior full installer suite passed with one explicit
  machine-live integration skipped. Re-run on the exact S3 artifact before promotion.
- Relay v16: exact archive/EXE binding, restart replay rejection, fresh-ticket acceptance,
  crash-recovery, and corruption fail-closed harness checks passed locally; R2 full read-back passed.
- CFT/system-Chrome runs are compatibility evidence only. They do not close `G2-IDENTITY`.

## Gates that remain open

| Gate | State | Meaning |
|---|---|---|
| P3 installer/provenance | OPEN | Exact engine archive is missing; installer tuple and two-clean-build comparison are pending |
| G1 human input/login | OPEN | Requires human first-login/typing attestations on the promoted artifact |
| G2 network | OPEN | Real proxy/DNS/WebRTC evidence is not closed |
| G2 identity | FAIL/OPEN | Prior licensed `.2` measurements found font/audio/WebGL collisions; vendor response is absent |
| G2 concurrency | DEFERRED | One vendor seat; one profile at a time |
| G3 licence/schema | OPEN | Live vendor sidecar/schema evidence is incomplete |
| G3 recovery | PASS for the tested historical path | Does not substitute for exact promoted-installer and real power-cycle evidence |
| G4 second PC/operator | OPEN | Unfamiliar-operator acceptance on a clean second PC is required |
| G5 canary | OPEN | Seven-day human canary and stop-condition evidence are required |

Therefore this document authorizes no public distribution, no broad Reddit/TikTok real-account
rollout, and no unattended automation. It is a boundary/runbook, not a release approval.

## Deliberately deferred

- custom Chromium/fingerprint-engine work and the prebuilt-engine session orchestrator;
- macOS packaging and updater work;
- multi-profile concurrency or additional licence-key promises;
- Reddit/TikTok posting automation, warmup, CAPTCHA/checkpoint, or credential/OTP automation;
- signing and Lane C promotion until the identity/vendor gates close.

Historical tuples and test results remain in the dated audit reports; they must not be presented as
the current candidate.
