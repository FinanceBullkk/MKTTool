---
title: MKB-03 local onboarding human-test report
date: 2026-08-13
status: failed-with-workarounds
platform: Windows x64
scope: MKTTool local setup, Relay v10, MKT Browser 0.3.1
---

# MKB-03 Local Onboarding Human-Test Report

## Summary

The complete local path worked after manual recovery:

`MKTTool Web -> Relay v10 -> MKT Browser -> managed profile -> proxied website`

Enrollment, operator-key delivery, browser contract negotiation, profile creation, proxy routing,
and profile launch all completed. The website observed the proxy egress rather than the operator's
normal browser address.

The build is not ready for real accounts or team rollout. Chrome for Testing exposed the operator's
real public IPv4 and IPv6 through WebRTC until an administrator manually blocked outbound UDP for
the exact downloaded `chrome.exe`. This is a release-blocking safety failure. The test also found
two onboarding dead ends and two misleading UX states.

No secret, credential, device private key, proxy endpoint, or observed IP is recorded in this report.

## Test Result

| Area | Result | Evidence |
| --- | --- | --- |
| Combined installer | Pass | MKT Browser and Relay installed and started |
| Local Google login | Pass | ADMIN reached `/setup` after restarting the local dev server |
| Relay enrollment | Pass with recovery | New Relay identity enrolled after the revoked test identity was reset |
| Operator-key bootstrap | Pass | Setup reached `Ready`; Relay reported configured |
| Browser contract | Pass | Relay reported MKT Browser contract v3 compatible |
| Primary CloakBrowser download | Fail | Five attempts ended with `net::ERR_HTTP2_SERVER_REFUSED_STREAM` |
| Chrome for Testing fallback | Pass with manual config | Runtime downloaded and engine became ready |
| Managed profile launch | Pass | A dedicated profile directory was created and a website opened |
| HTTP proxy routing | Pass | Website egress differed from the operator's normal browser egress |
| WebRTC privacy before workaround | **Fail** | BrowserLeaks exposed the operator's real public IPv4 and IPv6 |
| WebRTC privacy after firewall workaround | Pass | BrowserLeaks reported `No Leak`; no local or public WebRTC IP |

## Findings

### P0 - Chrome for Testing can expose the operator's real IP through WebRTC

The managed profile used the configured proxy for normal website traffic, but WebRTC STUN traffic
bypassed it and exposed both public addresses of the operator's network.

The launcher already adds `disable_non_proxied_udp` and injects a WebRTC script, but neither was a
sufficient safety boundary in the packaged Chrome for Testing runtime during this test:

- `MKTBrowser/apps/desktop/src/main/ChromiumBrowserDriver.ts:372`
- `MKTBrowser/apps/desktop/src/main/ChromiumBrowserDriver.ts:380`
- `MKTBrowser/apps/desktop/src/main/ChromiumBrowserDriver.ts:543`
- `MKTBrowser/apps/desktop/src/main/ChromiumBrowserDriver.ts:570`

Blocking outbound UDP for the exact runtime executable stopped the leak. The current runtime path
contains the Chromium version, so a rule for one version silently stops protecting the next version.

Required fix:

1. Treat WebRTC containment as a launch precondition, not optional hardening.
2. Install or refresh the Windows outbound-UDP block whenever the selected runtime path changes.
3. Remove or disable obsolete MKT Browser rules after a successful replacement.
4. Fail closed with an actionable message if protection cannot be verified; never launch a proxied
   profile with uncertain WebRTC containment.
5. Cover CFT and CloakBrowser separately. Do not assume CloakBrowser's native patch proves CFT safe.

Acceptance criteria:

- A fresh install needs no manual PowerShell command.
- BrowserLeaks shows no operator public IPv4 or IPv6 on the root page, a new tab, and an iframe.
- Protection survives app restart, Windows network-profile changes, and a Chromium runtime update.
- Removing or disabling the protection makes managed launch fail before any page is opened.
- Tests never log the operator IP or proxy credentials.

### P1 - Download failure tells the user to open Settings while the modal blocks Settings

CloakBrowser download failed after five bounded attempts. The error recommends switching to Chrome
for Testing in Settings, but the mandatory bootstrap modal covers the app and exposes only `Retry
download`:

- `MKTBrowser/apps/desktop/src/main/ChromiumBootstrap.ts:433`
- `MKTBrowser/apps/desktop/src/renderer/src/components/onboarding/ChromiumBootstrapModal.tsx:158`
- `MKTBrowser/apps/desktop/src/renderer/src/components/onboarding/ChromiumBootstrapModal.tsx:182`

The human test could continue only by closing MKT Browser and creating `settings.json` from
PowerShell.

Required fix:

1. Add `Switch to Chrome for Testing` directly to the CloakBrowser error state.
2. Persist `browserEngine: "cft"` through the existing settings boundary.
3. Relaunch or rebuild the bootstrap instance safely, then start the CFT download.
4. Explain that CFT is a compatibility fallback and is not the approved antidetect runtime.

