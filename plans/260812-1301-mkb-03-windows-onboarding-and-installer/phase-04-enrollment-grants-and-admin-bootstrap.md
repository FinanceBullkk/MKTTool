# Phase 04 — Enrollment, grants, and ADMIN bootstrap

## Context links

- Spec: [MKT Browser plan §8.1 grant delivery, §MKB-03A](../260810-0244-mkt-browser-noi-bo/plan.md)
- Data model note: same plan §7, "MKB-03 may extend `RelayDevice`"

## Overview

**Priority:** high — this is what makes `Waiting for administrator approval` a real state rather than
a label.
**Status:** 🟡 implemented in code; human rehearsals remain open.

Bind a device to its authenticated owner, deliver the operator key as recipient-sealed ciphertext
under a short one-use authorization, and make completion crash-idempotent.

## Key insights

- The server **never calls Relay**. Every `UI → Relay` call is made by the operator's own browser to
  loopback. Relay stays outbound-offline.
- The grant is **durable opaque ciphertext**; the *authorization to deliver it* is separate,
  short-lived, and one-use. Conflating them is how a revoked device keeps working.
- **Revocation cannot be instant.** An authorization minted just before revocation retains up to 30
  seconds of life because Relay is outbound-offline. Test delivery both inside and after that window
  rather than pretending the race does not exist.
- A browser-only assertion must never create `Ready`. The server records completion only after the
  recipient proof.
- The first device is the only bootstrap exception, and it is **ADMIN-only**. An ordinary operator who
  knows the loopback endpoint must not be able to reach it.

## Requirements

- OPERATOR binds only to their own detected device; previous-owner, revoked-key, wrong-user, and
  shared-PC conflicts fail closed into an ADMIN path.
- Server signs a 30-second, one-use delivery authorization only after a live owner, revocation, and
  generation check.
- Relay allows at most 60 seconds of signed-envelope clock skew in either direction and tells the
  operator to sync Windows time when the drift exceeds that bound. This makes the maximum
  pre-revocation first-delivery window 90 seconds; exact redelivery of an already persisted grant is
  still allowed after that window so a lost response can recover its cached proof.
- Relay verifies signature, recipient, expiry, generation, and local replay state, then atomically
  stores secret, generation, grant ID, and a deterministic completion proof.
- Exact redelivery of the same authorized grant returns the cached proof without rewriting the key;
  server completion is idempotent.
- Tampered payload, reused grant ID, expired authorization, superseded generation, or wrong recipient
  cannot mutate storage.
- ADMIN-only five-minute one-use bootstrap authorization for the first device; plaintext entry stays
  on a Relay-owned loopback surface.
- Bootstrap authorization exists only in Relay memory. Restarting Relay invalidates a pending
  five-minute authorization; ADMIN must mint a new one instead of recovering sensitive broker state
  from disk.

## Related code files

**Modify**
- `MKTTool/prisma/schema.prisma` — minimum grant generation, expiry, challenge, completion metadata on
  `RelayDevice`. Security state for an existing device, not an offline inventory table.
- `MKTTool/src/lib/relay/relay-endpoints.ts` — grant and authorization contracts
- `MKTTool/relay/src/` — grant persistence and proof

**Create**
- `MKTTool/src/lib/relay/enrollment/grant-authorization.ts` — mint and verify the delivery authorization
- `MKTTool/relay/src/grant-completion-proof.ts` — deterministic proof, cached with the stored grant

## Implementation steps

1. Extend `RelayDevice` with the minimum grant state. Postgres holds only signed-envelope metadata and
   opaque recipient ciphertext — never the plaintext operator key or a device private key.
2. Implement the authorization mint behind a live owner/revocation/generation check.
3. Implement Relay-side verification and the atomic write of secret, generation, grant ID, and proof.
4. Make the server consume the proof idempotently.
5. Fault-inject: post-store, post-proof, pre-server-commit, page reload, and reboot.
6. Add the ADMIN-only bootstrap authorization and prove an OPERATOR session cannot mint one.
7. Test revocation both inside and after the 90-second worst-case residual window.

## Todo list

- [x] `RelayDevice` grant state migration
- [x] Delivery authorization mint with live checks
- [x] Relay verification and atomic persistence
- [x] Cached completion proof; exact retry does not rewrite the key
- [x] Idempotent server completion
- [x] Fault injection at post-store, post-proof, pre-server-commit, page reload, and simulated reboot
- [x] ADMIN-only bootstrap; OPERATOR cannot mint an authorization
- [x] Revocation tested inside and after the 90-second worst-case residual window
- [x] Every new server action and loopback route classified in the default-deny inventory

## Open human gates

- [ ] Offline-administrator rehearsal on the real setup journey.
- [ ] Reboot survival on a real Windows installation; automated tests cover a new protected-store
  instance, but they do not replace an OS reboot.
- [ ] Additive migration rehearsal against a disposable copy of the live Railway database. Include a
  pre-migration `RelayDevice` with a pending legacy `operatorKeyGrant`: the new metadata defaults to
  generation `0` with null grant ID/hash, so current code must not leave the operator silently waiting
  forever. After applying the migration to the disposable copy, count affected rows with
  `"operatorKeyGrant" IS NOT NULL AND ("operatorKeyGrantGeneration" < 1 OR "operatorKeyGrantId" IS
  NULL OR "operatorKeyGrantHash" IS NULL)`, choose an explicit invalidate-and-regrant recovery, and
  verify the UI tells the operator that ADMIN must issue a new grant. Do not close this gate from an
  empty-database migration run.

## Success criteria

An offline administrator, a closed page, a browser restart, and a Windows reboot never duplicate
enrollment; the same PC later moves from `Waiting` to `Ready` without reinstalling or copying a
secret. A tampered or replayed grant leaves storage unchanged.

## Risk assessment

- **This phase has the most failure branches in MKB-03.** Write the fault-injection tests alongside
  the happy path, not after.
- A one-minute Windows clock-skew tolerance deliberately extends a signed 30-second delivery grant
  to at most 90 seconds on a slow Relay clock. Keep this bound explicit in tests and UI errors; do
  not silently increase it.
- Schema change on a live Railway database. Migration must be additive and reversible.

## Security considerations

Authentication and authorization stay at each Web boundary. Loopback routes enforce exact origin,
method, bounded body, and signed or sealed input. Every new action joins the default-deny inventory;
CI fails on an unclassified route. No secret travels in a URL or deep link.

## Next steps

Phase 06 rehearses the whole journey including an offline administrator.
