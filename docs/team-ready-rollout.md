# Team-ready rollout

**Updated:** 13 September 2026
**Status:** `PASS` for the MKTTool Web shared-workspace surface; `HOLD` for MKT Browser installer
distribution.

This is the current operator handoff. Historical release notes and the longer Vietnamese guide may
describe older Browser or posting flows; this document wins when they differ.

## What the team can use now

The production Web surface is ready for controlled internal work:

- Workspace overview and next-action status
- Shared nick vault and ownership assignment
- Proxy inventory, assignment, checks, and admin-controlled changes
- Relay PC enrollment, approval, key delivery, retirement, and recovery
- Setup checks for the Relay-first workspace handoff

The following remain outside the team handoff:

- Reddit or Facebook posting, queue execution, and health-check operations
- TikTok posting, scheduling, warmup, or automation
- MKT Browser installer distribution to ordinary operators
- Real-account approval, unattended automation, fingerprint, identity-isolation, or account-safety
  claims

The invariant remains: **one browser-backed nick = one static proxy = one browser profile = one
assigned Relay PC**. This is an ownership/control rule, not identity evidence.

## Verified production baseline

| Check | Result | Evidence |
|---|---|---|
| Production health | `PASS` — HTTP 200, `status=ready` | `https://mkttool-web-production.up.railway.app/api/healthz` checked 13 September 2026 |
| Dependencies | `PASS` — database, release metadata, and R2 all `ok` | Same health response |
| Deployment | `PASS` — Railway Web deployment verified after the rollout push | Exact deployed SHA is recorded in the release receipt; `/api/healthz` was rechecked 13 September 2026 |
| Relay release | `PASS` — v17 route and byte read-back verified | Authenticated release evidence |
| Team allowlist | `OPEN` until the final roster is confirmed | Do not infer or expand the roster from existing configuration |

The health response proves the service is online. It does not grant access to an unlisted email, make
the Browser installer current, or authorize a posting workflow.

## Admin preflight

Complete these steps before inviting a teammate:

1. Confirm the exact team roster with the owner. Put only those addresses in `ALLOWED_EMAILS` and
   keep `ADMIN_EMAILS` as a subset. Never guess an address or paste the values into chat.
2. Redeploy/restart after the allowlist change, then test one sign-in per person. Authorization is
   checked on every request, so removing an address takes effect without waiting for a session expiry.
3. Have the operator open `/setup`, download Relay from the authenticated control, and register the
   current PC. Do not send a raw ZIP, token, private key, profile directory, or `.env` value.
4. Approve the Relay PC and deliver the operator-key grant from `/relay-devices`. The operator key
   stays on the recipient's Relay PC; it is not a shared chat secret.
5. Assign each active nick to its responsible operator, static proxy, and Relay PC before handing
   over work.

If the allowlist, Relay download, device approval, or key-delivery step fails, stop and contact the
ADMIN. Do not work around it with a local database, copied credentials, or an old installer.

## Daily operator path

1. Open `https://mkttool-web-production.up.railway.app` in Chrome and sign in with the company Google
   account that ADMIN approved.
2. Use the overview to see the next handoff action. Work in **Nick vault**, **Proxy vault**, and
   **Relay PCs** only; the parked posting routes may still be visible but are not rollout instructions.
3. Keep ownership changes explicit. Ask ADMIN before changing a nick's proxy or Relay PC, and never
   reuse a proxy between browser-backed nicks.
4. If a warning is yellow/red, a device is revoked, or a local Relay check is uncertain, capture the
   non-sensitive status and stop. Do not paste keys, tokens, proxy passwords, or profile data into a
   ticket or chat.

## Browser distribution hold

The current Browser candidate is:

`20260913-browser-0.3.23-relay-17-relay-payload-hash-fix-cft`

It has published compatibility artifacts, but it is **not operator-promoted**. The production
approval binding still does not match the source candidate, so the installer path must remain
fail-closed. The accepted `0.3.17` / Relay `17` tuple is historical release evidence, not a reason to
hand a new team member an installer.

Do not:

- download or advertise the Windows installer route;
- reuse the old `0.3.17`, `0.3.16`, `0.3.15`, `0.3.14`, `0.3.13`, or `0.3.12` packages;
- install a locally rebuilt EXE or substitute an upstream engine;
- use Browser with real accounts, multiple simultaneous profiles, or any identity-isolation claim.

Browser promotion stays `NO-GO` until the exact CFT activation, packaged Relay/proxy failure and
recovery, machine integration, unfamiliar-operator, second-PC, SmartScreen/UAC, seven-day canary,
and remaining credential-exposure gates are independently closed. See the [current readiness report](../../plans/reports/release-260913-1030-browser-0.3.23-release-readiness.md).

## Status language

- `PASS` means the named check was observed and recorded.
- `OPEN` means evidence or an owner action is still missing.
- `HOLD` means distribution is intentionally paused.
- `NO-GO` means the Browser promotion decision is negative; it does not make the Web vault unusable.

## Owner actions still required

- Confirm and apply the actual team email roster; verify each operator can sign in.
- Keep the Web/Relay handoff separate from the Browser release decision.
- Choose a deliberate continuation path for the accepted 0.3.17 tuple or complete the 0.3.23
  acceptance cycle; do not silently mix the two tuples.
- Finish the production credential-exposure inventory and coordinated rotations recorded in the
  roadmap before expanding trust or distribution.

## References

- [Internal beta boundary](internal-beta-release.md)
- [Development roadmap](development-roadmap.md)
- [Product decision](project-overview-pdr.md)
- [Legacy daily guide](huong-dan-van-hanh-cho-team.md)
