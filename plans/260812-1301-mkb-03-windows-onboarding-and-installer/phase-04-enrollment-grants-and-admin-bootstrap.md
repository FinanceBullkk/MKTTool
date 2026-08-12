# Phase 04 — Enrollment, grants, and ADMIN bootstrap

## Context links

- Spec: [MKT Browser plan §8.1 grant delivery, §MKB-03A](../260810-0244-mkt-browser-noi-bo/plan.md)
- Data model note: same plan §7, "MKB-03 may extend `RelayDevice`"

## Overview

**Priority:** high — this is what makes `Waiting for administrator approval` a real state rather than
a label.
**Status:** ⬜ blocked on Phases 02 and 03.

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
- Relay verifies signature, recipient, expiry, generation, and local replay state, then atomically
  stores secret, generation, grant ID, and a deterministic completion proof.
- Exact redelivery of the same authorized grant returns the cached proof without rewriting the key;
  server completion is idempotent.
- Tampered payload, reused grant ID, expired authorization, superseded generation, or wrong recipient
  cannot mutate storage.
- ADMIN-only five-minute one-use bootstrap authorization for the first device; plaintext entry stays
  on a Relay-owned loopback surface.

## Related code files

**Modify**
- `MKTTool/prisma/schema.prisma` — minimum grant generation, expiry, challenge, completion metadata on
  `RelayDevice`. Security state for an existing device, not an offline inventory table.
- `MKTTool/src/lib/relay/relay-endpoints.ts` — grant and authorization contracts
- `MKTTool/relay/src/` — grant persistence and proof

**Create**
- `MKTTool/src/lib/enrollment/grant-authorization.ts` — mint and verify the delivery authorization
- `MKTTool/relay/src/grant-completion-proof.ts` — deterministic proof, cached with the stored grant

## Implementation steps

1. Extend `RelayDevice` with the minimum grant state. Postgres holds only signed-envelope metadata and
   opaque recipient ciphertext — never the plaintext operator key or a device private key.
2. Implement the authorization mint behind a live owner/revocation/generation check.
3. Implement Relay-side verification and the atomic write of secret, generation, grant ID, and proof.
4. Make the server consume the proof idempotently.
5. Fault-inject: post-store, post-proof, pre-server-commit, page reload, and reboot.
6. Add the ADMIN-only bootstrap authorization and prove an OPERATOR session cannot mint one.
7. Test revocation both inside and after the 30-second residual window.

## Todo list

- [ ] `RelayDevice` grant state migration
- [ ] Delivery authorization mint with live checks
- [ ] Relay verification and atomic persistence
- [ ] Cached completion proof; exact retry does not rewrite the key
- [ ] Idempotent server completion
- [ ] Fault injection at five points plus reboot
- [ ] ADMIN-only bootstrap; OPERATOR cannot reach it
- [ ] Revocation tested inside and after the residual window
- [ ] Every new server action and loopback route classified in the default-deny inventory

## Success criteria

An offline administrator, a closed page, a browser restart, and a Windows reboot never duplicate
enrollment; the same PC later moves from `Waiting` to `Ready` without reinstalling or copying a
secret. A tampered or replayed grant leaves storage unchanged.

## Risk assessment

- **This phase has the most failure branches in MKB-03.** Write the fault-injection tests alongside
  the happy path, not after.
- Schema change on a live Railway database. Migration must be additive and reversible.

## Security considerations

Authentication and authorization stay at each Web boundary. Loopback routes enforce exact origin,
method, bounded body, and signed or sealed input. Every new action joins the default-deny inventory;
CI fails on an unclassified route. No secret travels in a URL or deep link.

## Next steps

Phase 06 rehearses the whole journey including an offline administrator.
