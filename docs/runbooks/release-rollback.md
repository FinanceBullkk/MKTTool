# Runbook: Lane A release rollback

Updated: 30 August 2026

Rollback is a human-approved recovery action, never an autonomous response. This procedure keeps a
known-good tuple and verifies service health before and after any approved change. A Railway
deployment rollback changes the application image; it does not automatically undo database
migrations or service-level settings such as `healthcheckPath`.

## Record before merge/deploy

Write a sanitized tuple containing:

- Railway project/environment/service and current deployment ID;
- current deployment commit (`c819e6a8` for the 30 August pre-merge baseline);
- candidate source SHA and migration action (`npx prisma migrate deploy`);
- current schema/migration state and Relay version;
- fresh backup path, byte count, and SHA-256;
- healthcheck path **configuration** (not only the plan; `/api/healthz` for the current service) and
  route/hash expectations.

Never put credentials, tokens, encrypted row values, or private signing keys in the tuple.

## Rehearse safely

1. Restore the recorded backup into a disposable database using
   [database-restore.md](database-restore.md); require equal aggregates and cleanup PASS.
2. Capture a small, sanitized deployment record and readiness evidence without assuming that healthz
   carries a commit identity. `railway status --json` contains much more metadata than belongs in a
   receipt, so project only the fields needed for rollback:

   ```powershell
   $statusRaw = railway status --json
   if ($LASTEXITCODE -ne 0) { throw 'Railway status could not be read.' }
   $status = $statusRaw | ConvertFrom-Json
   $instances = foreach ($environmentEdge in @($status.environments.edges)) {
     foreach ($instanceEdge in @($environmentEdge.node.serviceInstances.edges)) {
       if ($environmentEdge.node.name -eq 'production' -and $instanceEdge.node.serviceName -eq 'mkttool-web') {
         $instanceEdge.node
       }
     }
   }
   $instance = @($instances) | Select-Object -First 1
   if (-not $instance) { throw 'The production mkttool-web service could not be identified.' }
   $deployment = @($instance.activeDeployments | Where-Object { $_.status -eq 'SUCCESS' }) | Select-Object -First 1
   if (-not $deployment) { throw 'The production mkttool-web service has no successful active deployment.' }
   if ($deployment.status -ne 'SUCCESS' -or [string]::IsNullOrWhiteSpace($deployment.meta.commitHash)) {
     throw 'The linked mkttool-web deployment is not a successful, hash-identified deployment.'
   }
   [pscustomobject]@{
     deploymentId = $deployment.id
     status = $deployment.status
     commitHash = $deployment.meta.commitHash
     createdAt = $deployment.createdAt
   } | ConvertTo-Json -Compress

   $healthResponse = Invoke-WebRequest -Uri 'https://mkttool-web-production.up.railway.app/api/healthz' `
     -Method Get -MaximumRedirection 0 -ErrorAction Stop
   if ($healthResponse.StatusCode -ne 200) {
     throw "Readiness route returned HTTP $($healthResponse.StatusCode)."
   }
   $health = $healthResponse.Content | ConvertFrom-Json
   if (
     $health.ok -ne $true -or
     $health.status -ne 'ready' -or
     $health.checks.database -ne 'ok' -or
     $health.checks.releaseMetadata -ne 'ok' -or
     $health.relayVersion -notmatch '^\d+$' -or
     [int]$health.relayVersion -le 0
   ) { throw 'Readiness body did not satisfy the healthz contract.' }

   $query = 'query {{ serviceInstance(environmentId: "{0}", serviceId: "{1}") {{ healthcheckPath healthcheckTimeout }} }}' -f $instance.environmentId, $instance.serviceId
   $healthcheckRaw = railway api $query --compact
   if ($LASTEXITCODE -ne 0) { throw 'Railway service healthcheck configuration could not be read.' }
   $healthcheck = $healthcheckRaw | ConvertFrom-Json
   if (-not $healthcheck.data.serviceInstance) { throw 'Railway returned no service healthcheck configuration.' }
   $healthcheck.data.serviceInstance | Select-Object healthcheckPath, healthcheckTimeout | ConvertTo-Json -Compress
   ```

   Compare the deployment `meta.commitHash` from Railway with the tuple. Use a separate,
   authenticated **full GET** of `/api/relay/download/v16` and a SHA-256 comparison when the route
   is part of the release; HEAD or a 401 body is not evidence. The token must come from the approved
   `RELAY_RELEASE_DOWNLOAD_TOKEN` environment variable and must never be printed.
   The deployment's historical `serviceManifest.deploy.healthcheckPath` may still be `null` even
   when the current service setting is `/api/healthz`; the `serviceInstance` query above is the
   source of truth.
3. Have the owner approve the exact target deployment/commit and recovery window. A rehearsal is not
   permission to touch production.

## Production decision sequence

1. Capture `railway status --json` immediately before the approved merge/deploy.
2. If the new deployment fails to become healthy, `meta.commitHash` is wrong, or the route contract
   is violated, stop traffic-changing actions and notify the owner.
3. The owner selects the recorded prior deployment/commit in Railway's dashboard or API after
   reviewing schema compatibility. The Railway CLI's `redeploy` command targets the **latest**
   deployment; it is not an arbitrary historical rollback selector. Do not use it without first
   proving that its target is the approved tuple. Do not use a bare `railway up`, force-push, or an
   unreviewed migration reversal.
4. Capture the small status projection from the rehearsal step immediately after the human-approved
   rollback and retain only the deployment ID, `meta.commitHash`, status, and timestamp in the
   receipt. Re-run the `serviceInstance` query and record the effective `healthcheckPath` separately;
   deployment rollback does not restore that service setting.

## Verify recovery from outside

- GET `/api/healthz`: require HTTP 200, `ok:true`, `status:"ready"`, database readiness, and the
  expected Relay version. The endpoint does not expose the source commit; verify that separately
  through `railway status --json` and its deployment `meta.commitHash`. Re-run the no-redirect GET
  after the rollback, not only before it.
- Perform an authorized **full GET** of `/api/relay/download/v16` and compare the complete byte
  count and SHA-256. HEAD, a redirect, or a 401 body is not evidence:

  ```powershell
  $routeBase = 'https://mkttool-web-production.up.railway.app'
  $expectedRelayBytes = 33342752
  $expectedRelaySha = '5c98cf460e62f83b484c9ecd55bc80b650f2e19a09e8ded6e99eafb682e1842e'
  $token = $env:RELAY_RELEASE_DOWNLOAD_TOKEN
  if ([string]::IsNullOrWhiteSpace($token)) { throw 'RELAY_RELEASE_DOWNLOAD_TOKEN is unavailable.' }
  $archive = Join-Path $env:TEMP ('rollback-relay-v16-' + [Guid]::NewGuid().ToString('N') + '.zip')
  try {
    $response = Invoke-WebRequest -Uri "$routeBase/api/relay/download/v16" -Method Get `
      -Headers @{ Authorization = "Bearer $token" } -OutFile $archive -PassThru `
      -MaximumRedirection 0 -ErrorAction Stop
    if ($response.StatusCode -ne 200) { throw "Relay route returned HTTP $($response.StatusCode)." }
    $bytes = (Get-Item -LiteralPath $archive).Length
    if ($bytes -ne $expectedRelayBytes) { throw "Relay byte count mismatch: $bytes." }
    $sha = (Get-FileHash -LiteralPath $archive -Algorithm SHA256).Hash.ToLowerInvariant()
    if ($sha -ne $expectedRelaySha) { throw "Relay SHA-256 mismatch: $sha." }
    [pscustomobject]@{ status = 'PASS'; bytes = $bytes; sha256 = $sha } | ConvertTo-Json -Compress
  }
  finally {
    Remove-Item -LiteralPath $archive -Force -ErrorAction SilentlyContinue
  }
  ```

  If the approved old deployment intentionally does not expose v16, leave the floor at 13 and tell
  the owner; do not strand devices.
- Check logs for migration errors and the Better Auth shared-IP warning with an explicit deployment
  ID and a bounded query. Without an ID, Railway defaults to the latest successful deployment, which
  can hide a rollback target's failure. Sanitize output before retaining it:

  ```powershell
  $targetDeploymentId = '<human-approved target deployment UUID>'
  if ($targetDeploymentId -notmatch '^[0-9a-fA-F-]{36}$') { throw 'Set the approved target deployment UUID.' }
  $logLines = railway logs $targetDeploymentId --service mkttool-web --json --lines 200 `
    --filter 'migration OR "Rate limiting could not determine a client IP"'
  if ($LASTEXITCODE -ne 0) { throw 'Railway logs could not be read.' }
  $logLines | Out-Host
  ```

  `--lines 200` makes the query finite; a missing log stream is OPEN, never a clean result. Run only
  the bounded, human-led smoke appropriate to the recovery window.

## Current tuple and limits

The recorded pre-merge baseline is deployment
`3621f603-1c51-4246-824c-55cc0e6b5764`, commit
`c819e6a8dff5cac027d24b4a9d488ec241e2ccaa`, with no healthcheck configured at capture time. The
fresh backup/restore receipt and candidate details are in
`plans/260830-0830-consolidation-and-lane-a-release/reports/lane-a-deploy.md`.

The current service-level setting is `healthcheckPath=/api/healthz`; verify it with the
`serviceInstance` query above after every approved deployment or rollback. The deployment manifest
is a historical snapshot and may show `null`, so it is not sufficient evidence. The latest production
schema includes the applied migration `20260830030000_add_better_auth_rate_limit`; a deployment
rollback does not unapply it. Prisma migrations are forward-only: never run `migrate reset`, delete
rows from `_prisma_migrations`, or invent a down migration during an incident. If the prior app is
not compatible with the current schema, stop and return the decision to the owner.

Rollback restores application/deployment state; it cannot recall a downloaded Relay EXE, revoke a
secret already copied to an operator machine, or manufacture a missing Browser engine archive.
Document those residual risks and return the final decision to the human.
