# Phase 01 — One installer carrying Relay and Browser

## Context links

- Spec: [MKT Browser plan §8.1, §MKB-03B](../260810-0244-mkt-browser-noi-bo/plan.md)
- Today's packaging fix: `MKTBrowser` commit `d0b384b`
- Session that produced the working installer: [session report](../reports/session-260812-0452-mkb02-close-signing-decision-installer-spike.md)

## Overview

**Priority:** highest — nothing else in MKB-03 is testable by an operator until this exists.
**Status:** ⬜ ready to start.

Today there are two downloads: a Relay `.zip` with `setup.bat`, and a MKT Browser directory the owner
copies by hand. Phase 01 replaces both with one file. The operator runs it once and both components
are installed, registered to start with Windows, and discoverable by each other.

## Key insights

- The NSIS installer already works end to end as of 12 August: per-user, no UAC, starts, drives the
  full chain, and uninstalls without touching `profiles.db` or the MCP token. This phase adds a
  second payload to a proven artifact rather than building an installer.
- **The hard part is cross-repository, not NSIS.** The Relay `.exe` is built in `MKTTool`
  (`scripts/build-relay-executable.ts`, Node SEA, self-contained). The installer is built in
  `MKTBrowser`. Something must carry the Relay binary across that boundary with a pinned version and
  a verified checksum, because the two repositories are deliberately separate.
- Relay already solves its own installation well: `install-relay.ps1` is idempotent, preserves
  `relay-config.json`, strips Mark-of-the-Web, and creates the Startup shortcut. Reuse its behaviour;
  do not reimplement it in NSIS script.
- The MCP token no longer needs to cross the boundary. MKB-02 made Relay discover it from the owned
  Windows data root, confirmed on a real machine whose config still carried the pre-W02 key name.

## Decision required before implementation

How does the Relay binary reach the MKTBrowser installer build?

| Option | Trade-off |
|---|---|
| **A. MKTBrowser CI downloads a pinned Relay release** from the MKTTool release route by version + SHA-256 | Keeps repositories separate; needs the release route to serve a versioned, immutable URL |
| B. Commit the Relay `.exe` into MKTBrowser | 90 MB binary in git; rejected |
| C. One combined pipeline that checks out both repositories | Couples the repositories' CI; contradicts §9 |

**Recommendation: A.** It matches the existing `RELAY_VERSION` + checksum discipline and keeps the
clean-break boundary. Confirm with the owner before writing the workflow.

## Requirements

- One authenticated download installs Relay and MKT Browser, per-user, without UAC.
- The installer refuses to proceed when it cannot verify the pinned Relay checksum.
- Both components start after install and after a reboot, in either order.
- Relay upgrade preserves `relay-config.json`; MKT Browser upgrade preserves the data root.
- Uninstall removes both components, both autostart entries, and leaves profiles and Relay
  credentials in place. Removing local data stays a separate explicit action.
- The uninstall registry entry carries a `Publisher` value.

## Related code files

**Modify**
- `MKTBrowser/apps/desktop/electron-builder.yml` — `extraResources` for the Relay payload; NSIS
  `include` for the custom install/uninstall steps; publisher metadata
- `MKTBrowser/apps/desktop/scripts/package-windows.cjs` — fetch and verify the pinned Relay artifact
  before packaging
- `MKTBrowser/.github/workflows/release.yml` — produce the installer as a build artifact
- `MKTTool/src/lib/relay/relay-release-file.ts` — serve a versioned immutable URL if option A is taken

**Create**
- `MKTBrowser/apps/desktop/build/installer.nsh` — NSIS hooks that install and start Relay, and remove
  it on uninstall
- `MKTBrowser/apps/desktop/scripts/fetch-pinned-relay.cjs` — download + checksum verify

**Read for context**
- `MKTTool/relay/dist/install-relay.ps1` — the behaviour to reproduce, including the BOM and COM
  filename traps documented in its header

## Implementation steps

1. Confirm the cross-repository option with the owner. Do not start until it is chosen.
2. Add `fetch-pinned-relay.cjs`: takes version + expected SHA-256 from a checked-in manifest, resumes
   interrupted downloads, and fails closed on mismatch. No "latest".
3. Wire it into `package-windows.cjs` before `electron-builder` runs, so a packaging run cannot
   silently omit the payload.
4. Add the Relay payload to `extraResources` and write `installer.nsh` to copy it into the Relay home,
   create the Startup shortcut, and start it — mirroring `install-relay.ps1`, including preserving an
   existing `relay-config.json`.
5. Set `publisherName` and the NSIS uninstall display metadata.
6. Add MKT Browser autostart, per §8.1's requirement that both components run after reboot.
7. Extend `productIdentity` (or a new packaging guard) to assert the installer carries a pinned Relay
   version and refuses an unverified checksum.
8. Rebuild, install on a clean standard-user account, reboot, and confirm both components come back.

## Todo list

- [ ] Owner confirms the cross-repository option
- [ ] `fetch-pinned-relay.cjs` with checksum verification and resume
- [ ] Pinned Relay version + hash manifest checked in
- [ ] `package-windows.cjs` fetches and verifies before packaging
- [ ] `installer.nsh` installs, starts, and uninstalls Relay
- [ ] `relay-config.json` preserved across upgrade
- [ ] Publisher metadata present in the uninstall entry
- [ ] MKT Browser autostart entry
- [ ] Packaging guard asserts the pinned payload
- [ ] Clean-account install + reboot verified

## Success criteria

One download installs both components on a clean standard-user Windows account without UAC. After a
reboot, Relay answers on `47821`, MKT Browser answers on `47822`, and `/health` reports
`browser.ready` with contract 3. Uninstall leaves `profiles.db`, the MCP token, and
`relay-config.json` in place. A tampered Relay payload fails the build.

## Risk assessment

- **Cross-repository coupling** is the real risk. Mitigation: pinned version + checksum, never
  "latest", and the build fails closed rather than packaging without the payload.
- **Two autostart entries** can collide with an existing standalone Relay install. Detection is Phase
  06; this phase must at least not create a duplicate when one already exists.
- **Installer size** grows past 200 MB with both payloads. Acceptable; it is an internal download.

## Security considerations

The installer stays secretless: no token, key, device ID, or operator key is embedded. It carries
only public release metadata and the approved Web origin, exactly as the Relay build already does.
The Relay payload is verified by checksum before packaging, which proves integrity but not origin —
the recorded consequence of shipping unsigned.

## Next steps

Phase 02 consumes this artifact: the setup controller cannot show `Confirm this PC` until one
download has put both components on the machine.
