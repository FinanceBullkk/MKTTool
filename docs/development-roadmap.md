# Development roadmap

**Updated:** 31 October 2026

## Current state — after the 31 October 2026 surgery

Branch `surgery/261031` cut the repository back to the product scope recorded in
[project-overview-pdr.md](project-overview-pdr.md): internal identity vault, proxy vault, Relay PC
registry, and signed-ticket launch through the local Relay into MKT Browser profiles. Three cuts
were made in one pass (see the surgery commit's parent in git history for the removed surface):

1. Out-of-scope posting surface removed (content library, queue, rules engine, shadowban/health
   observer, observer proxies, posting targets, Facebook Pages publisher and OAuth).
2. Release ceremony machinery removed (offline release-signing ceremony, signed compatibility
   sequences, release-authority tooling).
3. Relay self-update platform removed — Relay updates by reinstalling from `/setup`.

Historical documents describing the removed surface were moved to
[docs/archive/](archive/README.md); they are records, not instructions.

## What is green

Verified on branch `surgery/261031` at the surgery commit:

| Check | Result |
|---|---|
| `npm run typecheck` | 0 errors |
| `npm run test:no-db` | 1625/1625 |
| `npm run test:relay` | 430/430 |
| `npm test` (full suite, dedicated `*_test` PostgreSQL database) | 1847/1847 |
| `npm run build` | 15 routes |

The surviving surfaces are the ones these suites cover: vault CRUD and readiness, proxy liveness
and bandwidth, Relay enrollment/grant/revocation/retirement, ticket issuance and sealed-box
decryption, setup, and the authenticated R2 download path.

## Known follow-ups

1. **~~Railway service restore~~ RESOLVED differently (31 Oct 2026):** the owner retired Railway
   entirely. Hosting is now the owner's machine over Tailscale (see docs/deployment-guide.md).
2. **Railway service restore (historical).** The production URL returned 404; the Railway service is
   not wired to this repository. Restore the service, confirm it deploys from `master`, and verify
   `/api/healthz` reports `ready` with database, releaseMetadata, and r2 checks `ok` on the exact
   deployed SHA. Until that is done there is no running production, and the "push to master deploys
   production" warning is dormant rather than false.
2. **Real operator onboarding.** The setup journey (install Relay from `/setup`, register PC,
   administrator approval, operator-key grant, first ticket launch) needs one end-to-end pass with
   an operator who did not build the tool. The 5-6 person team has not yet been onboarded onto the
   post-surgery product.
3. **Relay reinstall flow for updates.** Self-update was removed on purpose. Confirm in practice
   that reinstalling from `/setup` preserves identity and profiles as designed (the repair path
   claims this; an observed reinstall on a real operator PC is still owed), and that operators can
   actually discover when their Relay is below a ticket's version floor.

## Non-goals (stable)

- No posting automation of any kind; the posting surface is removed, not parked. Re-entry is an
  explicit owner decision starting from git history.
- No identity-isolation, antidetect, or fingerprint work. `G2-IDENTITY=FAIL` and the Lane C closure
  remain recorded.
- No macOS Relay/Browser builds; Windows x64 remains the only v1 platform.

## Historical record

The dated checkpoint log that used to live in this file (installer candidates, compatibility
sequences, release gates, per-day verification receipts up to 2 October 2026) is preserved in git
history on this branch — see the pre-surgery version of `docs/development-roadmap.md`. For the same
reason [docs/project-changelog.md](project-changelog.md) keeps its dated entries below the surgery
entry: history is not rewritten, it is only no longer the front page.
