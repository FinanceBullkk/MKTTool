# Internal beta release

**Updated:** 29 August 2026  
**Decision:** make the smallest useful surface available to the internal team now and keep the
broader Browser rollout behind the existing evidence gates.

This is a controlled internal beta boundary. It is not a claim that every Browser, vendor, network,
or operator gate has passed.

## What the team can use now

- **MKTTool Web:** the production console, content workflow, health views, and Facebook Page
  publishing are ready for normal internal use.
- **MKT Browser + Relay:** one Windows x64 candidate is available for an admin-led beta. It supports
  one profile at a time, one static proxy per browser-backed account, and human-controlled login and
  posting. The Relay and Browser are installed together from the authenticated `/setup` page.

Reddit and TikTok real-account work remains paused until the owner closes the relevant identity,
network, vendor, and operator gates. A disposable technical profile may still be used for a bounded
demo.

## Published candidate

| Field                       | Value                                                                                                       |
| --------------------------- | ----------------------------------------------------------------------------------------------------------- |
| Product                     | MKT Browser `0.3.12`                                                                                        |
| Platform                    | Windows x64, per-user install                                                                               |
| R2 object                   | `MKTBrowser-win-x64.exe` in `mkttool-relay-release`                                                         |
| Published                   | `2026-08-29T08:46:41Z` (R2 read-back)                                                                       |
| Installer size              | `146023745` bytes                                                                                           |
| Installer SHA-256           | `d570ccc3326b5a046d91b7b677f4232ab76908f2fb034c60799e31695f43fc4b`                                          |
| Source commit               | `6d1b0a2a54c7a688ef39c3c6c1fddab3edd557fe`                                                                  |
| Source tree                 | `db389a54f4cae1aa84d83cf9cb16169abf199097`                                                                  |
| Normalized payload manifest | `325d8babbacea356b36eb6fcd9908f8c4e174ce3ed637c8f4a5c20a6be269307` (128 files)                              |
| Bundled Relay               | v15, `34285450` bytes, SHA-256 `cfeefc7f1284492a64f5cf8b29603b3e9a36e5d488ac676d2d109b2c4364b261`           |
| Engine pin                  | CloakBrowser `151.0.7922.108.2`, SHA-256 `7b16ae3070bfcbed9cd381d03d1a8d57a8baf8f4540650397d620eb8dbe89561` |
| Signing                     | Unsigned by the v1 decision; announce the SmartScreen prompt before install                                 |

The R2 object was read back after upload and its size, version, Relay version, and checksum matched
the local candidate. The local v15 Relay build has a different hash and is deliberately **not** the
payload in this candidate; do not replace the embedded archive by hand.

## Operator path

1. Sign in to MKTTool with the company Google account and open `/setup`.
2. Ask ADMIN to approve the detected PC and assign the account, static proxy, and Relay device.
3. Download only the installer shown by `/setup`. Confirm the SHA-256 above; expect one Windows
   SmartScreen warning because the binary is unsigned.
4. Install the per-user package. Do not download a raw Relay ZIP, run an old `setup.bat`, or copy a
   token, key, port, or `.env` value.
5. Start the installed Browser and Relay and wait for the page to report `Ready`.
6. Run one profile at a time. Keep the account/proxy/profile/Relay-device binding unchanged, and
   perform Google login, OTP, CAPTCHA, and posting actions manually.

Stop and contact ADMIN when `/setup` reports a conflict, the proxy egress check fails, the Browser
engine or contract is not ready, or a licence seat is cooling. Do not retry by opening a second
profile or by changing the proxy locally.

## Evidence for this candidate

- MKTTool: `npm test` — 210 files / 1,922 tests passed; typecheck, lint, and production build passed.
- MKT Browser on Node `22.23.2`: MKB-02 `135/135`, MKB-03 `31/31`, packaging contracts `34 pass / 1
skipped` (the skip is the explicit live-machine integration test).
- Packaged runtime contract: `1/1` iteration passed, including managed create/retry, restricted MCP
  inventory, profile lifecycle, proxy rejection, and clean process shutdown. The verifier used the
  installed system Chrome compatibility fixture (`151.0.7922.174`); this is not CloakBrowser
  identity evidence.
- `yarn audit:production`: no audit suggestions.

## Gates that remain open

| Gate              | State    | Meaning for the beta                                                                                  |
| ----------------- | -------- | ----------------------------------------------------------------------------------------------------- |
| G1 human input    | OPEN     | Fewer than the required three packaged manual-login interactions                                      |
| G2 network        | OPEN     | Real proxy/DNS/WebRTC evidence is not closed for this candidate                                       |
| G2 identity       | FAIL     | Cross-profile fingerprint surfaces still collide in the measured CloakBrowser build                   |
| G2 concurrent     | DEFERRED | One vendor seat; one profile at a time                                                                |
| G3 licence/schema | OPEN     | Live sidecar/schema release evidence is not complete                                                  |
| G3 recovery       | PASS     | Normal close, crash/restart, Relay replay, and real VM power-cycle evidence exist for the tested path |
| G4 operator       | OPEN     | Unfamiliar-operator acceptance on PC B is still required                                              |
| G5 canary         | OPEN     | Seven-day manual canary and 14-day cold-start evidence are still required                             |

Therefore this document authorizes a bounded internal beta and Web/Facebook handoff only. It does
not authorize public distribution, a broad Reddit/TikTok rollout, or unattended automation.

## Deliberately deferred

- custom Chromium/fingerprint-engine work and the prebuilt-engine session orchestrator;
- macOS packaging;
- multi-profile concurrency, licence-key rotation, updater, and code signing;
- Reddit/TikTok posting automation, warmup, CAPTCHA/checkpoint, or rate-limit work;
- seven-day canary work until a nominated operator and current artifact are accepted.

## Unresolved questions

- Who is the single nominated operator and PC for the G4 acceptance run?
- Should the newer locally built Relay v15 be promoted as a new immutable release, or should this
  candidate keep the currently published v15 payload until the next planned release?
