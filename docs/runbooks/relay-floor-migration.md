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

### Executable route and inventory receipt

Run the following from a shell whose database connection and release token were injected by the
approved secret store. Do not paste a production URL, cookie, or token into the command line or a
report. The `PG*` variables must refer to the current production database; a missing variable is a
blocked gate, not a reason to guess.

```powershell
Set-Location E:\MKTWorkspace\MKTTool
$requiredPg = 'PGHOST','PGPORT','PGDATABASE','PGUSER','PGPASSWORD'
if ($requiredPg | Where-Object { [string]::IsNullOrWhiteSpace([Environment]::GetEnvironmentVariable($_)) }) {
  throw 'PGHOST/PGPORT/PGDATABASE/PGUSER/PGPASSWORD must be loaded by the approved secret mechanism.'
}
$inventorySql = @'
SELECT COALESCE("relayVersion"::text, 'unknown') AS relay_version,
       CASE WHEN "revokedAt" IS NULL THEN 'active' ELSE 'revoked' END AS state,
       COUNT(*)::int AS device_count
FROM "RelayDevice"
GROUP BY 1, 2
ORDER BY 1, 2;
'@
$inventory = $inventorySql | & (Get-Command psql -ErrorAction Stop).Source --no-psqlrc --no-password --tuples-only --csv
if ($LASTEXITCODE -ne 0) { throw 'Aggregate RelayDevice inventory failed.' }
$inventory

$base = 'https://mkttool-web-production.up.railway.app'
$expectedSha = '5c98cf460e62f83b484c9ecd55bc80b650f2e19a09e8ded6e99eafb682e1842e'
$token = $env:RELAY_RELEASE_DOWNLOAD_TOKEN
if ([string]::IsNullOrWhiteSpace($token)) { throw 'RELAY_RELEASE_DOWNLOAD_TOKEN is not available; route gate remains OPEN.' }
$headers = @{ Authorization = "Bearer $token" }
$body = Join-Path $env:TEMP ('relay-v16-' + [Guid]::NewGuid().ToString('N') + '.zip')
try {
  $response = Invoke-WebRequest -Uri "$base/api/relay/download/v16" -Method Get -Headers $headers `
    -OutFile $body -PassThru -MaximumRedirection 0 -ErrorAction Stop
  if ($response.StatusCode -ne 200) { throw "Relay v16 full GET returned HTTP $($response.StatusCode)." }
  $hash = (Get-FileHash -LiteralPath $body -Algorithm SHA256).Hash.ToLowerInvariant()
  if ($hash -ne $expectedSha) { throw "Relay v16 hash mismatch: $hash." }
  [pscustomobject]@{ status = 'PASS'; bytes = (Get-Item -LiteralPath $body).Length; sha256 = $hash }
}
finally {
  Remove-Item -LiteralPath $body -Force -ErrorAction SilentlyContinue
}

$health = Invoke-RestMethod -Uri "$base/api/healthz" -Method Get -ErrorAction Stop
if ($health.ok -ne $true -or $health.status -ne 'ready' -or $health.relayVersion -ne 16) {
  throw 'Readiness response did not prove ok=true, status=ready, and relayVersion=16.'
}
railway status --json | Out-Host
if ($LASTEXITCODE -ne 0) { throw 'Railway deployment metadata could not be read.' }
```

`/api/healthz` proves readiness and the published Relay version; it does **not** prove the source
commit. Compare `meta.commitHash` in the sanitized `railway status --json` deployment record with
the candidate SHA before recording a deployment PASS.

On each owner machine, use the already-distributed 0.3.13 installer and observe the local Relay;
do not infer the result from the database:

```powershell
Get-FileHash -LiteralPath 'C:\path\to\MKTBrowser-win-x64.exe' -Algorithm SHA256
Start-Process -FilePath 'C:\path\to\MKTBrowser-win-x64.exe' -Wait
Invoke-RestMethod -Uri 'http://127.0.0.1:47821/health' -Headers @{ Origin = $base }
```

Record only `relayVersion: 16`, timestamp, and PASS/FAIL for each owner machine. A missing local
observation leaves the floor at 13.

After the preconditions pass, edit only the intended constant and run the focused floor/rejection
tests plus the full CI suite. `MIN_RELAY_VERSION_BY_KIND` must continue to derive via
`Math.max`; inspect the resulting values before deployment. The under-floor response must retain
`RELAY_TOO_OLD`, name the running and required versions, and tell the operator to download the
updated Relay from the web app.

Probe the complete matrix after deployment: v13, v14, and v15 reject; v16 accepts; unknown and
too-new values fail safely. Keep the old v15 tuple as negative evidence and mark it revoked where
the compatibility system supports that state. Revocation cannot recall an EXE already on disk; the
floor is the enforcement mechanism.

The focused source checks are:

```powershell
npx vitest run src/lib/tickets/outdated-relay-version.test.ts `
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
