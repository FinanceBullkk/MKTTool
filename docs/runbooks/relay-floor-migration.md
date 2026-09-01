# Runbook: Relay compatibility-floor migration

Updated: 1 September 2026

This runbook moves the server ticket floor only after operators can download and install the new
Relay. It is deliberately route-first and fail-closed.

## Current state (post-deploy record)

- `MIN_RELAY_VERSION` is **13** in `src/lib/tickets/ticket-types.ts`.
- Two active devices belong to the owner (Q15). One machine has completed the self-serve 0.3.13
  reinstall and reports Relay v16; the second remains unobserved. No notification channel or
  acknowledgement is needed, but the floor stays 13 until the second observation exists.
- **Historical pre-merge snapshot:** the earlier `/api/relay/download/v16` probe returned 401, not
  bytes. That was not route-first evidence and must not override the current post-deploy full-GET
  record in `reports/fleet-migration.md` and `reports/lane-a-deploy.md`. The immutable v16 target SHA is
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

### Executable route and inventory receipt

Run the following from a shell whose database connection and release token were injected by the
approved secret store. Do not paste a production URL, cookie, or token into the command line or a
report. The `PG*` variables must refer to the current production database and use TLS; a missing or
ambiguous variable is a blocked gate, not a reason to guess.

```powershell
Set-Location E:\MKTWorkspace\MKTTool
$requiredPg = 'PGHOST','PGPORT','PGDATABASE','PGUSER','PGPASSWORD','PGSSLMODE'
if ($requiredPg | Where-Object { [string]::IsNullOrWhiteSpace([Environment]::GetEnvironmentVariable($_)) }) {
  throw 'PGHOST/PGPORT/PGDATABASE/PGUSER/PGPASSWORD/PGSSLMODE must be loaded by the approved secret mechanism.'
}
if ($env:PGSSLMODE -notin @('require', 'verify-ca', 'verify-full')) {
  throw 'PGSSLMODE must require TLS (require, verify-ca, or verify-full).'
}
$inventorySql = @'
SELECT COALESCE("relayVersion"::text, 'unknown') AS relay_version,
       CASE WHEN "revokedAt" IS NULL THEN 'active' ELSE 'revoked' END AS state,
       COUNT(*)::int AS device_count
FROM "RelayDevice"
GROUP BY 1, 2
ORDER BY 1, 2;
'@
$psqlPath = if ($env:PSQL_PATH) {
  if (-not (Test-Path -LiteralPath $env:PSQL_PATH -PathType Leaf)) {
    throw 'PSQL_PATH does not name a readable executable.'
  }
  (Resolve-Path -LiteralPath $env:PSQL_PATH).Path
} else {
  (Get-Command psql -ErrorAction Stop).Source
}
$inventory = $inventorySql | & $psqlPath --no-psqlrc --no-password --set ON_ERROR_STOP=1 --tuples-only --csv
if ($LASTEXITCODE -ne 0) { throw 'Aggregate RelayDevice inventory failed.' }
$inventory

$base = 'https://mkttool-web-production.up.railway.app'
$expectedSha = '5c98cf460e62f83b484c9ecd55bc80b650f2e19a09e8ded6e99eafb682e1842e'
$expectedBytes = 33342752
$token = $env:RELAY_RELEASE_DOWNLOAD_TOKEN
if ([string]::IsNullOrWhiteSpace($token)) { throw 'RELAY_RELEASE_DOWNLOAD_TOKEN is not available; route gate remains OPEN.' }
$headers = @{ Authorization = "Bearer $token" }
$body = Join-Path $env:TEMP ('relay-v16-' + [Guid]::NewGuid().ToString('N') + '.zip')
try {
  $response = Invoke-WebRequest -Uri "$base/api/relay/download/v16" -Method Get -Headers $headers `
    -OutFile $body -PassThru -MaximumRedirection 0 -ErrorAction Stop
  if ($response.StatusCode -ne 200) { throw "Relay v16 full GET returned HTTP $($response.StatusCode)." }
  $bytes = (Get-Item -LiteralPath $body).Length
  if ($bytes -ne $expectedBytes) { throw "Relay v16 byte count mismatch: $bytes (expected $expectedBytes)." }
  $hash = (Get-FileHash -LiteralPath $body -Algorithm SHA256).Hash.ToLowerInvariant()
  if ($hash -ne $expectedSha) { throw "Relay v16 hash mismatch: $hash." }
  [pscustomobject]@{ status = 'PASS'; bytes = $bytes; sha256 = $hash }
}
finally {
  Remove-Item -LiteralPath $body -Force -ErrorAction SilentlyContinue
}

