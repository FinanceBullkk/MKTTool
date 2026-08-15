# Phase 05 — Compatibility set, updates, and rollback

## Context links

- Spec: [MKT Browser plan §8.4, §MKB-03B](../260810-0244-mkt-browser-noi-bo/plan.md)
- Release-authority consequence of shipping unsigned: same plan, code-signing decision block

## Overview

**Priority:** medium — a pilot on two devices survives without it; a team rollout does not.
**Status:** 🟡 in progress. The owner root/delegation custody and recovery ceremony is verified;
compatibility-set implementation is now the active gate.

**Verified ceremony checkpoint, 15 August 2026:** the public receipt is `verified` and binds root key
`a6d3237649c2586e48b6e4fa744f7a089160fd80250fd29360513f5f625b146c` to delegated key
`6e5d47d894206e69e6464748333eb76c99b18da1f1b42ddafb2e3f265a7b786e`. The delegation expires
`2027-08-14T00:00:00.000Z`. Backup A and backup B are held in separate physical locations, and the
required recovery rehearsal from backup B succeeded. The receipt and four public evidence files are
the implementation inputs; private root backups, the passphrase, and the DPAPI-protected delegated
private key are not repository inputs and must never be copied into the project.

**Checkpoint, 14 August 2026:** portable ceremony tooling is ready and verified. The build-side tool
creates a DPAPI CurrentUser delegated key and public request; the offline tool creates two separately
salted encrypted root backups on different volume roots, signs the first delegation, reads both
backups back, and requires recovery from copy B. A single offline-tool ZIP is hash-checked against a
paper fingerprint before extraction. Delegated and root fingerprints also cross the boundary
separately from the transfer drive. The verifier matches the signed delegation and recovery proof to
the local DPAPI key and writes only a public receipt. Six focused tests, the 1,362-test full suite,
typecheck, and lint pass. Tests used disposable synthetic keys only.

The four compatibility-set implementation files still do not exist. Their trust anchor must be
derived from the verified public evidence above rather than generated during implementation. Phase
05 remains the controlling MKB-04 NO-GO blocker until validation, activation, convergence, rollback,
and smoke evidence pass. Runbook: [release-signing-key-ceremony.md](../../docs/release-signing-key-ceremony.md).

**Physical preflight, synced 15 August 2026:** no production-key step is authorized until the owner
has the offline Windows host, two separately labelled USB devices, the password manager, paper and
pen, and access to the permanent Windows account that will own the DPAPI delegated key. Two USB
devices are sufficient: USB A carries the public request and verified tool bundle into the offline
host before becoming backup A; USB B is backup B and the required recovery source. The runbook now
makes this transfer order explicit.

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

## Decision — root key custody, chosen 12 August 2026

The threat model is a solo owner and six internal operators. The realistic danger is **losing** the
key, not a targeted attacker, so custody optimises for recoverability.

Use the two-tier structure the specification already defines, rather than treating the root as a
per-release key:

| | Used | Stored |
|---|---|---|
| **Root** | About once a year, only to sign or rotate a delegation | Encrypted, **two copies on separate physical media kept in different places**, passphrase in the owner's password manager. Never on the build machine, never in CI, never in R2 |
| **Delegated** | Every release, to sign the compatibility manifest | Windows per-user protected storage on the owner's machine — the same DPAPI mechanism Phase 03 builds |

**Release flow.** CI produces the artifacts and their hashes; the owner signs the manifest locally;
the signed manifest is uploaded. Leaked CI credentials can therefore push bytes to R2 but cannot
confer release authority, which is the whole point of R2 being an untrusted host.

No hardware token. The owner declined a recurring certificate cost on the same reasoning, and an
encrypted key on two separate media is proportionate to this threat model.

**Two obligations that are easy to skip and must not be:**

1. Generate the root key **before** any code depends on it. Writing the validator first and
   improvising the key later is how a laptop-generated single point of failure gets created.
2. Rehearse recovery from the second copy exactly once. A backup that has never been restored is not
   a backup.

