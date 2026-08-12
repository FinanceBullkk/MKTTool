# Phase 05 — Compatibility set, updates, and rollback

## Context links

- Spec: [MKT Browser plan §8.4, §MKB-03B](../260810-0244-mkt-browser-noi-bo/plan.md)
- Release-authority consequence of shipping unsigned: same plan, code-signing decision block

## Overview

**Priority:** medium — a pilot on two devices survives without it; a team rollout does not.
**Status:** ⬜ blocked on Phases 01 and 03.

Install, update, and roll back Relay, MKT Browser, the control contract, and the pinned engine as one
compatibility set that can never run as a mixed tuple.

## Key insights

- **The manifest root key is now the only source of release authority.** Dropping Authenticode
  removed the second signature underneath it. Losing that key loses the chain, so it stays offline and
  out of CI — this is the single most consequential secret in the project after the operator key.
- R2 is an **untrusted artifact host**. It stores bytes; it does not confer authority.
- A truly clean install accepts only a manifest at or above the sequence embedded in its installer.
  Profile data present but anti-downgrade state missing is a **repair condition**, not a clean
  reinstall — otherwise a deleted state file becomes a downgrade path.
- The engine must never resolve "latest". Changing Chromium can move the measured fingerprint even
  when the profile ID and seed are unchanged, which would quietly alter every identity at once.
- Refuse the update **before stopping anything** when a profile is open. Killing first and checking
  second is how a warmed identity dies.

## Requirements

- Signed compatibility manifest pinning installer, Relay, Browser, contract, and engine versions,
  hashes, sizes, sequence, delegated key, and allowed transition.
- Reject altered, stale, replayed, wrong-key, incompatible, and downgrade manifests.
- Protected local state records highest accepted sequence, secure-store rollback floor, and exactly
  one retained rollback sequence.
- Stage the whole set without activating a mixed tuple; converge to complete-new or complete-retained
  after any failure or reboot.
- Rollback is an explicit audited ADMIN action with a one-use local authorization, never triggered by
  release metadata.
- Smoke test after activation: runtime health → list → open test profile → cookie → proxy → close.

## Related code files

**Create**
- `MKTTool/src/lib/release/compatibility-manifest.ts` — schema, signature, and transition validation
- `MKTTool/relay/src/local-updater.ts` — stage, activate, converge, roll back
- `MKTTool/relay/src/update-state.ts` — protected sequence and rollback-floor state
- `MKTTool/scripts/sign-compatibility-manifest.ts` — offline signing, run outside CI

**Modify**
- `MKTBrowser/apps/desktop/scripts/package-windows.cjs` — emit hashes and sizes for the manifest
- `MKTTool/src/lib/relay/relay-release-file.ts` — serve the manifest beside the artifact

## Implementation steps

1. Define the manifest schema and the root/delegated key relationship. Decide and document where the
   root key is generated and stored **before** writing code that depends on it.
2. Implement validation with every rejection case as a test: altered, stale, replayed, wrong key,
   revoked delegation, incompatible tuple, network-driven downgrade.
3. Implement staging and activation with a durable marker per step.
4. Fault-inject after each step and across reboot; assert convergence, never a mixed tuple.
5. Implement rollback behind a one-use ADMIN authorization bounded by the secure-store rollback floor.
6. Add the post-activation smoke test.

## Todo list

- [ ] Root key custody decided and written down
- [ ] Manifest schema and validation
- [ ] All seven rejection cases tested
- [ ] Staging and activation with durable markers
- [ ] Fault injection per step plus reboot converges
- [ ] Refuse update while a profile is open, before stopping anything
- [ ] Rollback bounded by the secure-store floor
- [ ] Post-activation smoke test

## Success criteria

An update interrupted at any step and rebooted converges to the complete new set or the complete
retained set. A downgrade attempt through release metadata is refused. A rollback below the
secure-store floor is refused even by ADMIN.

## Risk assessment

- **The root key has no fallback.** Decide custody first; a key generated casually on a laptop is a
  single point of failure for every future release.
- Fault injection across reboots is slow to test by hand. Budget for it or the convergence guarantee
  is a claim rather than a result.

## Security considerations

Delegated private keys and the offline root stay separate from R2 credentials. The updater trusts the
manifest chain, never the host that served the bytes. Since the installer binary is unsigned, the
manifest is the only thing standing between a compromised host and a modified update — treat its
validation as security code, not plumbing.

## Next steps

Phase 06 exercises this under the legacy-install, port-conflict, repair, and uninstall matrices.
