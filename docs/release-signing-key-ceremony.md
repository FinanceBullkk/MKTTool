# Release-signing key ceremony

> **Scope boundary — P4b Browser compatibility only.** This retained ceremony is not a prerequisite
> for the deployed P4a Web service. P4b's Browser five-artifact tuple remains OPEN, and Lane C is
> **CLOSED** because no CloakBrowser channel exists; no vendor request or date is pending. Run this
> ceremony only after a new owner decision reopens Browser compatibility work.

This runbook creates the MKB-03 release authority without placing the root private key on the build
machine. It must be completed before Browser compatibility-manifest implementation begins.

## Required equipment

- A Windows host that is not the MKTTool build machine and can remain offline for the ceremony.
- Node.js 22 on that offline host. A verified portable Node.js directory is acceptable.
- Two removable storage devices mounted under different drive letters.
- The owner's password manager for a unique passphrase of at least 20 characters.

The two removable devices become encrypted root backups A and B. Store them in different physical
locations after the rehearsal. The passphrase stays only in the owner's password manager.

Two USB devices are sufficient; a third transfer drive is not required. USB A first carries the
public delegation request and verified offline-tool ZIP to the offline host, then becomes encrypted
root backup A. USB B becomes encrypted root backup B and is the mandatory recovery source. USB A may
carry only the public evidence back to the build machine after initialization; never copy its
encrypted root backup onto the build disk.

## Preflight stop/go checklist

Do not run step 1 until every item is true:

- [ ] The permanent Windows account that will own the delegated DPAPI key is signed in on the build
  machine. A temporary or disposable account is not acceptable.
- [ ] The offline Windows host is available, has Node.js 22 or a verified portable Node.js 22
  directory, and can remain disconnected from Wi-Fi, Ethernet, Bluetooth networking, and VPNs.
- [ ] USB A and USB B are separately labelled, healthy, mounted under different drive letters, and
  contain no sole copy of valuable data.
- [ ] The password manager contains a newly generated, unique passphrase of at least 20 characters.
  Do not record it on paper, in chat, in shell history, or in a repository file.
- [ ] Paper and pen are ready for the bundle, delegated-key, and root-key comparison fingerprints.
- [ ] The owner has an uninterrupted session and understands the failure rules at the end of this
  runbook. A failed backup-B recovery discards this root and restarts the ceremony.

## Safety boundary

- The build machine creates the delegated release key and protects it with DPAPI CurrentUser.
- The offline host creates the root key, signs the first delegation, and rehearses recovery.
- The root seed exists only in offline process memory and encrypted backup files.
- Only public records and the signed recovery proof return to the build machine.
- Delegated-key and root-key fingerprints cross the boundary on paper, not through the transfer drive.
- Never copy `root-private.encrypted.json` to the repository, build disk, CI, R2, or a chat message.
- Never pass the root-backup passphrase through command-line arguments or environment variables.

All ceremony tools refuse to overwrite an existing key, request, backup directory, proof, or receipt.

## 1. Prepare the delegated key on the build machine

Insert USB A as the transfer device and run from the MKTTool repository:

```powershell
npm run release:delegation:prepare -- `
  --request-output <TRANSFER_DRIVE>:\mkttool-release-ceremony\delegation-request.json `
  --expires-at 2027-08-14T00:00:00Z `
  --label owner-2026
```

The command writes:

- A public delegation request to the path supplied above.
- The delegated private key to
  `%LOCALAPPDATA%\MKTTool\release-signing-authority\delegated-manifest-key.dpapi`.

The DPAPI file is bound to the current Windows user. Do not move or back it up as plaintext. The
delegation request is public and is the only output that must reach the offline host.

Write the printed 32-character `Offline comparison fingerprint` on paper. Do not save it on the
transfer drive; the offline tool requires this separately recorded value before signing anything.

## 2. Build and verify the offline-tool bundle

Build one ZIP directly on USB A:

```powershell
npm run release:ceremony:bundle -- `
  -Output <TRANSFER_DRIVE>:\mkttool-release-ceremony\offline-root-ceremony-tools.zip
```

Write the printed 32-character `Paper comparison fingerprint` on paper. Move USB A with the ZIP and
public `delegation-request.json` to the offline host, disconnect that host from every network, then
compare the ZIP before extraction:

```powershell
$hash = (Get-FileHash .\offline-root-ceremony-tools.zip -Algorithm SHA256).Hash.ToLowerInvariant()
$hash.Substring(0, 32)
```