**If the root key is lost** — decided now rather than during the incident: devices keep running the
compatibility set they already have, but can never be updated again. Recovery is a fresh installer
pinning a new root, installed once by each of the six operators. The disaster is "everyone reinstalls
once", not "everything dies". That is acceptable, and knowing it is acceptable is what keeps the
response calm.

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

1. Generate the root key and the first delegation per the custody decision above, and rehearse
   recovery from the second copy. Do this before writing code that depends on either key.
2. Implement validation with every rejection case as a test: altered, stale, replayed, wrong key,
   revoked delegation, incompatible tuple, network-driven downgrade.
3. Implement staging and activation with a durable marker per step.
4. Fault-inject after each step and across reboot; assert convergence, never a mixed tuple.
5. Implement rollback behind a one-use ADMIN authorization bounded by the secure-store rollback floor.
6. Add the post-activation smoke test.

## Todo list

- [x] Root key generated per the custody decision; two copies on separate media
- [x] Recovery from the second copy rehearsed once
- [x] First delegation signed; delegated key in protected per-user storage
- [x] Manifest schema and validation
- [x] All seven rejection cases tested — altered, stale, replayed, wrong key, revoked delegation,
  incompatible tuple, and network-driven downgrade each have a test
- [x] Staging and activation with durable markers
- [x] Fault injection per step plus simulated-reboot convergence; a real OS reboot stays a human gate
- [x] Refuse update while a profile is open, before stopping anything — checked on the update and
  rollback paths, and again after staging, all before any process is stopped
- [x] Rollback bounded by the secure-store floor, fixed at clean install — see the decision below
- [x] Post-activation smoke test
- [x] Revocation memory: a delegated key proven revoked stays revoked even when a later payload
  omits the statement

## Decision — the rollback floor does not move, chosen 15 August 2026

The floor is set once from the installer's embedded sequence at clean install and never rises.

Two ways to raise it were considered. Taking it from the installer of a later reinstall was
implemented and then reverted: the coordinated update path never reinstalls, so a device would only
learn a newer floor by accident. Declaring a minimum floor inside the manifest would reach every
device on the normal path, but costs a field in a signed format, plus signing and publishing
changes.

Neither was bought, because the floor is close to non-binding here. Rollback can only reach the one
retained set, so its target is always a single step back and always recent. The scenario a moving
floor protects — ADMIN rolling into a hole that a later set fixed — is the owner overruling their
own audited, one-use, ADMIN-only authorization, and this threat model is a solo owner with six
internal operators whose realistic danger is losing the root key.

If a release ever has to forbid its predecessor, add the minimum-floor field to the manifest rather
than reading the installer. Doing it before the first manifest is published is much cheaper than
after.

## Open human gates

- [ ] Real Windows reboot during each activation step; automated coverage simulates startup
  convergence but does not replace an OS reboot.
- [x] Publish the verified Relay v12 ZIP to its immutable authenticated URL, then rebuild the
  installer by fetching that published object — closed 16 August 2026. Relay v12 is on R2 and served
  by the token-gated release route; MKTBrowser run `31909909366` fetched that published object with
  the build-machine token, embedded it, and produced `mktbrowser-windows-installer` (144.6 MB)
  together with the signed-over compatibility evidence. The installer no longer proves only the
  local packaging path.
- [ ] Live Windows update, rollback, and smoke rehearsal on an operator-representative machine.

## Success criteria

An update interrupted at any step and rebooted converges to the complete new set or the complete
retained set. A downgrade attempt through release metadata is refused. A rollback below the
secure-store floor is refused even by ADMIN.

## Risk assessment

- **The root key has no fallback underneath it.** Custody is decided above; the residual risk is
  skipping the recovery rehearsal, which turns a survivable loss into a full reinstall across the
  fleet.
- Fault injection across reboots is slow to test by hand. Budget for it or the convergence guarantee
  is a claim rather than a result.

## Security considerations

Delegated private keys and the offline root stay separate from R2 credentials. The updater trusts the
manifest chain, never the host that served the bytes. Since the installer binary is unsigned, the
manifest is the only thing standing between a compromised host and a modified update — treat its
validation as security code, not plumbing.

## Next steps

Phase 06 exercises this under the legacy-install, port-conflict, repair, and uninstall matrices.