$health = Invoke-RestMethod -Uri "$base/api/healthz" -Method Get -MaximumRedirection 0 -ErrorAction Stop
if (
  $health.ok -ne $true -or
  $health.status -ne 'ready' -or
  $health.checks.database -ne 'ok' -or
  $health.checks.releaseMetadata -ne 'ok' -or
  $health.checks.r2 -ne 'ok' -or
  $health.relayVersion -ne 16
) {
  throw 'Readiness response did not prove HTTP 200, ok=true, status=ready, all release checks ok, and relayVersion=16.'
}
$statusRaw = railway status --json
if ($LASTEXITCODE -ne 0) { throw 'Railway deployment metadata could not be read.' }
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
```

`/api/healthz` proves readiness and the published Relay version; it does **not** prove the source
commit. Compare `meta.commitHash` in the small sanitized deployment record above with the candidate
SHA before recording a deployment PASS. Railway's historical deployment manifest may show a null
healthcheck path even after the service setting changes; verify the live service-level setting with
the `serviceInstance` query in [release-rollback.md](release-rollback.md).

On each owner machine, use an owner-approved 0.3.13 installer receipt **if one is available** and
observe the local Relay; the Browser tuple/installer is not publicly distributed by this release
record. Do not infer the result from the database:

```powershell
$base = 'https://mkttool-web-production.up.railway.app'
Get-FileHash -LiteralPath 'C:\path\to\MKTBrowser-win-x64.exe' -Algorithm SHA256
Start-Process -FilePath 'C:\path\to\MKTBrowser-win-x64.exe' -Wait
$localHealth = Invoke-RestMethod -Uri 'http://127.0.0.1:47821/health' -Headers @{ Origin = $base } -MaximumRedirection 0 -ErrorAction Stop
if ($localHealth.relayVersion -ne 16) { throw 'The owner machine did not report Relay v16.' }
$localHealth | Select-Object relayVersion | ConvertTo-Json -Compress
```

Record only `relayVersion: 16`, timestamp, and PASS/FAIL for each owner machine. Because U3 did not
establish one canonical outer-installer hash, use only an owner-approved 0.3.13 installer receipt;
do not treat the historical `e5623b8a…` candidate hash as a universal release hash. A missing
receipt or local observation leaves the floor at 13.

After the preconditions pass, edit only the intended constant and run the focused floor/rejection
tests plus the full CI suite. `MIN_RELAY_VERSION_BY_KIND` must continue to derive via
`Math.max`; inspect the resulting values before deployment. The under-floor response must retain
`RELAY_TOO_OLD`, name the running and required versions, and tell the operator to download the
updated Relay from the web app.

Probe the complete matrix after deployment: v13, v14, and v15 reject; v16 accepts; unknown and
too-new values fail safely. Keep the old v15 tuple as negative evidence and mark it revoked where
the compatibility system supports that state. Revocation cannot recall an EXE already on disk; the
floor is the enforcement mechanism.

The focused source checks are (all four paths exist in this tree):

```powershell
npx vitest run `
  src/lib/tickets/ticket-min-relay-version-floor.test.ts `
  src/lib/tickets/ticket-min-relay-version-downgrade.test.ts `
  src/lib/tickets/ticket-min-version-by-kind.test.ts `
  src/lib/release/compatibility-update-actions.database.test.ts
if ($LASTEXITCODE -ne 0) { throw 'Relay floor compatibility checks failed.' }
```

Do not edit `MIN_RELAY_VERSION` until the route hash, fresh inventory, and both observed owner
machine reinstalls are all recorded. Revoke the old tuples through the authenticated application or
admin action; do not invent a direct SQL mutation for revocation.

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
