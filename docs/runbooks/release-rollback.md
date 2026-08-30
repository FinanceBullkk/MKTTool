# Runbook: Lane A release rollback

Updated: 30 August 2026

Rollback is a human-approved recovery action, never an autonomous response. This procedure keeps a
known-good tuple and verifies service health before and after any approved change.

## Record before merge/deploy

Write a sanitized tuple containing:

- Railway project/environment/service and current deployment ID;
- current deployment commit (`c819e6a8` for the 30 August pre-merge baseline);
- candidate source SHA and migration action (`npx prisma migrate deploy`);
- current schema/migration state and Relay version;
- fresh backup path, byte count, and SHA-256;
- healthcheck path plan (`/api/healthz`) and route/hash expectations.

Never put credentials, tokens, encrypted row values, or private signing keys in the tuple.

## Rehearse safely

1. Restore the recorded backup into a disposable database using
   [database-restore.md](database-restore.md); require equal aggregates and cleanup PASS.
2. Exercise the candidate and prior application tuple in that disposable environment. Confirm the
   readiness route, authenticated Relay download, and migration direction.
3. Have the owner approve the exact target deployment/commit and recovery window. A rehearsal is not
   permission to touch production.

## Production decision sequence

1. Capture `railway status --json` immediately before the approved merge/deploy.
2. If the new deployment fails to become healthy, returns the wrong commit, or violates the route
   contract, stop traffic-changing actions and notify the owner.
3. The owner selects the recorded prior deployment/commit in Railway (dashboard or an explicitly
   reviewed CLI command). Do not use a bare `railway up`, force-push, or an unreviewed migration
   reversal.
4. Capture `railway status --json` immediately after the human-approved rollback.

## Verify recovery from outside

- GET `/api/healthz`: require HTTP 200, `ok:true`, `status:"ready"`, expected commit/release state,
  database readiness, and the expected Relay version.
- Perform an authorized full GET of `/api/relay/download/v16` and compare bytes/hash. HEAD is not
  evidence. If the old deployment intentionally does not expose v16, keep the floor at 13 and tell
  the owner; do not strand devices.
- Check logs for migration errors and the Better Auth shared-IP warning. Run only the bounded,
  human-led smoke appropriate to the recovery window.

## Current tuple and limits

The recorded pre-merge baseline is deployment
`3621f603-1c51-4246-824c-55cc0e6b5764`, commit
`c819e6a8dff5cac027d24b4a9d488ec241e2ccaa`, with no healthcheck configured at capture time. The
fresh backup/restore receipt and candidate details are in
`plans/260830-0830-consolidation-and-lane-a-release/reports/lane-a-deploy.md`.

Rollback restores application/deployment state; it cannot recall a downloaded Relay EXE, revoke a
secret already copied to an operator machine, or manufacture a missing Browser engine archive.
Document those residual risks and return the final decision to the human.