The result must exactly match the paper bundle fingerprint. A mismatch stops the ceremony. After a
match, extract the ZIP with `Expand-Archive`. Do not run root initialization on the MKTTool build
machine, even for convenience.

## 3. Initialize the offline root

Keep USB A mounted and mount USB B under a different drive letter, then run on the offline host:

```powershell
node .\offline-root-ceremony.mjs initialize `
  --request .\delegation-request.json `
  --backup-a <DRIVE_A>:\MKTTool-release-root-backup-A `
  --backup-b <DRIVE_B>:\MKTTool-release-root-backup-B `
  --expected-delegated-key-id <PAPER_DELEGATED_FINGERPRINT>
```

Enter and confirm the password-manager passphrase at the hidden prompts. The command creates
independently salted AES-256-GCM backups protected by scrypt, the root public key, the signed first
delegation, and a public hash record on both devices.

Write the printed 32-character `Build-machine comparison fingerprint` on paper before leaving the
offline host. The later verification command requires this paper value so a modified transfer drive
cannot replace the root public key and its self-consistent public evidence.

If either write fails, do not reuse a partial directory. Inspect the device, remove only that failed
ceremony directory manually, and restart the whole initialization so both copies describe one root.

## 4. Rehearse recovery from backup B

Still on the offline host, recover from the second copy exactly once:

```powershell
node .\offline-root-ceremony.mjs recover `
  --backup <DRIVE_B>:\MKTTool-release-root-backup-B\root-private.encrypted.json `
  --public-record <DRIVE_B>:\MKTTool-release-root-backup-B\ceremony-public-record.json `
  --proof-output <DRIVE_B>:\MKTTool-release-root-backup-B\root-recovery-proof.json
```

The command decrypts the seed only in memory, verifies the recovered public key, signs a random
recovery challenge, verifies that signature, and writes a non-secret proof. A successful proof is
required; merely confirming that the file exists does not count as recovery.

## 5. Return only public evidence

Copy only these files to the transfer directory on USB A for return to the build machine:

```text
root-public.json
signed-delegation.json
ceremony-public-record.json
root-recovery-proof.json
```

Do not copy either encrypted root backup to the build disk. Encrypted backups remain on devices A and
B, which should be removed from the build machine immediately after public evidence is transferred.

These four files are committed to `src/lib/release/release-authority-public-evidence/`. That location
is load-bearing, not filing: `release-root-trust.ts` imports `root-public.json` from it, so it is the
trust anchor every device uses to accept engine and Relay updates. It lived under `plans/` until
17 August 2026, which put the root of trust behind a path that documentation housekeeping could move
or rewrite. Keep it beside the module that reads it, and expect `release-root-trust.test.ts` to fail
if the evidence and the pinned constant ever disagree.

## 6. Verify against the DPAPI delegated key

Run from the MKTTool repository:

```powershell
npm run release:ceremony:verify -- `
  --root-public <PUBLIC_DIR>:\root-public.json `
  --signed-delegation <PUBLIC_DIR>:\signed-delegation.json `
  --public-record <PUBLIC_DIR>:\ceremony-public-record.json `
  --recovery-proof <PUBLIC_DIR>:\root-recovery-proof.json `
  --expected-root-key-id <PAPER_ROOT_FINGERPRINT> `
  --receipt-output plans\260812-1301-mkb-03-windows-onboarding-and-installer\release-authority-ceremony-receipt.json
```

Verification decrypts the delegated seed through DPAPI, derives its public key, validates the root
signature, validates the backup-B recovery proof, and writes a public receipt. It never exports the
delegated seed or root seed.

## 7. Close the ceremony

Record the following without recording any passphrase, private key, or backup contents:

- Root key id and delegated key id from the public receipt.
- Delegation expiry date.
- Backup A stored at physical location A.
- Backup B stored at physical location B.
- Recovery rehearsal passed from backup B.

After these facts are reviewed, Phase 05 may mark its first three checklist items complete and begin
compatibility-manifest implementation. Root signing remains an offline action; routine releases use
only the DPAPI-protected delegated key.

## Failure rules

- Lost passphrase: stop. Do not create code that depends on an unrecoverable root.
- Failed backup-B recovery: stop and repeat the ceremony with a new root after diagnosing storage.
- Delegated DPAPI file lost before rollout: generate a new delegated key and sign it with the offline
  root; do not restore the delegated private key from the root backups.
- Root backups lost after rollout: installed devices keep running, but future updates require a fresh
  installer pinning a new root on every device.
