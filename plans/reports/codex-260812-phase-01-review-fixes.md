# Codex report — MKB-03 Phase 01 review fixes

Date: 12 August 2026

## Implemented

- `installer.nsh` is ASCII-only: zero bytes above `0x7F`, no BOM dependency, no unused
  `nsProcess.nsh`. Relay shortcuts are enumerated in Startup/Desktop and deleted only when their
  resolved `TargetPath` equals the owned Relay executable.
- Install records `RelayOwned` before Relay setup. Existing markers survive upgrades. Uninstall
  defaults missing/invalid ownership to preserve and removes Relay executable/shortcuts only for
  marker `1`. `relay-config.json` is never deleted.
- Pinned Relay manifest now includes `sizeBytes`. Local, cached, resumed, and fresh downloads check
  size before hashing; wrong size fails fast and removes the partial file.
- Relay build sidecar now records version, size, and SHA-256. Publish validation rejects missing or
  invalid sidecar, version unequal to `RELAY_VERSION`, wrong archive size, or wrong archive digest
  before any R2 request. Immutable publish behavior remains unchanged.
- Updated Phase 01 plan, roadmap, and changelog to state ownership and sidecar fail-closed behavior.

## Verification

### MKTTool

- `npm test`: exit 0 — 120 files, 1165 tests.
- `npm run typecheck`: exit 0.
- `npm run lint`: exit 0.
- `npm run build`: exit 0. Existing dynamic-filesystem tracing warning remains.
- Focused release/publish tests: 2 files, 13 tests passed.
- `git diff --check`: exit 0.

### MKT Browser

- `corepack yarn verify:node`: exit 0 — 2/2.
- `corepack yarn typecheck`: exit 0.
- W02: 2/2 Node guard + 8/8 desktop guards.
- MKB-01: 4/4 legacy import + 4/4 runtime contract.
- MKB-01E: 7/7.
- MKB-02: 3/3 + 9/9 + 6/6.
- Packaging: 8/8, up from baseline 6/6 because size mismatch and missing-size guards were added.
- Product identity/installer guard after final review fix: 4/4.
- `installer.nsh`: first bytes `21-6D-61-63`; zero non-ASCII bytes.
- `git diff --check`: exit 0.

### Artifact

- Rebuilt installer: `apps/desktop/release/installer/MKTBrowser-win-x64.exe`.
- Size: 145,896,567 bytes.
- SHA-256: `c0f619fa1e3686bca5b0be572c3ce17e85f047a6dec17bf8e65e6968b68264b4`.
- One retry required after transient Windows `EBUSY` copying `resources/companion/cs.js`; retry passed.
- Frozen `release/win-unpacked/MKTBrowser.exe` SHA-256 remains
  `238d5d6fd5e373b052c484ceab90698f6dc295205a59be6573f9928b01db4f42`.

## Safety and scope

- Did not read, write, enumerate, or delete either live `%LOCALAPPDATA%` product root.
- Did not start, stop, or kill live MKT Browser or Relay.
- Did not run installer/uninstaller. Build only wrote `release/installer/`.
- Did not publish to R2, deploy, commit, or push.

## Not done

- Clean standard-user install, upgrade over pre-existing Relay, reboot, and uninstall remain human
  gates. They cannot be exercised on this machine without risking the live demonstration chain.

## Unresolved questions

None for these review fixes. Human Phase 01 gate remains open.
