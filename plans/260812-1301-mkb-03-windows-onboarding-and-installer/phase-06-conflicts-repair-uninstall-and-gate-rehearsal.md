# Phase 06 — Conflicts, repair, uninstall, and gate rehearsal

## Context links

- Spec: [MKT Browser plan §MKB-03B detection and repair, MKB-03 gate](../260810-0244-mkt-browser-noi-bo/plan.md)

## Overview

**Priority:** the gate itself — no shippable middle.
**Status:** ⬜ blocked on Phases 01–05.

Handle the machines that are not clean, define repair and uninstall, then rehearse the gate with
someone who has never seen the product.

## Key insights

- **The owner's machine is the worst possible test subject** and the only one used so far. It has a
  standalone Relay, a technical MKT Browser directory, an installed build, MultiZen leftovers, and
  duplicate startup entries. Every one of those is a case the installer must detect rather than
  trample.
- **Never kill an unknown process or silently pick another port.** A listener on `47821`/`47822`
  might be someone else's software. Show the blocked layer and a safe action.
- Uninstall preserves profiles and device credentials **by default**. Removing local data is a
  separate explicit confirmation, because an operator who uninstalls to fix a glitch must not lose
  warmed identities.
- The gate measures **user attention**, not wall-clock: automatic artifact transfer and administrator
  wait time are measured separately.

## Requirements

- Detect existing standalone Relay, technical MKT Browser, MultiZen, duplicate startup entries, and
  listeners on `47821`/`47822`.
- Repair is idempotent and preserves device and profile data.
- Uninstall stops owned processes, removes owned binaries and autostart, preserves profiles and
  credentials.
- Leave MultiZen data untouched in every path.
- Proxy, DNS, WebRTC, fingerprint, and Windows Firewall behaviour tested with a dedicated profile.
- The current ZIP, `setup.bat`, PowerShell, localhost, manual-key, and checksum instructions are
  retired from team-facing guidance only once this flow ships.

## Related code files

**Modify**
- `MKTBrowser/apps/desktop/build/installer.nsh` — detection and blocked-layer messaging
- `MKTTool/docs/huong-dan-van-hanh-cho-team.md` — replace the technical install path

**Create**
- `MKTBrowser/apps/desktop/scripts/detect-conflicting-install.cjs` — the detection used by the
  installer and by repair

## Implementation steps

1. Write the detection as a standalone module so the installer, repair, and the setup controller all
   report the same verdict.
2. Add the blocked-layer messages: one plain sentence plus one safe action, technical detail behind a
   disclosure.
3. Implement repair as an idempotent re-run of install with data preserved.
4. Implement uninstall with the data-removal confirmation kept separate.
5. Run the matrices: legacy install present, permission denied, port conflict, repair, uninstall,
   update fault injection, rollback.
6. Test proxy, DNS, WebRTC, fingerprint, and Firewall with a dedicated profile.
7. **Gate rehearsal:** a clean standard-user Windows account and an operator who has never seen the
   product. Record time to `Waiting`/`Ready` and count technical interventions. The passing count is
   zero. The one SmartScreen click-through does not count as an intervention if the journey announced
   it; asking what the warning means does.
8. Retire the old team-facing guidance only after the rehearsal passes.

## Todo list

- [ ] `detect-conflicting-install.cjs` shared by installer, repair, and setup
- [ ] Blocked-layer messaging with safe actions
- [ ] Idempotent repair preserving data
- [ ] Uninstall with separate data-removal confirmation
- [ ] MultiZen data untouched in every path
- [ ] Legacy/permission/port/repair/uninstall/update/rollback matrices green
- [ ] Proxy, DNS, WebRTC, fingerprint, Firewall verified
- [ ] Gate rehearsal with an unfamiliar operator, zero interventions
- [ ] Team-facing guidance replaced

## Success criteria

The MKB-03 gate as written: one unfamiliar operator on a clean standard-user account runs one
authenticated installer and reaches `Waiting for administrator approval` or `Ready` with at most ten
minutes of user attention, no Node, MultiZen, UAC, terminal, archive extraction, developer coaching,
separate downloads, manual checksum, localhost navigation, or copied technical value — and exactly
one announced SmartScreen click-through.

## Risk assessment

- **Finding an unfamiliar operator is a scheduling problem, not an engineering one.** Line one up
  early; the gate cannot be self-assessed by whoever built it.
- The owner's machine cannot serve as the clean-account test. Use a fresh Windows account or a spare
  device.

## Security considerations

Detection must not require elevation, and must not read another process's memory or files to identify
it. Reporting a conflicting listener by port and owning process name is enough; do not attempt to
inspect or terminate software the project does not own.

## Next steps

MKB-04: two-device pilot, then one canary account through a 14-day cold start. Buying proxies and
accounts should already be under way by then — that clock runs independently of this milestone and is
the longer of the two.
