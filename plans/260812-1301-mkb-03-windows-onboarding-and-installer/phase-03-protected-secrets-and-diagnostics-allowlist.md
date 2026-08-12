# Phase 03 — Protected secrets and the diagnostics allowlist

## Context links

- Spec: [MKT Browser plan §7 secret migration and rollback floor, §6 exposure control](../260810-0244-mkt-browser-noi-bo/plan.md)
- Carried-over seam: same plan, MKB-02 gate status, "the activity sanitizer is still a denylist"

## Overview

**Priority:** high, and **independent** — no dependency on Phases 01 or 02, so it can run in parallel.
**Status:** ⬜ ready to start.

Move the operator-domain key and the Relay device private key out of plaintext JSON into per-user
protected storage, and close the last default-allow seam in the diagnostics path.

## Key insights

- **Migration is the dangerous part, not the storage.** A crash mid-migration must be safely
  retryable, and repair, rollback, backup, temporary files, and uninstall must never recreate or
  retain an unnoticed plaintext copy.
- The migration establishes a **rollback floor**. Once the plaintext source is deleted, no older Relay
  that requires plaintext may run again — including through rollback. The manifest and local updater
  must refuse it.
- Do not claim process isolation Windows does not provide. DPAPI CurrentUser is a same-user boundary,
  not a sandbox. Full-disk encryption remains required for profile and session data.
- The activity sanitizer is a **denylist**: it redacts known-sensitive argument names and passes every
  other key through. Nothing leaks today because every current argument is classified, but Phases 01,
  02, and 04 add new local operations whose arguments would feed straight into it.

## Requirements

- Operator-domain key and device private key live in DPAPI CurrentUser or Credential Manager.
- Migration is transactional: import, read back and verify, then delete the plaintext source, then
  commit a durable secure-store schema marker.
- A signed bridge Relay reads legacy plaintext and the protected store but writes only the protected
  format. After the deletion boundary, no plaintext-only Relay runs.
- The MCP bearer stays in protected per-user storage that both trusted local processes can read.
- `ActivityLog.sanitize` becomes an allowlist: named keys with a declared reduced shape; every other
  key dropped.

## Related code files

**Modify**
- `MKTTool/relay/src/relay-config.ts` — read/write through the secure store
- `MKTBrowser/packages/mcp-server/src/ActivityLog.ts` — invert `sanitize`

**Create**
- `MKTTool/relay/src/windows-secure-store.ts` — thin OS adapter over a shared core, so MKB-07 adds
  Keychain rather than reopening this
- `MKTTool/relay/src/secret-migration.ts` — the transactional migration with its marker
- `MKTBrowser/packages/mcp-server/src/activity-log-allowlist.test.ts` — guard for unknown keys

## Implementation steps

1. Write the secure-store adapter behind an interface the shared Relay core already expects. Keep
   Windows specifics in the adapter only.
2. Write the migration as explicit ordered steps with a durable marker after each boundary.
3. Fault-inject at every boundary: before import, after import, after read-back, after source
   deletion, after marker commit, after activation, and across a reboot. Each must converge to a
   complete state.
4. Add the rollback floor to the local update state so an older Relay is refused.
5. Invert `sanitize` to an allowlist, naming each permitted key and its reduced shape.
6. Add a test asserting an argument under an unrecognised key never reaches the activity feed — the
   guard the current denylist cannot provide.

## Todo list

- [ ] `windows-secure-store.ts` adapter over the shared core
- [ ] `secret-migration.ts` with durable markers
- [ ] Fault injection at all seven boundaries plus reboot
- [ ] Rollback floor recorded and enforced
- [ ] No plaintext recreated by repair, backup, temp files, or uninstall
- [ ] `sanitize` inverted to an allowlist
- [ ] Unknown-key test proves the feed fails closed

## Success criteria

A Relay upgraded from a plaintext config reaches `Ready` with no plaintext key remaining anywhere on
disk, and a crash injected at any migration boundary leaves a state the next start completes. An MCP
tool argument under a new key name never appears in the activity feed.

## Risk assessment

- **Losing the operator key destroys every vault secret on that device.** Back up
  `relay-config.json` before the first migration run on any real machine, exactly as was done on
  12 August before the Relay 7 upgrade.
- The rollback floor is easy to specify and easy to forget to enforce. Test it by attempting to
  activate an older Relay after migration and asserting refusal.

## Security considerations

The plaintext operator key must never enter a Web field, installer, URL, MKT Browser, log, crash
report, or server store. The Electron process must never receive the operator-domain key. After
migration, grep the whole Relay home for the key material as a test, not as a manual check.

## Next steps

Phase 04 depends on the protected store existing before it persists grants.
