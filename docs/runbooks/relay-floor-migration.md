# Runbook: Relay compatibility-floor migration

Updated: 30 August 2026

This runbook moves the server ticket floor only after operators can download and install the new
Relay. It is deliberately route-first and fail-closed.

## Current state

- `MIN_RELAY_VERSION` is **13** in `src/lib/tickets/ticket-types.ts`.
- Two active v15 devices belong to the owner (Q15). The remedy is a self-serve 0.3.13 reinstall on
  each machine; no notification channel or acknowledgement is needed.
- The pre-merge `/api/relay/download/v16` probe returned 401, not bytes. This is not route-first
  evidence. The immutable v16 target SHA is
  `5c98cf460e62f83b484c9ecd55bc80b650f2e19a09e8ded6e99eafb682e1842e`.
- Lane C is closed (Q16): there is no CloakBrowser channel, no request, and no date. The Browser
  five-artifact tuple is a separate P4b technical OPEN and does not authorize a floor change.

## Hard preconditions

1. P4a production deployment succeeded and `railway status` identifies the new commit.
2. Take a fresh aggregate-only fleet inventory after that deployment. Never include device, owner,
   account, public-key, or grant identifiers.
3. Using an authorized operator session (do not put cookies/tokens in shell history), perform a
   **full GET**, never HEAD, of `/api/relay/download/v16`. Compare HTTP success, byte count, and
   SHA-256 to the immutable v16 object. A 401/redirect/metadata response is a failed gate.
4. On both owner machines, reinstall the 0.3.13 installer and observe a v16 Relay health response.
   Record the observation; do not infer installed bytes from the database or fixture labels.
5. Obtain human approval for the source change and deployment. A rollback always returns to the
   human.

## Migration sequence

```text
fresh inventory → authorized full GET/hash of /v16 → owner-machine reinstall(s)
→ probe v13/v14/v15/v16/unknown/too-new → edit floor 13→16
→ typecheck/tests/build → merge/deploy → verify effective per-kind floors
```

After the preconditions pass, edit only the intended constant and run the focused floor/rejection
tests plus the full CI suite. `MIN_RELAY_VERSION_BY_KIND` must continue to derive via
`Math.max`; inspect the resulting values before deployment. The under-floor response must retain
`RELAY_TOO_OLD`, name the running and required versions, and tell the operator to download the
updated Relay from the web app.

Probe the complete matrix after deployment: v13, v14, and v15 reject; v16 accepts; unknown and
too-new values fail safely. Keep the old v15 tuple as negative evidence and mark it revoked where
the compatibility system supports that state. Revocation cannot recall an EXE already on disk; the
floor is the enforcement mechanism.

## Stop conditions

- Route is not a successful full GET/hash match: leave the floor at 13.
- Either owner machine cannot reinstall/report v16: leave the floor at 13 and escalate.
- Any probe, per-kind derivation, or actionable-message test fails: do not deploy.
- A deployment is unhealthy: stop and return to the rollback runbook; do not autonomously roll back.

## Evidence template

Record timestamp, deployed commit, aggregate counts, route status/bytes/hash, both owner-machine
v16 observations, probe outcomes, effective per-kind floors, and the human decision. Store no
identifiers or secrets. The current migration record is
`plans/260830-0830-consolidation-and-lane-a-release/reports/fleet-migration.md`.