Acceptance criteria:

- A user can recover using only the visible UI.
- Switching engines preserves profiles, Relay state, and unrelated settings.
- The action is hidden when CFT itself fails; that state offers retry and useful network guidance.
- An automated renderer/main-process test covers the error-to-fallback transition.

### P1 - A stale saved device ID traps setup after the Relay identity changes

After the first local Relay identity was revoked and a new identity was created, `/setup` kept the
old device ID in browser local storage. The page showed a repair/binding error until local storage
was manually cleared.

The component trusts `mkttool.setup.device-id` on mount and reports inspection failure without
discarding the stale value:

- `MKTTool/src/components/relay/relay-enroll-card.tsx:84`
- `MKTTool/src/components/relay/relay-enroll-card.tsx:92`
- `MKTTool/src/components/relay/relay-enroll-card.tsx:136`
- `MKTTool/src/components/relay/relay-enroll-card.tsx:170`

Required fix:

1. Treat local storage as a hint, not device identity authority.
2. Probe the live Relay and compare its public identity/device ID with the saved record.
3. Clear or replace stale local state when the saved device is missing, revoked, or no longer
   matches the live Relay.
4. Preserve the owner-binding security check; never auto-adopt a device belonging to another user.

Acceptance criteria:

- Resetting a revoked local Relay identity does not require DevTools or local-storage surgery.
- The new unregistered Relay returns to the normal `Register this PC` journey.
- A live Relay bound to another owner still fails closed and requests administrator repair.
- Tests cover revoked, missing, replaced, same-owner, and different-owner device states.

### P2 - Unknown download size is rendered as `0.0 MB / 0.0 MB` and `0%`

Before response headers arrive, the bootstrap emits an unknown total. The renderer formats that as
a zero-byte download, which looks frozen even while attempts and backoff are active:

- `MKTBrowser/apps/desktop/src/renderer/src/components/onboarding/ChromiumBootstrapModal.tsx:120`
- `MKTBrowser/apps/desktop/src/renderer/src/components/onboarding/ChromiumBootstrapModal.tsx:141`

Required fix:

- Render an indeterminate `Connecting...` state while total size is unknown.
- Show the current attempt, maximum attempts, and whether a partial file will resume.
- Keep the bounded retry and final network error; those behaved correctly.

### P2 - Relay status page describes the legacy manual enrollment path

The Relay status page still directs the operator to `/relay-devices` and describes manually pasting
the operator key. The current supported journey is `/setup`, automatic registration, and signed
operator-key delivery. The legacy wording caused confusion during the human test.

Required fix:

- Make `/setup` the primary instruction.
- Describe manual key entry as recovery-only, if it must remain.
- Keep the warning that operator secrets never live on the server.

## What Worked

- Relay v10 started, generated its device key, accepted signed enrollment, and became configured.
- The server did not mark setup ready until the completion proof was submitted.
- MKT Browser exposed the expected restricted contract and Relay accepted contract version 3.
- Chrome for Testing downloaded, verified, installed, and was discovered after the external engine
  switch.
- MKTTool created and opened a dedicated managed profile through Relay.
- Normal website traffic used the assigned proxy.
- A Windows outbound-UDP firewall rule eliminated the observed WebRTC leak.

## Recommended Order

1. Fix P0 WebRTC containment and add fail-closed launch verification.
2. Add the in-modal engine fallback so a fresh user can complete installation without PowerShell.
3. Repair stale device-ID recovery in `/setup`.
4. Improve unknown-size download progress and update Relay onboarding wording.
5. Build a fresh installer and repeat the entire test from clean local state without manual file,
   DevTools, database, or firewall changes.

## Release Gate

Do not use real accounts and do not distribute to the team until all conditions below pass:

- [ ] Fresh Windows install completes through visible UI only.
- [ ] CloakBrowser failure can switch to CFT without editing local files.
- [ ] Revoked/replaced Relay recovery needs no local-storage edit.
- [ ] Proxied managed launch fails closed when WebRTC containment is absent.
- [ ] BrowserLeaks reports no operator IP before and after app restart.
- [ ] BrowserLeaks reports no operator IP after a runtime upgrade.
- [ ] HTTP egress still matches the assigned proxy.
- [ ] Installer uninstall/restore behavior preserves profile data.
- [ ] Automated tests, typecheck, lint, packaging verification, and local executable smoke test pass.

## Unresolved Questions

1. Should Windows WebRTC containment be owned by the installer, an elevated runtime helper, or a
   stable unversioned launcher path?
2. Is Chrome for Testing allowed only for technical testing, or can it ever be an operational
   fallback for low-risk accounts?
3. Should a failed CloakBrowser download automatically suggest CFT, or require an explicit operator
   choice because the privacy/fingerprint guarantees differ?
