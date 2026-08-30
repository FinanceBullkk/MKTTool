# MKB-03 — Windows onboarding, installer, and controlled updates

> **Historical execution plan — superseded 30 August 2026.** Relay v12, the old branches, and the
> pending rollout/rehearsal statuses below are retained evidence, not current release instructions.
> Use the consolidation plan for the current 0.3.13/P4b boundary; P4a Web is independent, and Lane C
> is **CLOSED** because no CloakBrowser channel exists.

**Started:** 12 August 2026 · **Estimate:** 10–15 days · **Status:** Phases 01-04 implemented; Phase 05 in progress after verified ceremony; Phase 06 engineering subset pushed

**Specification:** [MKT Browser plan §MKB-03](../260810-0244-mkt-browser-noi-bo/plan.md) — the "why"
and the gate wording live there. This directory is the execution plan only; do not restate the spec,
link to it.

**Status source:** [development-roadmap.md](../../docs/development-roadmap.md)

## Entry state, verified 12 August 2026

MKB-01, MKB-01E, and MKB-02 are green. The chain runs on a real PC: Relay 7 → MKT Browser contract 3
→ engine ready with all six capabilities. A per-user NSIS installer already builds, installs without
UAC, starts, drives the full chain, and uninstalls while preserving `profiles.db` and the MCP token.

That last part landed today. Before it, `build:win` skipped the Electron-ABI rebuild for
`better-sqlite3` and produced an installer whose application would not start. Phase 01 starts from a
working artifact rather than an unknown one.

## Decisions this phase inherits

- **v1 ships unsigned.** One SmartScreen click-through is permitted and must be announced on screen
  beforehand. A surprised operator still fails the gate.
- **Release authority is the offline manifest root key**, not Authenticode. There is no publisher
  check underneath it, so that key must stay offline and out of CI.
- **`LAUNCH_PROFILE` floor raise** is a recorded exception that expires at MKB-04.

## Phases

| # | Phase | Depends on | Status |
|---|---|---|---|
| 01 | [One installer carrying Relay and Browser](phase-01-one-installer-with-relay.md) | — | 🟡 Implemented; clean-account install/reboot/uninstall pending |
| 02 | [Setup controller and the announced SmartScreen journey](phase-02-setup-controller-and-smartscreen-journey.md) | 01 | 🟡 Implemented; SmartScreen capture, Chrome/Edge LNA verification, and clean-account reboot rehearsal pending |
| 03 | [Protected secrets and the diagnostics allowlist](phase-03-protected-secrets-and-diagnostics-allowlist.md) | — | 🟡 Implemented; live-install migration rehearsal pending |
| 04 | [Enrollment, grants, and ADMIN bootstrap](phase-04-enrollment-grants-and-admin-bootstrap.md) | 02, 03 | 🟡 Implemented; offline-admin, real reboot, and live-database-copy rehearsals pending |
| 05 | [Compatibility set, updates, and rollback](phase-05-compatibility-set-updates-and-rollback.md) | 01, 03 | 🟡 Ceremony verified; code complete and Relay v12 published with the installer rebuilt from it — real reboot and live Windows rehearsal pending |
| 06 | [Conflicts, repair, uninstall, and gate rehearsal](phase-06-conflicts-repair-uninstall-and-gate-rehearsal.md) | 01–05 | 🟡 Lifecycle and setup-conflict engineering subsets pushed; live Windows and unfamiliar-operator matrices remain open |

## Current critical path — synced 15 August 2026

**Phase-file checklist snapshot:** 53 of 65 items complete. This is implementation tracking, not a
release-readiness percentage; the physical, clean-Windows, network, and unfamiliar-operator gates
remain authoritative.

1. **Pushed baseline confirmed.** MKTTool `f447466` is on
   `origin/feat/mkt-browser-clean-break`; MKTBrowser `f8f1615` is on `origin/main`. Browser profile
   deletion and setup-time conflict readiness are complete. Relay v12 is the current local artifact
   and Browser contract-v4 payload.
2. **Release authority verified.** The public receipt binds the production root and delegated key,
   delegation expiry, separate physical custody, and successful recovery from backup B. Private key
   material remains outside the repositories and outside CI.
3. **Phase 05 is complete in code.** Manifest validation with all seven rejection cases, coordinated
   activation, fault-injected convergence, bounded rollback, post-activation smoke, and revocation
   memory are implemented and covered. What remains is evidence, not engineering: a real Windows
   reboot during activation, and the live update/rollback rehearsal.
4. **Done 16 August 2026.** Relay v12 is published to its immutable authenticated URL, and the
   Windows installer is rebuilt from that published object rather than from a local packaging path.
   The build machine authenticates with a route-scoped token, never a session cookie.
5. Run Phase 06 Windows matrices and the unfamiliar-operator rehearsal. Freeze the accepted MKB-03
   baseline only after every live and human gate is green, then begin the MKB-04 audit.

Phase 03 has no dependency on 01 or 02 and can run in parallel if a second pair of hands appears.
Phases 01 and 02 are the ones that produce something an operator can hold, so they go first.

## Ordering rationale

The owner asked that a slip cost a trimming rather than the whole milestone. So the order front-loads
the artifact an operator actually installs, and defers the machinery that only matters once several
devices exist.

Stopping after Phase 02 still leaves a usable outcome: one download, one guided setup, one device
enrolled by hand. Stopping after Phase 04 leaves the full team flow without controlled updates —
acceptable for a pilot on two devices, not for rollout. Only Phase 06 is a pure gate with no
shippable middle.

## Anti-open-ended guard

Phase 01 must produce a single installer carrying both components within four working days. If it has
not, stop and reassess rather than extending — the same guard MKB-02 used.

## Out of scope

macOS (MKB-07), UX redesign (MKB-06), device transfer (MKB-05), and any real-account use. Fixing
`build:mac` and `build:linux`, which carry the packaging defect repaired for Windows today, belongs
to MKB-07 and must happen before any macOS artifact is produced.
