# Phase 02 — Setup controller and the announced SmartScreen journey

## Context links

- Spec: [MKT Browser plan §8.1 state table, §MKB-03A](../260810-0244-mkt-browser-noi-bo/plan.md)
- Unsigned decision and its compensating requirement: same plan, code-signing decision block

## Overview

**Priority:** high — this is the phase an operator experiences.
**Status:** ⬜ blocked on Phase 01.

Replace `/setup`, `/relay-download`, and `/relay-devices` as a journey with one resumable controller
that shows a single state and a single next action. The four-layer diagnostic view moves behind a
support/ADMIN disclosure.

## Key insights

- Readiness is **local and current**. Historical enrollment must never render `Ready`. MKB-02 already
  built the evaluator — `currentDeviceBrowserReadiness()` — so this phase renders it rather than
  inventing a second judgement.
- `Waiting for administrator approval` is a **success state**, not an error. It has to survive page
  close, browser restart, and reboot without duplicating enrollment.
- **`Confirm this PC` must stay a deliberate click.** The first browser-to-loopback request has to be
  user-triggered for Local Network Access permission. This is not a place to be clever.
- Because v1 is unsigned, the journey must **predict SmartScreen before it appears**, with a
  screenshot marking *More info* and *Run anyway*. An operator who has to ask what the warning means
  fails the gate even though the click itself is allowed.

## Requirements

- One primary state at a time: `Starting`, `Sign in`, `Confirm this PC`, `Waiting for administrator
  approval`, `Ready`, `Needs repair`. Each has exactly one primary action.
- State is derived from the current local PC: authenticated owner, registry state, live
  Relay/Browser/engine health, contract compatibility, update state.
- The download step shows the SmartScreen warning in advance with a marked screenshot.
- Owner/device reconciliation fails closed on wrong signed-in user, previous owner, revoked key, or a
  shared Windows account, and routes to an ADMIN path rather than guessing.
- Chrome and Edge Local Network Access allow, deny, recover, and retry are distinguishable from "not
  installed" and need no reinstall.

## Related code files

**Modify**
- `MKTTool/src/app/setup/` — collapse into the one controller
- `MKTTool/src/components/relay/relay-enroll-card.tsx` — becomes the state renderer
- `MKTTool/src/lib/relay/current-device-browser-health.ts` — extend to the full six-state machine
- `MKTTool/src/lib/relay/relay-endpoints.ts` — any additional readiness fields

**Create**
- `MKTTool/src/lib/setup/setup-state-machine.ts` — pure state derivation, unit-testable without a browser
- `MKTTool/src/components/setup/smartscreen-guidance.tsx` — the pre-announcement with screenshot

## Implementation steps

1. Write the state machine as a pure function first: inputs are session, device registry row, live
   Relay health, and update state; output is one state plus one action. Test it before any UI.
2. Render the six states, with the four technical layers behind a disclosure.
3. Add the SmartScreen pre-announcement to the download step, with a real screenshot captured from
   this build.
4. Make `Confirm this PC` the only trigger for the first loopback call, and show the detected PC name
   and signed-in email before binding.
5. Make every state survive reload and reboot. Verify by reloading in each state.
6. Test the real Local Network Access paths in Chrome and Edge against the deployed HTTPS origin.

## Todo list

- [ ] `setup-state-machine.ts` with unit tests covering all six states and the failure branches
- [ ] Six states rendered, one action each
- [ ] Technical layers behind support disclosure
- [ ] SmartScreen pre-announcement with screenshot
- [ ] `Confirm this PC` gated on a real user click
- [ ] Reload and reboot survive every state
- [ ] Chrome and Edge permission allow/deny/recover verified

## Success criteria

An unfamiliar operator reaches `Waiting for administrator approval` or `Ready` without asking a
question. Closing the page mid-flow and reopening it resumes the same state. A wrong signed-in user
produces `Needs repair` with an ADMIN action, never a silent success.

## Risk assessment

- **Local Network Access behaviour differs between Chrome and Edge and changes between versions.**
  Test against the real deployed origin, not localhost, and record observed behaviour rather than
  assuming.
- Collapsing three existing routes risks losing a path someone depends on. The current technical
  routes stay reachable until Phase 06 retires them.

## Security considerations

Loopback routes enforce exact origin, method, and bounded body; CORS is not authorization. No secret
travels in a URL, custom protocol, deep link, or callback. The setup page never displays a token,
operator key, device ID, or path.

## Next steps

Phase 04 hardens what this phase renders: the grant delivery and completion proof behind
`Waiting for administrator approval`.
