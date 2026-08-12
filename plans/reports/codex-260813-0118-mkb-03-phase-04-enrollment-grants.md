# MKB-03 Phase 04 implementation report

## Delivered

- Additive `RelayDevice` grant generation, authorization, completion, and bootstrap metadata migration.
- Signed 30-second delivery authorization after live owner, revocation, grant-hash, and generation checks.
- Relay signature/recipient/expiry/generation verification and one protected atomic grant record.
- Cached recipient proof for exact redelivery, page reload, Relay restart, and simulated reboot.
- Idempotent server completion; browser assertions alone cannot create `Ready`.
- ADMIN-only five-minute first-device bootstrap using the existing Relay-owned plaintext form.
- Compare-and-set server commits, exact owner checks, and a global first-device bootstrap lock close
  revocation, generation, and concurrent-bootstrap races.
- Default-deny classification for both new Relay routes and every new server action.
- Relay source protocol version advanced to 10; the local v10 executable is built and verified but
  not published.

## Automated evidence

- Tampered payload, wrong recipient, expired first delivery, superseded generation, failed store write,
  forged completion, and OPERATOR bootstrap mint all fail closed.
- Fault coverage: post-store, post-proof, pre-server-commit, page reload, and simulated reboot.
- Bootstrap response loss recovers the cached proof after a simulated restart, while the consumed
  generation cannot authorize a second plaintext entry.
- Signed envelopes include issue time and tolerate at most 60 seconds of Windows clock skew. A
  first delivery fails outside the explicit 90-second worst-case residual window; an
  already-persisted exact retry still returns its cached proof.
- Concurrent self-enrollment converges on one row, first-device bootstrap is rechecked under the
  global lock at completion, and a failed hot configure can retry without duplicating enrollment.
- The packaged v10 executable passes the full crypto smoke path, including signed bootstrap,
  protected persistence, completion proof, vault encryption, ticket verification, and replay.
- Loopback behavior tests cover exact origin, reviewed method, and the bounded request body.
- The additive migration is applied from an empty local test database by the full Vitest global setup.

## Files

- Created: `prisma/migrations/20260813014000_enrollment_grant_authorization/migration.sql`,
  `src/lib/enrollment/*`, `src/lib/relay/enrollment/*`, and the Phase 04 report.
- Created in Relay: `bootstrap-authorization*`, `grant-completion-proof.ts`,
  `handle-authorize-bootstrap*`, `handle-read-bootstrap-completion*`, and
  `operator-grant-state.ts` under `relay/src/`.
- Created in UI: `src/components/setup/admin-bootstrap-button.tsx`.
- Updated: `prisma/schema.prisma`, Relay receive/set-key/server/policy/status/config/store modules,
  the setup grant consumer and Relay browser contract, device grant actions, the phase/plan files,
  `docs/project-changelog.md`, and `docs/development-roadmap.md`.

## Human gates still open

- Offline-administrator rehearsal.
- Reboot survival on a real Windows installation.
- Migration rehearsal against a disposable copy of the live Railway database.

## Verification

- `npm test`: 139 files / 1315 tests passed, exit 0.
- `npm run typecheck`: exit 0.
- `npm run lint`: exit 0.
- `npm run build`: exit 0; one pre-existing dynamic backup-path tracing warning remains.
- `npm run relay:build`: Relay v10 built locally; SHA-256
  `48027483114a589960cbd292d2e78731c52782e5e7d9e737818981012921275f`.
- `npm run relay:verify`: exit 0 against the packaged executable. No publish was run.
- `git diff --check`: exit 0 (line-ending conversion warnings only).

## Unresolved questions

None in code. The three human rehearsals above remain required evidence.
