# Codex report — MKB-03 Phase 01 one installer with Relay

Date: 12 August 2026

## Implemented

- Relay publishing now targets retained `MKTTool-Relay-vN.zip` objects. Same-version publication is
  idempotent only for matching size, SHA-256, and version metadata; different bytes fail closed.
  R2 PUT also carries signed `If-None-Match: *` so a concurrent publisher cannot overwrite the key.
- Relay build writes artifact metadata beside the ZIP. Disk and R2 release readers report the
  measured artifact version, not `RELAY_VERSION`; missing or inconsistent metadata fails closed.
- Added authenticated immutable route `/api/relay/download/vN` with open-ended Range support. The
  old route redirects to the measured current version.
- MKT Browser pins Relay v7 and SHA-256
  `5415c18519e78048b4c3392f3891069ac44226aea6854c4366437e08f27d785d`.
- Added resumable pinned downloader. It accepts authenticated cookie delivery or an explicitly
  supplied local artifact, verifies SHA-256, removes corrupt cache/partial data, and never uses
  `latest`.
- Windows installer packaging fetches and verifies Relay before electron-builder. Relay resources
  exist only in the installer config; technical directory packaging stays independent.
- NSIS reuses the packaged `install-relay.ps1`, preserving `relay-config.json`, creating Relay and
  MKT Browser autostart entries, starting Relay, and failing installation when Relay setup fails.
- Uninstall removes owned Browser/Relay autostart shortcuts and the owned Relay executable while
  retaining Relay credentials and Browser profile/token data. Publisher is written as `Techieslab`.
- Manual workflow-dispatch CI retains the existing directory package/runtime check, then builds and
  uploads the combined installer using the authenticated release cookie secret.
- Plan, roadmap, and changelog status updated. Phase 01 remains yellow until human clean-account
  install/reboot/uninstall evidence exists.

## Artifact

- Path: `E:\MKTWorkspace\MKTBrowser\apps\desktop\release\installer\MKTBrowser-win-x64.exe`
- Size: 145,896,190 bytes
- SHA-256: `0cc4378ae467346a394340aadddcb45bed33fee491b807b559e467020c1221da`
- Signature: `NotSigned`, expected by v1 decision
- Embedded Relay ZIP: 34,171,895 bytes
- Frozen MKB-02 `release/win-unpacked/MKTBrowser.exe` SHA-256 remains
  `238d5d6fd5e373b052c484ceab90698f6dc295205a59be6573f9928b01db4f42`.

## Verification

### MKTTool full acceptance

- `npm test`: exit 0 — 119 files passed, 1161 tests passed.
- `npm run typecheck`: exit 0.
- `npm run lint`: exit 0.
- `npm run build`: exit 0. Existing Turbopack dynamic-filesystem tracing warning remains in
  `database-backup.ts`; no new build error.
- Focused release/R2 tests: 42 passed after adding immutable metadata, conditional PUT, and artifact
  version checks.

### MKT Browser acceptance

- `corepack yarn verify:node`: exit 0 — 2/2.
- `corepack yarn typecheck`: exit 0.
- W02: 2/2 Node guard + 8/8 desktop guards.
- MKB-01: 4/4 + 4/4.
- MKB-01E: 7/7.
- MKB-02: 3/3 + 9/9 + 6/6.
- Packaging: 6/6; baseline 3/3 plus download, resume, and checksum-mismatch guards.
- `corepack yarn workspace @mktbrowser/desktop build:win`: exit 0 using Node 22 and the pinned local
  Relay v7 artifact. One retry was required after a transient Windows `EBUSY` resource-copy failure.
- `git diff --check`: exit 0 in both repositories.

## Not done

- No R2 publish executed. User did not authorize publishing; current v7 legacy object is not migrated
  automatically by code changes. The next authorized `npm run relay:publish` creates the immutable
  v7 object and metadata.
- No deploy executed. The production route does not serve the new immutable path until MKTTool is
  deployed after the immutable object exists.
- No clean-account install, reboot, startup-order, registry, repair, or uninstall exercise. Briefing
  requires a human/clean account, and this machine has live Relay and MKT Browser processes that must
  not be stopped or modified.
- No commit or push, as required.

## Unresolved questions

1. Human must authorize and perform the one-time immutable Relay v7 publish, then deploy MKTTool.
2. Human must run the combined installer on a clean standard-user account, reboot, verify ports
   `47821`/`47822` and contract 3, then uninstall and confirm `profiles.db`, MCP token, and
   `relay-config.json` remain.
