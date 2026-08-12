# Codex report — MKB-03 Phase 03 protected secrets

Date: 12 August 2026

## Implemented

- Added a shared `SecureStore` interface and Windows DPAPI CurrentUser adapter. Plaintext enters
  PowerShell through stdin; command lines and temporary files contain no secret. DPAPI CurrentUser is
  documented as a same-user boundary, not process isolation or a sandbox.
- Relay operator-domain and device private keys now read/write through protected storage. New device
  keys use create-if-absent semantics so concurrent starts cannot rotate identity.
- Added explicit durable migration stages: legacy detected, imported, verified, plaintext deleted,
  schema committed, activated. Ordering is fixed: import -> read back/verify -> remove plaintext ->
  commit schema marker and rollback floor.
- Added a non-secret tombstone at `relay-device-key.json`. A plaintext-only Relay rejects it before
  listening instead of recreating a plaintext key. Local rollback-floor state also rejects a lower
  Relay version.
- Installer template and instructions no longer create or request `vaultKeyOperator` in JSON.
  Existing metadata and DPAPI blobs are preserved by install/repair/uninstall paths.
- Current release page and redirect route request `readRelayRelease(RELAY_VERSION)` explicitly, so
  they consume the versioned artifact contract and missing metadata remains unavailable/fail-closed.
- Inverted `ActivityLog.sanitize` to an explicit allowlist. Permitted keys map to bounded IDs,
  counters, numeric timeouts, proxy auth/type shape, or fingerprint presence shape. Unknown keys are
  dropped.
- Added the unknown-key guard to the normal MKB-02 managed test script. Existing
  `activity-log-redaction.test.ts` remains green.

## Migration verification

- Every migration test constructs and removes its own temporary Relay home. No test discovers or
  references the installed Relay home.
- Fault injection covers seven boundaries: before import, after import, after read-back, before
  source deletion, after source deletion, after marker commit, and after activation.
- Simulated reboot creates a new migration coordinator after interruption and converges to
  `activated`.
- Read-back failure leaves both plaintext sources intact.
- Real Windows DPAPI migration scans the complete temporary Relay tree after migration and finds zero
  occurrences of either key value.
- Fresh install, partial legacy enrollment, rollback refusal, tombstone, and protected-value
  replacement cases are covered.

## Verification

### MKTTool

- `npm test`: exit 0 — 123 files, 1181 tests.
- `npm run typecheck`: exit 0.
- `npm run lint`: exit 0.
- `npm run build`: exit 0. Existing dynamic-filesystem tracing warning remains; build completes.
- Focused final security regression: 6 files / 34 tests, exit 0.
- `git diff --check`: exit 0.

### MKT Browser

- `corepack yarn verify:node`: exit 0 — 2/2.
- `corepack yarn typecheck`: exit 0.
- W02: 2/2 + 8/8.
- MKB-01: 4/4 + 4/4.
- MKB-01E: 7/7.
- MKB-02: 3/3 + 10/10 + 6/6. The MCP group increased from 9 to 10 with the allowlist guard.
- Packaging: 8/8.
- `git diff --check`: exit 0.

## Safety and limits

- Did not read, write, move, delete, or discover `%LOCALAPPDATA%\MKTTool-Relay` or
  `%LOCALAPPDATA%\MKTTool\MKTBrowser`.
- Did not start, stop, kill, or restart Relay or MKT Browser. Did not bind ports 47821 or 47822.
- Did not run installer, `relay:verify`, live migration, publish, deploy, commit, or push.
- No process-isolation claim. Same-user processes can request DPAPI decryption; full-disk encryption
  remains required for browser/profile/session data.
- Phase 02 setup controller is not present on this branch. This phase only pins its existing release
  consumers to the versioned route contract; it does not implement Phase 02 UI.

## Unresolved questions

1. A human-controlled real upgrade still needs the required backup before first live migration, then
   verification that the installed Relay reaches Ready and the operator can still decrypt vault data.
2. Phase 05 must consume the durable rollback floor in the signed compatibility manifest/updater;
   this phase supplies and enforces the Relay-local floor and plaintext-only tombstone.
