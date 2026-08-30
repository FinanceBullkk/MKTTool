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
2. Capture the exact deployment metadata and readiness evidence without assuming that healthz carries
   a commit identity:

   ```powershell
   $railway = railway status --json | ConvertFrom-Json
   if ($LASTEXITCODE -ne 0) { throw 'Railway status could not be read.' }
   $railway | ConvertTo-Json -Depth 8 | Out-Host
   $health = Invoke-RestMethod 'https://mkttool-web-production.up.railway.app/api/healthz' -ErrorAction Stop
   if ($health.ok -ne $true -or $health.status -ne 'ready') { throw 'Readiness check failed.' }
   ```

   Compare the deployment `meta.commitHash` from Railway with the tuple. Use a separate,
   authenticated **full GET** of `/api/relay/download/v16` and a SHA-256 comparison when the route
   is part of the release; HEAD or a 401 body is not evidence. The token must come from the approved
   `RELAY_RELEASE_DOWNLOAD_TOKEN` environment variable and must never be printed.
3. Have the owner approve the exact target deployment/commit and recovery window. A rehearsal is not
   permission to touch production.

## Production decision sequence

1. Capture `railway status --json` immediately before the approved merge/deploy.
2. If the new deployment fails to become healthy, `meta.commitHash` is wrong, or the route contract
   is violated, stop traffic-changing actions and notify the owner.
3. The owner selects the recorded prior deployment/commit in Railway (dashboard or an explicitly
   reviewed CLI command). Do not use a bare `railway up`, force-push, or an unreviewed migration
   reversal.
4. Capture `railway status --json` immediately after the human-approved rollback and retain only the
   deployment ID, `meta.commitHash`, status, and timestamp in the receipt.

## Verify recovery from outside

- GET `/api/healthz`: require HTTP 200, `ok:true`, `status:"ready"`, database readiness, and the
  expected Relay version. The endpoint does not expose the source commit; verify that separately
  through `railway status --json` and its deployment `meta.commitHash`.
- Perform an authorized full GET of `/api/relay/download/v16` and compare bytes/hash. HEAD is not
  evidence. If the old deployment intentionally does not expose v16, keep the floor at 13 and tell
  the owner; do not strand devices.
- Check logs for migration errors and the Better Auth shared-IP warning with the bounded command
  below; sanitize output before retaining it:

  ```powershell
  railway logs --service mkttool-web --json | Out-Host
  if ($LASTEXITCODE -ne 0) { throw 'Railway logs could not be read.' }
  ```

  Run only the bounded, human-led smoke appropriate to the recovery window. A missing log stream is
  OPEN, never a clean result.

## Current tuple and limits

The recorded pre-merge baseline is deployment
`3621f603-1c51-4246-824c-55cc0e6b5764`, commit
`c819e6a8dff5cac027d24b4a9d488ec241e2ccaa`, with no healthcheck configured at capture time. The
fresh backup/restore receipt and candidate details are in
`plans/260830-0830-consolidation-and-lane-a-release/reports/lane-a-deploy.md`.

Rollback restores application/deployment state; it cannot recall a downloaded Relay EXE, revoke a
secret already copied to an operator machine, or manufacture a missing Browser engine archive.
Document those residual risks and return the final decision to the human.
