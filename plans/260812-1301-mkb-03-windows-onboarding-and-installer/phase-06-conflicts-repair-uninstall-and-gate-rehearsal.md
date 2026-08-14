# Phase 06 — Conflicts, repair, uninstall, and gate rehearsal

## Context links

- Spec: [MKT Browser plan §MKB-03B detection and repair, MKB-03 gate](../260810-0244-mkt-browser-noi-bo/plan.md)

## Overview

**Priority:** the gate itself — no shippable middle.
**Status:** 🟡 engineering subset verified; completion remains blocked on Phase 05 and live/human gates.

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
  separate lifecycle operation, because an operator who uninstalls to fix a glitch must not lose
  warmed identities.
- The gate measures **user attention**, not wall-clock: automatic artifact transfer and administrator
  wait time are measured separately.

## Decision - separate uninstall, retirement, and loss response

Do not add a destructive checkbox to NSIS. The lifecycle has four deliberately different paths:

| Path | Server effect | Relay data | Browser data |
|---|---|---|---|
| Repair/reinstall | none | preserve | preserve |
| Normal uninstall | none | preserve, including a pre-existing Relay | preserve |
| ADMIN device retirement | revoke first, unpin accounts, audit | delete only after a signed device-bound authorization; record recipient proof | preserve; deletion is a separate high-friction Browser action |
| Lost/unreachable device | revoke immediately, then rotate the operator key when exposure is plausible | no remote-wipe claim | no remote-wipe claim |

Retirement is server-first and fail-safe. If local delivery fails, the device is still revoked and
cleanup remains visibly unconfirmed. The cleanup authorization is short-lived, signed by the
existing server ticket key, and bound to `RelayDevice.id`, `RelayDevice.publicKey`, and a
per-retirement finalization public key. The Relay
opens a recipient-only completion proof before deleting its operator-domain key, device private key,
grant state, and config. It preserves a non-secret rollback-floor marker and rewrites the legacy key
tombstone so an older Relay cannot recreate identity during recovery. The server records local
cleanup only after receiving that proof, signs and stores a durable completion receipt, and erases the encrypted one-use
finalization seed. Relay recovery verifies against the public key already in its DPAPI receipt, so
normal ticket-key rotation cannot strand either cleanup retry or completion.

Browser profiles, cookies, Chromium state, and the Browser MCP token are not Relay-owned. Deleting
them must be initiated inside the Browser lifecycle with an independent confirmation. MultiZen is
never touched.

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

## Engineering Checkpoint - 14 August 2026

- Interactive and silent installer paths run conflict inspection before old-version uninstall or
  application/registry mutation.
- Standard-user inspection covers Browser/Relay processes, MultiZen, listeners on `47821`/`47822`,
  and Browser/Relay startup shortcuts without CIM elevation requirements.
- Repair removes only exact-target owned shortcut duplicates after all conflict checks pass. A
  disposable fixture verified that another installation's shortcut is preserved.
- Relay uninstall cleanup stops only the exact owned executable path, removes only matching shortcuts
  and the owned executable, and preserves `relay-config.json`. A disposable process fixture passed.
- PowerShell parsers, 23 packaging contracts, the complete Node 22 installer suite, real lint, and
  typecheck pass. A fresh unsigned NSIS installer compiled with the exact local Relay v11 payload;
  post-build legacy-profile tests prove the Node ABI and workspace links were restored.
- Destructive ownership is resolved as separate Relay retirement and Browser profile deletion.
  Signed Relay retirement, durable completion evidence, crash recovery, setup fail-closed behavior,
  ticket-key-rotation independence, and downgrade-resistant recovery are implemented and covered by
  focused tests. Relay v11 also passed its packaged retirement smoke path; its local installer is
  reproducible, while publication, Browser profile deletion, and all live matrices remain open.

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
4. Keep normal uninstall preserve-only. Implement ADMIN Relay retirement as a signed server-first
   protocol, and keep Browser profile deletion as a separate high-friction action.
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
- [x] Normal uninstall remains preserve-only
- [x] Signed ADMIN Relay retirement with recipient completion proof
- [ ] Separate high-friction Browser profile deletion
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
