# MKT Browser — a dedicated MultiZen fork for MKTTool

**Direction approved:** 10 August 2026

**Status:** MKB-00 verified 11 August 2026 · MKB-W01 Windows isolation verified · MKB-W02 internal clean break verified · Windows x64 is the primary platform for v1 · macOS Apple Silicon moves to MKB-07 after v1 · retain the MultiZen UX/UI in v1 · zero-confusion Windows onboarding is a hard MKB-03 gate

**Status source:** [development-roadmap.md](../../docs/development-roadmap.md)

**Current architecture:** [system-architecture.md](../../docs/system-architecture.md)

> **Language decision (10 August 2026):** All implementation artifacts, product copy,
> documentation, tests, installers, and release material must be written in English. Direct chat
> with the project owner may remain in Vietnamese. This active specification has been translated
> before MKB-00 implementation; historical records remain unchanged.

> **MKB-00 evidence (11 August 2026):** Official MultiZen `v0.3.1` is pinned at
> `83c6898b2de3de1122b5fea88008fbbaa4677bff` in the separate `E:\MKTBrowser` checkout. The
> unmodified Windows x64 build, direct MCP contract, and current MKTTool adapter passed with only
> disposable profiles; failed proxy application remained fail-closed. The current packaged build
> then opened a disposable profile through a dedicated working proxy, matched its in-browser exit IP
> to an independent probe, and left no profile, process, handoff file, or disposable data root behind.
> The engine remains approved only for unmodified internal use through its official download path and
> must not be bundled. The Apple Silicon half belongs to MKB-07, where the verification runbook still applies.
> See the
> [source/license/engine inventory](../../../MKTBrowser/docs/mkb-00-source-license-engine-inventory.md)
> and [Apple Silicon verification runbook](../../../MKTBrowser/docs/mkb-00-apple-silicon-verification.md).

> **Windows-first exception (10 August 2026):** The project owner authorized MKB-W01 as a bounded
> product-isolation slice before the Apple Silicon half of MKB-00 can run. Windows now has the
> `MKT Browser` display identity, `com.mkttool.browser` application ID, fixed
> `%LOCALAPPDATA%\MKTTool\MKTBrowser\` root, no automatic legacy migration, and no callable
> MultiZen updater, heartbeat, or publish path. The compatible MCP/profile contract remains green.
> This exception does not pass MKB-00 or MKB-01 and does not authorize pilot, distribution, or
> rollout. Evidence is in
> [MKB-W01 Windows product isolation](../../../MKTBrowser/docs/mkb-w01-windows-product-isolation.md).

> **MKB-W02 verified (10 August 2026):** W01 remains the immutable Windows isolation checkpoint.
> W02 now owns the active first-party package, preload, MCP, adapter, and configuration identities,
> uses configurable default port `47822`, and removes the legacy fallback and inert settings. The
> packaged lifecycle passed through the updated MKTTool consumer while `7777` was independently
> occupied. Upstream attribution, history, profile/archive formats, and engine boundaries remain
> unchanged. See
> [MKB-W02 Windows evidence](../../../MKTBrowser/docs/mkb-w02-windows-internal-clean-break.md).

> **Platform decision (10 August 2026, supersedes the original macOS-first ordering):** v1 commits
> to **Windows x64 only**. macOS Apple Silicon moves out of v1 into MKB-07. This is a priority
> choice, not a hardware constraint: Mac machines are available, but the Windows technical slice is
> already verified end to end through W01, W02, and the repackaged Relay, while the macOS half still
> needs Apple Developer enrollment, notarization, a LaunchAgent helper, and Keychain storage, none of
> which is started or owned. No operator workflow depends on macOS today. The cost of this choice is
> that macOS evidence stays at zero for longer; the control is that the Relay and desktop code keep a
> shared core plus thin OS adapters, so MKB-07 adds a platform instead of reopening the core.

## One-line decision

Fork MultiZen into a dedicated desktop application provisionally named **MKT Browser**, with
**Windows x64** as the only committed platform for v1 and **macOS Apple Silicon** as the first
post-v1 platform, while keeping **MKTTool Web** and the **Relay** as independent components. The first version owns only
the application layer, operating workflow, and integrations. It does not fork Chromium, centralize
profiles or cookies on the server, or spend the critical path redesigning the MultiZen interface.

In operational terms:

- MKTTool Web decides **who may perform which action on which account**.
- The Relay verifies tickets and holds operator-domain secrets.
- MKT Browser stores profiles locally, applies the correct proxy and fingerprint, and opens the
  browser window.
- The approved Chromium engine renders websites. It is a separate dependency and is not
  automatically eligible for redistribution merely because the MultiZen application code uses MIT.

## 1. Why fork

MultiZen already provides the core behavior: it stores profiles, accepts MCP commands, and launches
Chromium. What MKTTool still needs is not a new antidetect algorithm but a **controlled workflow**:

1. Operators must not have to remember which profile belongs to which account.
2. Nobody should be able to apply the wrong proxy or open an unproxied profile from the desktop app.
3. A profile creation request interrupted halfway must not leave an undiscoverable orphan profile.
4. The Web application must be able to report which app and engine versions a device runs and
   whether they are compatible.
5. App or engine updates must not occur silently while identities are being warmed up or operated.
6. New-device installation, device transfer, and rollback must each have an explicit path.

A logo-only fork has no value. The fork succeeds only when operators work from MKTTool and rarely
need to open the desktop profile-management interface directly.

### How the target differs from current MultiZen usage

| Concern | Current MultiZen usage | MKT Browser target |
|---|---|---|
| Role | General-purpose profile manager | Dedicated MKTTool desktop component |
| Create profile | The Web app creates a profile and records its ID; after an interrupted request it searches by name | Bind `accountId` directly; a retry always returns the same existing profile |
| Launch profile | The Relay calls “update proxy” and then “launch” as two consecutive commands | The app performs one atomic operation; failed proxy application leaves no launch gap |
| Manual edit/launch | Users may still edit or open profiles directly in the app | Managed profiles lock proxy, fingerprint, deletion, and ordinary direct launch |
| Status | Primarily indicates whether MultiZen answers MCP | Reports app, engine, contract, capabilities, and the exact failing layer |
| Installation | MultiZen and Relay are installed separately and the MCP token is copied manually | One authenticated, signed Windows download opens one guided setup journey; the operator never handles separate components, tokens, keys, ports, paths, archives, or checksums |
| Updates | App and engine change independently of the MKTTool workflow | Signed approved releases, pinned engine, staged pilot, and rollback |
| Device transfer | Export/import occurs outside the workflow and can leave two live copies | Transfer lock, recipient-encrypted bundle, and ADMIN audit trail |

The distinguishing feature is not a “more magical fingerprint.” MKT Browser takes MultiZen's
proven core and turns it into a device managed by MKTTool: difficult to misuse and practical for a
team to operate.

### v1 UX/UI decision

V1 **retains MultiZen's design language, layout, and components**. It changes only the required
name and logo and adds small functional signals: managed-profile badges, connection status, English
errors, and locked states for controls that could corrupt a proxy or fingerprint assignment. It does
not introduce a new design system, redraw the dashboard, or change familiar flows merely to make the
fork appear more bespoke.

A redesign may begin after the team has used the application and produced evidence about the parts
that are difficult to use. It is not on the fork's critical path.

### v1 Windows onboarding decision

The two-process architecture is an implementation detail, not a user journey. A normal operator sees
one product called **MKTTool on this PC** and completes this path:

`Download for Windows → Install → Sign in → Confirm this PC → Waiting for administrator approval or Ready`

The signed installer starts both MKT Browser and Relay, acquires an approved engine from its official
source when redistribution is not allowed, verifies every artifact automatically, and opens the one
authenticated setup page. Durable state resumes when that page is reopened after sign-in, refresh,
browser restart, or Windows reboot.
**Confirm this PC** is a deliberate user click because the first browser-to-loopback request must be
user-triggered for Local Network Access permission. The page shows the detected PC name and signed-in
email before binding them; it does not ask the operator to type identifiers that the system already
knows.

A normal operator must never have to:

- download Relay or MKT Browser separately, extract a ZIP, run `.bat`/PowerShell, install Node, or
  bypass an unsigned-publisher warning;
- visit a localhost status page or manually navigate among `/setup`, `/relay-download`, and
  `/relay-devices`;
- see or copy an MCP token, operator key, public key, device ID, port, JSON field, filesystem path,
  engine archive, checksum, or command;
- select the device owner or use a manual-key fallback when an administrator is unavailable.

`Waiting for administrator approval` is a successful, non-error installation outcome. It survives
reload and reboot, tells the operator that there is nothing else to do, creates an actionable ADMIN
queue, and moves to `Ready` automatically after a grant arrives. The four technical layers remain
available behind an expandable support/ADMIN view; the primary operator view shows one plain state
and one next action.

The first device for the whole team is the only bootstrap exception. An authenticated ADMIN starts a
five-minute, one-use bootstrap authorization for that registered local device, then enters
`VAULT_KEY_OPERATOR` only into a Relay-owned loopback surface on that PC. The plaintext never enters a
Web field, installer, URL, MKT Browser, log, crash report, or server store. Ordinary operator setup
does not reveal or enable this path. Every later device uses ADMIN-approved, recipient-sealed delivery
from an already-ready Relay. This guided setup is functional release work, not the custom redesign
deferred to MKB-06.

## 2. Desired outcomes

### What operators see

- One signed Windows installer. macOS receives its notarized `.dmg` in MKB-07, after v1.
- One current-PC setup verdict — `Starting`, `Sign in`, `Confirm this PC`, `Waiting for administrator
  approval`, `Ready`, or `Needs repair` — with technical layers hidden under support details.
- The local device identity, signed-in owner, enrollment, app/engine versions, and compatibility are
  detected automatically; an operator confirms them instead of retyping them.
- **Create profile on this device** creates exactly one profile, applies the proxy and fingerprint,
  and pins the account to the device.
- **Launch profile** opens the correct account; an error identifies the failing step and the required
  remedy.
- MKTTool-managed profiles cannot have their proxy or fingerprint edited or be deleted casually in
  the desktop app.
- MKTTool-managed profiles have no ordinary direct-launch button. A separate recovery path must
  warn operators instead of bypassing Web and Relay checks.
- CAPTCHA and 2FA remain human handoff steps inside the opened browser window.

### What administrators control

- A named queue of current-PC enrollment requests showing authenticated owner, detected device,
  public-key fingerprint, request time, and revocation/previous-owner conflicts before approval.
- Which device runs which app, engine, and control-contract versions.
- Which releases may be installed and which checksums and signatures must match.
- Staged updates rather than an all-at-once rollout.
- Audited device transfers that do not leave two simultaneously active profile copies.
- Revoking a device still blocks new tickets as it does now; the system makes no false promise to
  erase data remotely from a lost device.

### v1 measures

| Measure | Passing condition |
|---|---|
| Compatibility | The current list/create/update/launch/close flow works without changing ticket shape |
| Proxy safety | No launch path remains after proxy application fails or when a profile is already running with a different configuration |
| Installation usability | On a clean standard-user Windows account, an unfamiliar operator reaches `Waiting for administrator approval` or `Ready` with at most ten minutes of user attention, excluding automatic artifact transfer and administrator wait time, with on-screen guidance and zero technical interventions |
| Approval handoff | An offline administrator, page close, browser restart, or Windows reboot does not duplicate enrollment; the same PC later moves from `Waiting` to `Ready` without reinstalling or copying a secret |
| No orphans | Retrying create after a timeout returns the original profile rather than creating a second one |
| Data stability | Restarting, upgrading, or rolling back one version retains profile IDs, cookies, localStorage, and fingerprint seeds |
| Operations | One test device runs for at least seven days, followed by one real account completing first login and cold start |

## 3. Scope and non-goals

### Included in v1

- Fork the MultiZen desktop application into a separate repository.
- Make Windows x64 the primary and only committed platform.
- Keep the Relay and desktop code as a shared core plus thin OS adapters for paths, autostart, and
  secure storage, so macOS can be added in MKB-07 without reopening the core.
- Intel Mac and Linux are not on the critical path.
- Retain the MultiZen UX/UI with only minimal rebranding and required managed-profile states and
  locks.
- Keep MCP on loopback and retain compatibility with the tools MKTTool already calls.
- Add **MKTTool-managed profiles**.
- Add version, capability, diagnostics, and stable error-code reporting.
- Orchestrate proxy application and profile launch as one safe operation.
- Add an independent release channel, controlled updates, and rollback.
- Provide a copy-and-verify import path from existing MultiZen data without deleting the source.
- After the flow is stable, package MKT Browser and the Relay into one end-user installer before any
  team member is asked to self-install it.

### Excluded from v1

- Do not build or modify a Chromium antidetect binary.
- Do not ship, sign, or notarize a macOS artifact in v1, and do not buy Apple Developer access for
  it yet. Do not hardcode Windows assumptions into the shared core either; that is what makes MKB-07
  affordable.
- Do not redesign the UX/UI or create a custom design system in v1.
- Do not redistribute an engine binary unless its license permits redistribution.
- Do not cloud-sync profiles or cookies to MKTTool Web.
- Do not let the server call MKT Browser directly over the internet.
- Do not expose the Relay or MKT Browser MCP through a public tunnel, edge forwarder, or remotely
  hosted proxy pool. Both listeners remain loopback-only.
- Do not round-robin or fail over between accounts, profiles, devices, or proxies. A retry stays on
  the same bound identity and static proxy or fails closed.
- Do not turn MKT Browser into a SaaS product or sell it externally.
- Do not add automatic CAPTCHA solving, auto-DM, reply hijacking, automated Group posting, or an
  unattended 24/7 bot.
- Do not add Reddit auto-posting to the fork. That remains Phase 05 and still requires human handoff.
- Do not support moving one identity back and forth between multiple devices. An account has exactly
  one profile-holding device at any moment.

## 4. Target architecture

```mermaid
flowchart LR
  subgraph Server["SERVER"]
    Web["MKTTool Web\nmanagement · authorization · ticket issuance"]
    DB[("Postgres\naccount · proxy · profile ID · device")]
    Web <--> DB
  end

  subgraph Operator["OPERATOR DEVICE"]
    Normal["Chrome/Edge\nopens MKTTool"]
    Relay["Relay\n127.0.0.1:47821"]
    Browser["MKT Browser\nMCP 127.0.0.1:47822"]
    Store[("Local profile store\nSQLite + user-data-dir")]
    Engine["Approved Chromium engine"]
    Proxy["Account static proxy"]

    Normal -->|"signed + encrypted ticket"| Relay
    Relay -->|"MCP with token"| Browser
    Browser <--> Store
    Browser --> Engine
    Engine --> Proxy
  end

  Normal -->|HTTPS| Web
  Proxy --> Reddit["Reddit"]
```

### Boundaries that must remain distinct

| Component | May know | Must not know |
|---|---|---|
| MKTTool Web | account, encrypted proxy, profile ID, account owner, profile-holding device | local profile/cookies; operator-domain key |
| Relay | operator-domain key, device private key, ticket body after verification | whole-system database; authority to issue tickets |
| MKT Browser | local profiles, launch proxy, fingerprint seed, engine | account password/TOTP; vault key; MKTTool login session |
| Engine | current profile's user-data-dir and network traffic | Web administration access; Relay keys |

MKT Browser and the Relay may ship in **one installer**, but they remain two processes with two
responsibilities. The Relay retains the smallest cryptographic surface; the Electron UI must never
receive the operator-domain key.

## 5. Invariants

1. **Every Reddit account has exactly one static proxy, one fingerprint/profile, one profile-holding
   device, and one responsible operator at any moment.** One operator or device may hold multiple
   accounts; two accounts must not share a proxy or profile.
2. A failed proxy application prevents profile launch.
3. A profile already running with a different proxy must not silently reuse the old session.
4. The fingerprint seed generated for an account is immutable; import and device transfer preserve it.
5. The server only issues tickets and never has a key that can decrypt account secrets.
6. Every desktop port listens only on `127.0.0.1`; MCP always requires a bearer token.
7. MCP tokens, proxy passwords, and sensitive data never enter logs, errors, or telemetry.
8. The engine never updates silently. Every engine change passes pilot and fingerprint measurement.
9. Import never deletes source data. Cleanup occurs only after acceptance and an explicit human action.
10. A 2FA or CAPTCHA challenge stops for human handling; no automatic bypass path is added.
11. Uninstalling the app does not delete profiles by default. An uncleanly closed profile is reported
    at the next application start instead of being “repaired” by rebuilding the identity.

## 6. Contract between the Relay and MKT Browser

### Required compatibility layer

MKT Browser v1 retains the `/mcp` endpoint, bearer token, and the operations used by the current adapter:

| Need | Compatible tool |
|---|---|
| List profiles | `list_profiles` |
| List fingerprint options | `list_fingerprint_options` |
| Create profile | `create_profile` |
| Apply proxy | `update_profile` |
| Launch profile | `launch_profile` |
| Close profile | `close_profile` |

This lets the first fork build be verified with MKTTool before changing tickets, the database, or
authorization flows.

### MKTTool-specific extension

| Tool/capability | Purpose |
|---|---|
| `get_runtime_info` | Return app version, contract version, engine kind/version, and capabilities |
| `create_managed_profile` | Accept `externalRef = accountId` and `requestId`; safe retries return the existing profile |
| `launch_managed_profile` | In one operation: check state → apply proxy → verify configuration → launch |
| `reconcile_managed_profile` | Find the exact profile by `externalRef` after a timeout; never guess by a duplicated name |
| `diagnose_runtime` | Check engine, profile store, port, token, and proxy configuration without revealing secrets |

Every tool returns a **machine-readable error code**; the Relay translates it into English user copy.
MKTTool must not compare free-form upstream error strings.

The token used by the Relay may call only profile-management tools. Page-control tools such as
`navigate`, `click`, and `type` for Phase 05 require a separate capability or token and remain disabled
by default. Installing MKT Browser must not accidentally enable browser automation.

### Operation correlation and exposed-surface control

Every accepted profile operation carries two non-secret identifiers with distinct meanings:

- `operationId` is the ticket envelope `jti`. It identifies one Web → Relay → MKT Browser attempt.
- `requestId` is the stable idempotency key for a managed create request. A retry may receive a new
  `operationId` while retaining the same `requestId` and profile result.

The Relay passes the identifiers into MKT Browser and returns the same `operationId` with a structured
stage, machine-readable error code, duration, and runtime versions. Local diagnostics may record only
an allowlisted subset of those fields. They must never record ticket bodies, proxy endpoints or
credentials, account secrets, page content, cookies, or browser storage.

This is correlation, not a new callback channel. The Relay remains outbound-offline, and v1 does not
let the hosted browser turn a local response into a trusted server audit statement. MKTTool continues
to record what it can prove — ticket issuance — while persistent outcome receipts or offline device
telemetry stay deferred until pilot evidence justifies a data model and provenance design.

Exposure is default-deny. Maintain a checked-in inventory of every MCP tool, preload/IPC handler, and
Relay HTTP endpoint together with its capability class and guard. CI compares that inventory with the
runtime-exposed surface and fails when a new or renamed operation is unclassified. Unknown tools,
routes, and capability combinations are denied rather than inheriting access from a broad middleware
allowlist.

Example capability response:

```json
{
  "provider": "mkt-browser",
  "appVersion": "0.1.0",
  "contractVersion": 1,
  "profileSchemaVersion": 1,
  "engine": { "kind": "approved-external", "version": "..." },
  "capabilities": [
    "managed-profile-v1",
    "idempotent-create-v1",
    "atomic-launch-v1"
  ]
}
```

## 7. Data

### On the server

V1 reuses the current data:

- `Account.antidetectProfileId`: profile ID.
- `Account.deviceId`: profile-holding device.
- `Account.proxyId`: account's unique proxy.
- `RelayDevice`: device owner, ticket recipient key, and revocation state.

**Do not add a table during the compatibility phase.** The Relay reads version and capability data
directly from the current device. Store this data in Postgres only if the pilot demonstrates a real
need to track devices while they are offline; do not prebuild a table for a hypothetical need.

MKB-03 may extend `RelayDevice` with the minimum grant-generation, expiry, challenge, and completion
metadata required to enforce one-use enrollment. That is security state for an existing device, not
an offline runtime-inventory table. Postgres may hold only signed-envelope metadata and opaque
recipient ciphertext; it never receives the plaintext operator key or device private key.

Device transfer is a post-pilot slice and must not reuse `Account.status`, which describes account
health. During MKB-05, add a minimal `ProfileTransfer` record containing the account, source device,
recipient device, status, and timestamps. An account may have only one active transfer; create and
launch routes refuse ticket issuance while the lock exists. The record retains orchestration evidence
only; it never stores a profile file, cookies, or decryption keys.

### On the operator device

Use a fixed operating-system-specific data root so changing Electron's `productName` does not make the
application look at an empty store:

| Operating system | Data root |
|---|---|
| macOS | `~/Library/Application Support/MKTTool/MKTBrowser/` |
| Windows | `%LOCALAPPDATA%\MKTTool\MKTBrowser\` |

```text
MKTBrowser/
├── data/
│   ├── profiles.db
│   ├── profiles/<profile-id>/
│   ├── mkt-control.db
│   └── migration-manifests/
├── engines/<engine>/<version>/
├── mcp-token
└── settings.json
```

`mkt-control.db` is the fork's auxiliary store; do not deeply modify upstream `profiles.db` schema.
Managed-profile metadata includes `externalRef`, `deviceId`, `createdAt`, `fingerprintSeedHash`, and
`lastAppliedProxyHash`. It contains no password, TOTP secret, or ticket contents.

Mac devices must use FileVault. Windows devices must use BitLocker or equivalent full-disk encryption.
A Chromium user-data-dir contains real sessions; do not falsely imply that SQLite encryption protects
all of it.

The device private key and operator-domain key belong to the Relay, not Electron. On macOS, store them
in Keychain and allow only the signed Relay helper to read them; on Windows, use a per-user secure
store such as DPAPI or Credential Manager. JSON files contain only non-sensitive metadata. The MKT
Browser MCP token remains separate, with `0600` permissions on macOS and per-user ACLs on Windows;
the Relay discovers it locally.

MKB-03 must migrate every existing Windows secret deliberately. The operator-domain key and Relay
device private key move from plaintext JSON into DPAPI CurrentUser or Credential Manager; the MCP
bearer remains in protected per-user storage that both trusted local processes can consume. Migration
is transactional: import, read back and verify, then remove the plaintext source. A crash is safely
retryable, and repair, rollback, backup, temporary files, and uninstall must never recreate or retain
an unnoticed plaintext copy. Do not claim process-level isolation where Windows provides only a
same-user boundary; full-disk encryption remains required for profile/session data.

Secret migration establishes a **rollback floor**. First activate a signed bridge Relay that can read
legacy plaintext and the protected store but writes only the protected format. After it imports and
verifies the secret, commit a durable secure-store schema marker and delete the plaintext source. From
that point, the retained rollback set must contain that bridge Relay or a newer compatible version;
the manifest and local updater refuse any older Relay even through rollback. Fault injection covers
before/after import, read-back verification, source deletion, marker commit, activation, and reboot.
No binary that requires plaintext may run after the deletion boundary.

## 8. Primary flows

### 8.1 First installation on a device

```mermaid
sequenceDiagram
  actor Operator
  actor Admin
  participant Setup as Signed Windows installer
  participant MB as MKT Browser
  participant R as Relay
  participant UI as MKTTool setup page in browser
  participant S as MKTTool server
  participant AR as Ready ADMIN Relay

  Operator->>Setup: Run the one authenticated download
  Setup->>MB: Install and start per-user app
  MB->>MB: Generate MCP token in protected per-user storage
  Setup->>R: Install and start per-user helper
  Setup-->>Operator: Open the single setup route
  Operator->>UI: Sign in, review PC + email, click Confirm this PC
  UI->>R: User-triggered loopback readiness probe
  R-->>UI: Public device identity + local runtime status
  UI->>S: Self-enroll this device for the signed-in user
  S-->>UI: deviceId + server public key + approval state
  UI->>R: Configure public enrollment values
  UI->>S: Poll for recipient-sealed grant
  alt Grant not approved yet
    S-->>UI: Waiting for administrator approval
    Admin->>UI: Approve named owner/device on a ready ADMIN PC
    UI->>AR: Ask local ADMIN Relay to seal for recipient
    AR-->>UI: Recipient-sealed ciphertext
    UI->>S: Store opaque signed grant envelope
  end
  S-->>UI: Opaque ciphertext + 30-second one-use delivery authorization
  UI->>R: Deliver both over loopback
  R->>R: Persist secret, generation, grant ID, and completion proof atomically
  R-->>UI: New or cached recipient-bound completion proof
  UI->>S: Idempotently consume proof and mark enrollment complete
  UI->>R: Read live four-layer health
  R-->>UI: Ready
```

All `UI → R` calls above are made by the user's browser to loopback. The server never calls Relay,
and the installer opens the normal authenticated setup route without a bearer, bootstrap secret, or
operator key in the URL, command line, or configuration. The installer is identical for every user
and contains only public release metadata and the approved Web origin.

The setup controller owns these user-visible states:

| State | Meaning | Only primary action |
|---|---|---|
| `Starting` | Installed components or the pinned engine are still becoming available | Wait, then retry automatically |
| `Sign in` | There is no valid MKTTool session | Sign in normally |
| `Confirm this PC` | The page has not yet performed the user-triggered loopback check | Confirm the shown PC and email; allow Local Network Access if prompted |
| `Waiting for administrator approval` | The device is enrolled correctly but has no approved operator grant | No operator action; keep polling and resume after reload/reboot |
| `Ready` | Owner/device reconciliation, grant persistence, live app/engine health, contract compatibility, and secure storage all pass on this PC | Continue to MKTTool |
| `Needs repair` | A specific recoverable layer failed | Show one plain-language repair/retry action; keep technical detail expandable |

Readiness is local and current, not inferred from another team device or from a historical server
flag. A second operator on a clean PC sees `Confirm this PC` even when other devices are ready. The
server reconciles local public key and `deviceId` with the authenticated owner and revocation state on
every setup pass. A wrong signed-in user, previous owner, shared Windows account, or revoked key fails
closed into an ADMIN transfer/re-enrollment path; a friendly PC name is never proof of ownership.

An operator-key grant is durable opaque recipient-sealed ciphertext with a grant ID,
device/public-key binding, and monotonic operator-key generation. When the recipient polls, the server
checks current owner, revocation, generation, and pending state, then signs a separate 30-second,
one-use delivery authorization for that ciphertext. Relay requires both, verifies the
authorization signature/recipient/expiry/generation and local replay state, then atomically stores the
secret, generation, grant ID, and a deterministic completion proof.

If the response, browser action, or server commit is lost after that atomic write, exact redelivery of
the same authorized grant returns the cached proof without rewriting the key; server completion is
also idempotent. A tampered payload, different grant reusing an ID, expired authorization,
superseded generation, or wrong recipient cannot mutate storage. Revocation immediately blocks new
delivery authorizations and invalidates pending server state, but an authorization minted just before
revocation retains a residual lifetime of at most 30 seconds because Relay remains outbound-offline.
Tests cover delivery both inside that residual window and after expiry. As elsewhere in the design,
revocation cannot erase a valid payload or secret already obtained by a lost device; key/credential
rotation covers that case. The server clears a pending grant and records completion only after the
recipient proof; a browser-only assertion can never create `Ready`.

For the first-device exception, an ADMIN-only guarded Web action issues a five-minute, one-use,
device-bound bootstrap authorization. Relay verifies it before exposing its local plaintext entry
surface. This is not a fallback for an unavailable administrator, and ordinary operators cannot
activate it even if they know the loopback endpoint.

The v1 team release is an Authenticode-signed per-user Windows installer with autostart and no UAC
requirement. Relay remains a separate process even when it ships in the same package. The macOS
release — a native Apple Silicon application signed with Developer ID, notarized, with Relay as a
LaunchAgent helper and no Homebrew, `xattr`, or Terminal requirement — is specified in MKB-07 and is
not a v1 deliverable.

During technical development, the app and Relay may be separate artifacts for diagnostics. Do not
hand them to the team until Windows has **one signed download and one resumable setup controller**.
The current Relay ZIP, `setup.bat`, manual checksum, localhost status page, and separate technical
MKT Browser directory remain owner/developer artifacts, not an acceptable team installation flow. If
the engine license prohibits bundling, the installer or app downloads the manifest-pinned version
from the official source and verifies its signature or checksum; the operator does not perform those
steps manually and the runtime never resolves an unpinned “latest” version.

### 8.2 Create an account profile

```mermaid
sequenceDiagram
  actor Operator as Responsible operator
  participant W as MKTTool Web
  participant R as Relay
  participant MB as MKT Browser

  Operator->>W: Click Create profile on this device
  W->>W: Verify account, proxy, owner, and device
  W-->>Operator: Signed CREATE_PROFILE ticket encrypted for the device
  Operator->>R: Browser forwards ticket over localhost
  R->>R: Verify signature, expiry, recipient, and replay
  R->>MB: create_managed_profile(accountId, requestId, proxy, fingerprint)
  MB->>MB: Return existing profile when externalRef exists
  MB->>MB: Create proxy and fingerprint as one business transaction
  MB-->>R: profileId
  R-->>W: Return profileId through the browser
  W->>W: Save profileId and pin deviceId
```

If the browser times out after the desktop has created the profile, reconciliation uses `externalRef`.
It never searches by name and never creates a second profile.

### 8.3 Launch a profile

```mermaid
sequenceDiagram
  actor Operator as Responsible operator
  participant W as MKTTool Web
  participant R as Relay
  participant MB as MKT Browser
  participant E as Engine

  Operator->>W: Click Launch profile
  W->>W: Verify login, account owner, device, account status, and live proxy
  W-->>Operator: LAUNCH_PROFILE ticket for the profile-holding device
  Operator->>R: Forward ticket over localhost
  R->>R: Verify, decrypt, and reject replay
  R->>MB: launch_managed_profile(profileId, proxy)
  MB->>MB: Reject a profile already running with a different proxy
  MB->>MB: Apply proxy and verify saved configuration
  MB->>E: Open window using the correct user-data-dir
  E-->>Operator: Human handoff for 2FA/CAPTCHA
```

During transition, the Relay prefers `launch_managed_profile`. Only when the capability is absent may
it fall back to the current `update_profile` followed by `launch_profile` sequence.

### 8.4 Update the local compatibility set

The installer/app pins an offline release-root public key and the expected Authenticode publisher.
The root signs delegated manifest-key rotation/revocation statements; delegated private keys and code
signing credentials remain separate from R2 credentials. R2 is an untrusted artifact host, not the
source of release authority. Protected local state records the highest accepted compatibility-set
sequence, secure-store rollback floor, and exactly one retained rollback sequence.

A truly clean install accepts only a manifest at or above the minimum sequence embedded in its signed
installer. If profile/device data exists but the anti-downgrade state is missing or damaged, reinstall
fails into an ADMIN repair/recovery path instead of pretending the device is clean. A local one-use
ADMIN rollback authorization names the retained sequence and is the only allowed monotonic exception.

1. The Web app or status page reports an approved release; it does not close profiles automatically.
2. Verify a signed compatibility manifest that pins installer, Relay, MKT Browser, control-contract,
   and engine versions, hashes, sizes, sequence, publisher, delegated key, and allowed transition.
   Reject a stale/replayed manifest, wrong publisher/key, revoked delegation, incompatible tuple, or
   network-driven downgrade.
3. Refuse the update before stopping any process when a profile is open.
4. Snapshot metadata, databases, secure-store migration state, and the previous approved compatibility
   set; validate SQLite before changing anything.
5. Stage Relay, MKT Browser, and the pinned engine without activating a mixed set. If the engine is
   externally acquired, resume interrupted downloads and verify the approved official artifact.
6. Activate the complete set, restart both processes in either order, and run smoke tests: runtime
   health → list → open test profile → cookie → proxy → close.
7. On any failure or reboot between steps, converge to either the complete new set or the complete
   retained set. Never run a mixed tuple or guess at a downgrade migration.
8. Permit rollback only through an explicit ADMIN/human action and one-use local authorization to the
   retained approved version at or above the secure-store rollback floor; audit it and never let
   release metadata trigger a silent downgrade.

The engine progresses through **development → pilot device → team**. Do not automatically fetch the
latest engine every day: changing Chromium may change the measured fingerprint even if the profile ID
and seed remain constant. A cached approved engine can reach `Ready` while offline; an uncached engine
reports a resumable preparation state instead of asking the operator to obtain an archive.

### 8.5 Transfer a profile to another device

V1 uses a controlled manual flow:

1. An ADMIN creates a transfer from the old device to the new one. The Web app sets a **device-transfer
   lock**, so neither device can receive new create or launch tickets for the account.
2. Close the profile on the old device and confirm that no engine process holds its user-data-dir.
3. Export the profile with a one-time key and encrypt that key for the recipient device's public key.
   The manifest records profile ID, schema version, seed hash, and checksums.
4. Transfer the file outside MKTTool Web. The server stores only transfer evidence and never stores the
   file or plaintext.
5. The new device's Relay opens the key; MKT Browser imports into staging and verifies the profile ID,
   cookies, and seed.
6. An ADMIN accepts the import before repinning the account to the new device.
7. Launch from the Web app on the new device. On success, complete the transfer and leave the old copy
   locked during a recovery window.
8. After the recovery window, delete the old copy through a separate audited action. Cancelling midway
   leaves the pin on the old device and never allows two copies to be active.

Do not implement two-way sync. If the old device is lost before export, the system can revoke new
tickets but cannot promise to recover or remotely erase sessions already stored on that disk.

The recovery play for that day must be decided in advance rather than improvised: revoke the device so
it receives no further ticket, rotate the operator-domain key and every credential that device could
decrypt, unpin the account so it can be pinned to a replacement device, and accept that the identity
needs a fresh first login there with the cold-start risk that implies. Decide before the pilot whether
an identity that loses its profile is re-logged in or retired. That is a calm decision now and a
panicked one later.

### 8.6 Import existing MultiZen profiles

- Run only when both MultiZen and MKT Browser are closed.
- When the MKT Browser store is empty, offer to **copy**, never move automatically.
- Copy into a staging directory; validate the database, profile count, and checksums before an atomic
  rename.
- Preserve profile IDs and seeds and write a migration manifest.
- Retain the old MultiZen directory until acceptance and explicit user cleanup.
- Do not support reverse synchronization; all post-import actions occur in only one application.

The server vault currently has no real Reddit accounts, so the lowest-risk route is to finish the
pilot before creating the real profile fleet. Import still matters for development test profiles and
future upstream upgrades.

### 8.7 Future Phase 05 — prepare a post, with a human final submission

The fork does not automatically enable Phase 05. Only after M3 passes may the semi-automated flow use
the desktop where the real browser session lives:

```mermaid
sequenceDiagram
  actor Operator
  participant W as MKTTool Web
  participant R as Relay
  participant MB as MKT Browser
  participant RD as Reddit

  Operator->>W: Click Prepare post
  W->>W: Re-evaluate safety rules at execution time
  W-->>Operator: PREPARE_REDDIT_POST ticket for the correct device
  Operator->>R: Forward ticket over localhost
  R->>R: Verify signature, owner, expiry, and replay
  R->>MB: Open correct profile, navigate, and fill draft
  MB->>RD: Navigate to composer and enter content
  MB-->>Operator: STOP before the submit button
  Operator->>RD: Review and click Submit manually
  Operator->>W: Mark posted and paste link
```

- Do not place the session lock on Railway. The browser session is on the operator device, so the lock
  by `profileId` belongs in MKT Browser.
- Page-control tools use a different token or capability from profile management and are enabled only
  after Phase 05 is implemented.
- A 2FA or CAPTCHA challenge or a Reddit UI change stops in the real window. Never bypass it or click
  the final submit button automatically.
- A new ticket kind declares its own `MIN_RELAY_VERSION_BY_KIND`. Do not raise minimum versions for
  existing tickets when their shape has not changed.

The original Phase 05 plan predates the Railway deployment and is a historical record. Implementation
must use this flow and the living roadmap as the current sources of truth; automation and CDP must not
move back to the server.

## 9. Repository structure and upstream strategy

MKT Browser belongs in a separate repository, not inside MKTTool:

```text
mkt-browser/
├── apps/desktop/                # Electron main + renderer
├── packages/mcp-server/         # compatible tools
├── packages/profile-manager/    # SQLite + user-data-dir
├── packages/cdp-driver/         # engine control
├── packages/managed-contract/   # MKTTool version, schema, and error codes
├── packages/diagnostics/        # engine/proxy/WebRTC/fingerprint checks
├── resources/licenses/          # MIT notice + dependency licenses
└── .github/workflows/           # test, build, SBOM, signing, release
```

Git uses explicit remotes and branches:

- `upstream/master`: original MultiZen source; never push project commits there.
- `origin/main`: approved MKT Browser work.
- Each upstream intake occurs in a dedicated branch and passes contract, migration, and fingerprint
  acceptance before entering `main`.

Prefer additive modules and configuration over deep edits across upstream packages. Any unavoidable
upstream modification needs a test that names the MKTTool invariant absent from upstream.

## 10. License, engine, and release

MultiZen application code uses MIT and may be used, modified, and distributed while retaining its
copyright notice and license. [MIT source](https://raw.githubusercontent.com/multizenteam/multizen-browser/master/LICENSE).

However, the current bootstrap path downloads CloakBrowser from its official release channel. The
current CloakBrowser binary license treats compiled binaries separately from the MIT wrapper: it
allows internal use while restricting modification, repackaging, and redistribution, and the latest
major may require a subscription:

- [MultiZen ChromiumBootstrap](https://github.com/multizenteam/multizen-browser/blob/master/apps/desktop/src/main/ChromiumBootstrap.ts)
- [CloakBrowser Binary License](https://github.com/CloakHQ/CloakBrowser/blob/main/BINARY-LICENSE.md)

Therefore each release must pass these gates:

1. Approve the exact engine and version and the terms governing **internal use**.
2. Do not include a non-redistributable engine binary in the MKT Browser installer. Download directly
   from its official channel or use another approved agreement.
3. Retain NOTICE and license text for every component.
4. Generate an SBOM and run license checks for each release.
5. Use Developer ID, hardened runtime, and notarization on macOS and code signing on Windows. A
   checksum does not replace source authentication.

Apple identifies Developer ID as the mechanism Gatekeeper uses to identify developers distributing
outside the Mac App Store; notarization scans the signed package and issues a Gatekeeper ticket:

- [Apple — Signing your apps for Gatekeeper](https://developer.apple.com/developer-id/)

Upstream includes macOS build and installation paths, but its README currently recommends `xattr -cr`
to bypass warnings for an unsigned DMG. That is acceptable only for developer testing, not for the
employee installation experience:

- [MultiZen — macOS installation and cross-platform CI](https://github.com/multizenteam/multizen-browser)

V1 needs exactly one artifact: Windows `x64`. macOS `arm64` artifacts belong to MKB-07, where native
dependencies and the engine must match the architecture and running through Rosetta does not count as
native compatibility. Intel Mac stays conditional on real inventory even then.

Upstream currently declares Electron 33. The official schedule says that line reached end of support
on 29 April 2025. Moving to an Electron line supported at release time is a release gate, not optional
cleanup:

- [MultiZen desktop package](https://github.com/multizenteam/multizen-browser/blob/master/apps/desktop/package.json)
- [Electron release schedule](https://releases.electronjs.org/schedule)
- [Electron security checklist](https://www.electronjs.org/docs/latest/tutorial/security)

This is a legal and operational gate, not legal advice.

## 11. Expected changes in the MKTTool repository

### Unchanged during the compatibility phase

- Ticket shape and ticket verification.
- The two vault domains.
- `Account.antidetectProfileId`, `Account.deviceId`, and `Account.proxyId`.
- Authentication routes, authorization, and account-to-device pinning.
- Safety rules and all Facebook and health-check flows.

### Changes by vertical slice

| Slice | Code area | Change |
|---|---|---|
| Provider identification | `relay/src/relay-config.ts`, `relay/src/relay-antidetect.ts` | W02 complete: use `mkt-browser` only; rollback is the frozen W01 checkpoint, not a runtime provider fallback |
| Relay core and OS seam | build/release + `relay/src/relay-home.ts` | Keep Windows behavior behind adapters over a shared core: Windows per-user autostart + secure store now, macOS helper/LaunchAgent + Keychain at MKB-07 |
| MCP contract | `src/lib/antidetect/` | W02 complete: owned client/adapter/contract names and port; runtime capability reporting remains future work |
| Health | `src/lib/relay/relay-endpoints.ts`, `relay/src/main.ts` | Return current-device provider/app/engine/contract health without sensitive tokens or paths; historical enrollment alone never means `Ready` |
| Idempotent create | profile actions + adapter | Send `accountId`/`requestId` and reconcile by external reference |
| Atomic launch | `relay/src/launch-profile.ts` | Prefer the atomic capability and retain the old path for a bounded transition window |
| Operation correlation | ticket issuer + Relay client + managed contract | Carry ticket `jti` as `operationId`; preserve create `requestId`; return sanitized stage, code, duration, and versions without adding a remote callback |
| Surface authorization | MKT Browser MCP/preload + Relay HTTP routes | Keep a default-deny exposure inventory; CI fails on any unclassified tool, IPC handler, route, or token capability |
| Device onboarding | installer + `/setup` + Relay enrollment actions | Own one resumable state machine, bind the detected device to the signed-in user, require ADMIN-approved recipient-sealed grants, and keep first-device bootstrap ADMIN-only |
| Secret migration | Relay config + Windows secure-store adapter | Transactionally move legacy plaintext operator/device keys into protected per-user storage; verify before deleting the source and never recreate plaintext during repair/rollback |
| Device transfer (MKB-05) | Prisma + ticket route + Relay | Add a `ProfileTransfer` lock and recipient-encrypted export/import; the server stores no bundle |
| Web UI | current-PC setup controller + profile card | Show one plain setup state/action, keep support diagnostics expandable, and show actual provider/versions on operational surfaces without redesign |
| Fork UI | MultiZen renderer | Retain upstream layout and components; add only rebranding, managed badge, and minimal locked states |
| Release | authenticated download + R2 + Windows installer CI | Produce one Authenticode-signed per-user installer and a signed anti-downgrade compatibility manifest for Relay, Browser, contract, and pinned engine; add other OS/architecture entries at MKB-07 |

The pre-operational W02 owner decision supersedes the original dual-provider transition proposal.
No real device depended on the old internal names, so the active runtime fallback was removed in
W02. Rollback remains the frozen W01 source/artifact checkpoint and the independently installed
upstream application; do not reintroduce silent dual-name behavior.

## 12. Implementation roadmap

The estimates below express relative size rather than hard calendar commitments. With Windows as the
only committed platform and no redesign, a technical build ready for pilot is estimated at **four to
seven weeks**. The 11 August onboarding review made previously implicit work explicit: current-device
readiness, ADMIN-only bootstrap, expiring one-use grants, legacy secret migration, and transactional
component updates. The anti-open-ended guard is that MKB-02 must be reachable within two working
weeks; if it is not, stop and reassess rather than extending.

Two items inside that range carry most of the uncertainty and deserve to be tracked as their own
slices rather than as bullets inside a phase: moving off end-of-life Electron 33 on a fork with native
modules, and the signed Windows installer with controlled updates and rollback. W02 already met the
smaller version of the first problem when a native `better-sqlite3` rebuild failed under Node 24 and
had to fall back to a checksum-verified Node 22.

The estimate excludes developing an engine, which is out of scope, and excludes macOS, which is
MKB-07. Full rollout to real accounts also waits for one canary account to complete its **14-day cold
start**; that elapsed time is outside the coding estimate and cannot be shortened.

### MKB-00 — Source, license, and engine gate (verified 11 August 2026)

**Gate result:** Passed. The separate fork retains the upstream remote, source SHA, lockfile, NOTICE,
and license boundary. The unmodified and current packaged Windows builds passed the compatible
contract with disposable profiles. On 11 August, a dedicated working proxy produced the same
non-direct exit IP in an independent probe and inside a disposable profile; cleanup left zero test
profiles, processes, handoff files, or disposable roots. The engine is conditionally approved for
unmodified internal use through its official download path and remains excluded from redistribution.
Apple Silicon evidence belongs to MKB-07.

### MKB-01 — Windows compatibility and product identity (2–3 days remaining)

**Already done in MKB-W01 and MKB-W02:** product and application identifiers, icon, display name, the
fixed Windows data root, the owned MCP contract on a dedicated port, removal of the upstream
heartbeat, updater, and publish path, and the preserved compatible MCP tool set.

**Work remaining:**

- Implement the copy-only importer from MultiZen before changing any default.
- Retain MultiZen's layout, components, and interaction patterns; do not redesign.
- Capture visual baselines for primary screens so changes outside approved rebranding and managed
  states require explicit review.
- Add `get_runtime_info`, contract versioning, and stable error codes.
- Add a Windows x64 CI job running the W01/W02 guards, typecheck, and the packaged contract test on
  every change. Keep the job definition OS-parameterised so MKB-07 adds a matrix entry rather than a
  rewrite.

**Gate:** MKTTool opens a profile in MKT Browser on a clean Windows device without server changes, the
upstream interface has not been rewritten, and the guards run in CI instead of by hand.

### MKB-01E — Electron upgrade and renderer hardening (4–7 days, its own slice)

Upstream declares Electron 33, whose line reached end of support on 29 April 2025. This is separated
from MKB-01 because it is the one item in the compatibility phase that can fail for reasons unrelated
to the product: native module rebuilds, packaging differences, and Chromium changes that move the
measured fingerprint. W02 already met the small version of this when a native `better-sqlite3` rebuild
failed under Node 24.

**Work:**

- Move to an Electron line supported at release time and rebuild native modules, `better-sqlite3`
  first.
- Enforce renderer sandboxing, context isolation, CSP, and an IPC allowlist. The renderer must not
  read tokens or profile files directly.
- Add the default-deny exposure inventory and CI guard for MKT Browser MCP tools and preload/IPC
  handlers. A newly exposed operation without an explicit capability class fails the build.
- Measure the fingerprint on the same profile and seed before and after the upgrade.

**Gate:** The packaged application passes the full contract and lifecycle run on the new Electron
line, and the fingerprint delta is reviewed and accepted deliberately rather than discovered during a
pilot.

### MKB-W02 — Windows internal clean break (verified 10 August 2026)

**Work:**

- Replace retained internal MultiZen package, preload, MCP, and adapter names with MKT Browser-owned
  names across the desktop fork and MKTTool consumer in one coordinated slice.
- Assign a dedicated configurable loopback port so MultiZen and MKT Browser no longer contend for
  `7777`.
- Remove inert legacy settings and compatibility fallbacks; no automatic old-data migration is
  required before operational use.
- Preserve upstream history, MIT notices, engine license boundaries, and source attribution.

**Gate result:** Passed. The clean contract has no MultiZen fallback, both repositories pass their
focused and full relevant checks, and the packaged Windows application completed the disposable
initialize/tools-list/list/fingerprint/create/fail-closed proxy/update/launch/close/delete lifecycle
through the updated MKTTool consumer. The artifact remains technical-only; distribution gates are
recorded in the W02 evidence linked above.

### MKB-02 — MKTTool-managed mode (5–8 days)

**Work:**

- Add `externalRef` metadata, idempotent create, and post-timeout reconciliation.
- Add atomic launch and reject a running session with a different proxy.
- Propagate ticket `jti` as `operationId`, retain `requestId` for create idempotency, and return
  sanitized stage/error-code/version diagnostics across Web, Relay, and MKT Browser without a remote
  Relay callback or new server table.
- Lock proxy, fingerprint, and delete controls for managed profiles using upstream components and
  styles; do not redraw screens.
- Enforce capability separation in contract tests: the profile-management token cannot call page
  control, and any unclassified tool is denied by default.
- Extend the exposure inventory across the Relay HTTP endpoints and cross-repository contract. A new
  route or capability without an explicit guard remains inaccessible and fails CI.
- Let the Relay discover the MCP token automatically from the correct OS data area while retaining a
  development override.
- Return provider, app, engine, and capabilities in Relay health.
- Add cross-repository contract tests.

**Gate:** Retrying after a timeout does not create a second profile; every accepted attempt returns the
same `operationId` through each local layer with a structured failing stage; unclassified tools remain
inaccessible; and every error path fails closed.

### MKB-03 — Windows onboarding, installer, and controlled updates (10–15 days)

**Entry dependencies:** MKB-01E must be green before final packaging/signing so the team installer
does not freeze an end-of-life Electron line. MKB-02 owns MCP-token discovery, runtime/capability
health, atomic managed launch, and default-deny local operations; MKB-03 consumes those contracts
rather than building a second status or authorization path.

**MKB-03A — guided current-PC onboarding and secure enrollment:**

- Replace the separate Relay download/registration journey with one authenticated Windows download
  and one resumable setup controller. Keep existing self-enrollment and recipient sealing where safe,
  but do not preserve technical UI merely for compatibility.
- Show one primary state/action and derive it from the current local PC, authenticated owner, registry
  state, live Relay/MKT Browser/engine health, contract compatibility, and update state. Put the
  four-layer diagnostic view behind support/ADMIN details.
- Bind an OPERATOR only to their own detected device. Show PC name + email before confirmation; fail
  closed on previous-owner, revoked-key, wrong-user, or shared-PC conflicts and require an explicit
  ADMIN recovery path.
- Make `Waiting for administrator approval` resumable and non-error. Keep recipient ciphertext opaque
  and durable, but require a 30-second one-use delivery authorization minted only after a live
  owner/revocation/generation check. Public-key binding and recipient proof remain mandatory.
- Make grant completion crash-idempotent: atomically cache the completion proof with the persisted
  grant, return that proof on an exact retry without rewriting the key, and make the server consume it
  idempotently. Fault injection covers post-store, post-proof, pre-server-commit, reload, and reboot.
- Add the ADMIN-only, five-minute first-device bootstrap authorization. Plaintext key entry remains on
  a Relay-owned loopback surface and never appears to an ordinary operator or crosses Web.
- Audit every approval and classify every new setup server action and loopback route in the
  default-deny inventory. Authentication/authorization remains at each Web boundary; loopback routes
  enforce exact origin, method, bounded body, and signed/public-or-sealed input rather than treating
  CORS as authorization. No custom protocol, deep link, callback, or URL carries a secret.
- Move operator-domain and device private keys into protected per-user storage, transactionally
  migrate legacy plaintext config, and retain no plaintext fallback. Keep the MCP bearer protected
  and automatically discoverable by Relay.
- Verify the first loopback probe from a direct user click against the deployed HTTPS origin in real
  Chrome and Edge. Allow, deny, permission recovery, and retry must be distinguishable from
  “not installed” and require no reinstall.
- Replace active team-facing setup guidance only when this flow ships. The current ZIP, `.bat`,
  PowerShell, localhost, manual-key, and checksum instructions remain technical truth until then but
  must not survive as the normal team path afterward.

**MKB-03B — signed compatibility-set lifecycle:**

- Make CI produce exactly one Authenticode-signed per-user Windows installer containing compatible
  Relay and MKT Browser builds, plus a signed manifest and SBOM. Serve it from the authenticated
  MKTTool release route; the artifact is secretless and requires no separate file or UAC.
- Pin an offline manifest root and Authenticode publisher, keep signing credentials separate from R2,
  define root-signed delegated-key rotation/revocation, and persist the highest accepted set, secure-
  store rollback floor, and retained rollback sequence. Missing anti-downgrade state beside existing
  device/profile data is a repair condition, not a clean reinstall.
- Pin the approved external engine version, official URL, integrity value, and compatibility tuple;
  never resolve “latest” at installation time. Resume interrupted acquisition and retain one approved
  cached engine for offline start and rollback.
- Install, update, and roll back Relay, MKT Browser, contract, and engine as one compatibility set.
  Refuse before killing anything when a profile is open; fault injection after each step and reboot
  must converge to the complete new set or complete retained set, never a mixed tuple. The first
  secure-store migration establishes a bridge-Relay rollback floor; no plaintext-only Relay can run
  after source deletion.
- Reject altered, stale, replayed, wrong-publisher, incompatible, and downgrade manifests. A rollback
  is an explicit audited ADMIN/human action to the one retained approved set.
- Detect existing standalone Relay, technical MKT Browser, MultiZen, duplicate startup entries, and
  listeners on `47821`/`47822`. Do not kill an unknown process or silently select another port; show
  the exact blocked layer and a safe repair action. Leave MultiZen data untouched.
- Define repair and uninstall: repair is idempotent and preserves device/profile data; uninstall stops
  owned processes and removes owned binaries/autostart while preserving profiles and device
  credentials by default. Removing local data is a separate explicit confirmation.
- Keep path, autostart, and secure-store behavior behind thin adapters over a shared Relay core, and
  test the contract and cryptography against the core so MKB-07 adds an adapter rather than reopening
  Windows behavior.
- Test proxy, DNS, WebRTC, fingerprint, and Windows Firewall behavior with a dedicated profile; keep
  the workaround Windows-specific.

**Gate:** On a clean standard-user Windows account, one unfamiliar operator runs one authenticated,
signed installer and reaches `Waiting for administrator approval` or `Ready` with at most ten minutes
of user attention; automatic artifact-transfer and administrator wait time are measured separately.
The path requires no Node, MultiZen, UAC, SmartScreen bypass, terminal, archive extraction, developer
coaching, separate downloads, manual checksum, localhost navigation, or copied technical value. When
approval is available, the same enrollment becomes `Ready`, remains ready after both startup orders
and reboot, and passes owner/grant/secure-store/live-health checks. The legacy-install, permission,
port-conflict, repair, uninstall, update fault-injection, and rollback matrices are also green.

### MKB-04 — Technical pilot and one canary account (7 days + 14-day cold start)

**Work:**

- Test on two Windows operator devices representative of the team, using test profiles only.
- Have at least one operator who has never seen the setup complete it without developer coaching.
  Record time to `Waiting`/`Ready` and technical interventions; the passing intervention count is zero.
- Exercise real Chrome and Edge Local Network Access allow, deny, recover, and retry paths against
  the deployed HTTPS origin, plus administrator-offline approval after page close and reboot.
- Upgrade and roll back the app while retaining cookies, profile ID, and seed.
- Measure proxy exit IP, DNS, timezone, locale, WebRTC UDP, and fingerprint across repeated launches.
  Record the observed values as the baseline; drift thresholds are defined here, from real
  measurements, rather than guessed in advance.
- Only after seven technically clean days, create **one** low-value real account profile and begin
  cold start; do not expand to the fleet.
- Rehearse a lost-device incident: revoke, rotate required keys or credentials, and confirm that no
  remote-wipe claim is made.

**Technical gate:** Seven days without profile or proxy faults and an evidence-backed acceptance
checklist, including the unfamiliar-operator zero-intervention setup and real Chrome/Edge permission
recovery. The canary then completes the full 14-day cold start without an IP or profile incident
before wider real-account rollout.

### MKB-05 — Team migration and temporary-path retirement (after pilot)

- Stable builds may be preinstalled on remaining Reddit devices while the canary cold-starts, but do
  not create the full real-profile fleet.
- Make MKT Browser the default and import the real fleet only after the canary completes cold start.
- Implement and rehearse the transfer lock and recipient-encrypted export/import with a test profile.
- Train operators through the Web flow; do not train them to edit managed profiles in the desktop app.
- Retain the frozen W01 checkpoint and tested export/import procedure for one rollback window; do
  not restore the removed MultiZen adapter fallback.
- Retire old upstream operating guidance only after the stability window.

### MKB-06 — Custom UX/UI (deferred; outside v1)

- Begin only after real use yields an observed UX issue list, not based on preference.
- A custom design system, dashboard, and administration flow may be built without changing the MCP or
  profile contract.
- This phase must not leak into or block MKB-00 through MKB-05.

### MKB-07 — macOS Apple Silicon (after v1)

Everything the 10 August 2026 platform decision moved out of v1 lives here. Mac hardware is already
available, so this phase is gated on scheduling, ownership, and Apple enrollment rather than on
machines.

**Work:**

- Build the pinned source natively on Apple Silicon and run the full contract and lifecycle test.
- Approve the engine for macOS arm64: artifact, license, and a lawful download path per architecture.
- Native arm64 signed and notarized `.dmg`, the Relay as a LaunchAgent helper, secrets in Keychain,
  and no Terminal, Homebrew, or `xattr` requirement.
- Add the macOS entry to the CI matrix; native modules must match the architecture.
- Test WebRTC leak behavior independently on macOS rather than carrying the Windows Firewall
  workaround over and calling it done.
- Re-run the proxy, DNS, fingerprint, and cookie matrix on two Macs.

**Gate:** A clean Mac installs through one download without Terminal, Gatekeeper does not report an
unidentified application, and a test profile opens through the correct proxy natively without Rosetta.

**Prerequisites outside code:** Apple Developer enrollment and a Developer ID certificate. Do not buy
them during v1; buy them when this phase is scheduled.

## 13. Relationship to the current critical path

```mermaid
flowchart LR
  F["MKB-00/01/01E\nWindows baseline + Electron upgrade"] --> M["MKB-02/03\nManaged mode + Windows installer"]
  M --> P["MKB-04\nSeven-day Windows pilot"]
  P --> R0["One canary account\n14-day cold start"]
  R0 --> T["MKB-05\nTeam rollout"]
  T --> R1["M1\nImport real account fleet"]
  R1 --> C["14-day cold start"]
  C --> R2["M2\nFirst manually submitted Reddit post"]
  R2 --> R3["M3\nTwo weeks of steady operation"]
  R3 --> A["Phase 05\nSemi-automated Reddit posting"]
  T -.-> U["MKB-06\nRedesign after UX evidence"]
  T -.-> MAC["MKB-07\nmacOS Apple Silicon"]
```

MKB-00 and MKB-01 are time-boxed. If the fork cannot open a test profile within the defined gate,
stop and reassess rather than extending indefinitely. Never use a real account to debug builds or
rebranding.

Purchasing accounts and proxies and preparing content and subreddit research may run in parallel.
After MKB-04, log in only one canary account; the fleet waits for that account's cold start. The fork
is now part of the critical path and must be reported honestly rather than treated as free elapsed time.

## 14. Acceptance matrix

| Area | Required tests |
|---|---|
| Contract | initialize, tools/list, list/create/update/launch/close; restart app and reconnect |
| Surface authorization | Runtime MCP/IPC/Relay inventory exactly matches the checked-in capability registry; new or unknown operations are denied until explicitly classified; hostile/missing Origin, wrong method, oversized body, forged deep link, and unauthenticated setup action cannot mutate state |
| UX/UI | Desktop navigation/layout/components match the MultiZen baseline; the required setup controller uses plain states and one next action without becoming a broader redesign |
| Idempotency | Disconnect after desktop create completes; retry returns the same profile ID |
| Diagnostics | Ticket `jti` remains the same `operationId` across Web, Relay, and MKT Browser for one attempt; responses expose only stage, code, duration, and versions; logs pass negative secret tests |
| Proxy | Bad token, dead proxy, wrong protocol, and proxy change while running never cause a misconfigured launch |
| Fingerprint | Seed, canvas, WebGL, UA, timezone, and locale remain stable across restart and an approved update |
| Platform | App and engine run natively on Windows x64; macOS arm64 is verified in MKB-07, not in v1 |
| Network | Correct exit IP, remote DNS, no unexpected ICE `srflx`; leak mitigation verified on Windows, and independently again in MKB-07 |
| Data | Cookies, localStorage, IndexedDB, extensions, and profile ID survive restart, update, and rollback |
| Isolation | Two profiles share no cookies, user-data-dir, proxy bridge, or seed |
| Security | MCP and Relay remain loopback-only; renderer, installer, Web, server, URLs, command lines, logs, and crash reports never receive an operator key; Windows secrets are protected to the current OS user without claiming per-process isolation |
| Current-device identity | Clean second PC, wrong Google user, prior owner, shared Windows account, reinstall, revoked key, and one user with two PCs; only the reconciled local owner/device may proceed and no other team device can make this PC appear ready |
| Grant protocol | ADMIN approval from a ready Relay; exact retry after store/proof/server-commit loss returns the cached proof idempotently, while conflicting replay, wrong recipient, expired authorization, superseded generation, failed store write, forged completion, and direct browser action fail before `Ready`; capture → revoke → deliver is tested inside the declared residual window and after expiry |
| Local permission | Deployed HTTPS origin in current Chrome and Edge: first-click Allow, Deny, recover permission, retry, and timeout; denial is never mislabeled as missing software |
| Installation | Clean standard-user Windows account, one authenticated signed installer, no UAC/SmartScreen bypass/Node/MultiZen/archive/terminal/manual hash/separate download/localhost navigation or technical-value copying; unfamiliar operator reaches `Waiting` or `Ready` with zero coaching |
| Existing installation | Standalone Relay, technical MKT Browser, MultiZen, and all together; exactly one owned process/startup entry per component, compatible config, no silent port fallback, and untouched MultiZen data |
| Secret migration | Real legacy plaintext config; fault injection around bridge install, import, verification, plaintext deletion, rollback-floor commit, repair/rollback, reboot, and a second Windows user; no plaintext-only binary runs and no plaintext remains after the deletion boundary |
| Release lifecycle | Pinned offline root/publisher, separate R2/signing credentials, delegated-key rotation/revocation, altered/stale/old-valid manifest, R2 compromise, incompatible tuple, partial install, state-cache deletion, clean reinstall, reboot at every activation step, and one-use explicit rollback; only a complete permitted new or retained set may run |
| Repair/uninstall | Repair is idempotent and preserves binding/profile data; default uninstall removes owned process/binary/autostart and frees ports while preserving local data; destructive removal is a separate confirmed choice |
| Recovery | Admin offline then later approval, both process startup orders, failed update/migration, interrupted engine download, occupied ports, lost device, and duplicate import |

Do not claim “antidetect passed” because one scanner reports a high score. Acceptance depends on
**consistency and stability for the same identity over time**, together with the guarantee that a
profile never opens with the wrong proxy.

## 15. Risks and controls

| Risk | Control |
|---|---|
| Fork diverges too far from upstream | Keep changes in separate modules, schedule security intakes, and run contract tests before every merge |
| App and engine licenses are treated as one | Maintain two separate gates and license inventories; never bundle the engine by habit |
| Renaming makes profiles appear to disappear | Copy-only import, stable IDs, migration manifests, and preserved source directory until acceptance |
| Automatic engine update changes fingerprint | Pin versions, use staged pilots, and prohibit daily auto-update |
| Electron UI compromise exposes files | Context isolation, sandbox and IPC allowlist, and no arbitrary renderer filesystem access |
| A new MCP tool, IPC handler, or Relay route bypasses the intended guard | Default-deny capability registry plus a runtime exposure inventory test; unclassified operations fail CI and remain inaccessible |
| Correlation logs become a second secret store | Metadata allowlist plus negative tests for tickets, proxy data, credentials, content, cookies, and browser storage |
| Deferring macOS bakes Windows assumptions into the core | Path, autostart, and secure storage stay behind thin adapters; contract and cryptography tests run against the shared core so MKB-07 adds a platform instead of reopening one |
| macOS later “works” but is not native or stable | MKB-07 keeps arm64 native as a hard gate and tests native modules and engine; Rosetta is not acceptance |
| Gatekeeper or helper forces operators into Terminal | Developer ID, notarization, and LaunchAgent tests on a clean Mac, at MKB-07 |
| Redesign increases upstream drift | Retain MultiZen UX/UI in v1 and move redesign to MKB-06 |
| Web times out after profile creation | Unique external reference, request ID, and reconciliation |
| Open profile retains old proxy | Atomic launch rejects or requires close and restart; never no-op |
| “One installer” still leaves a multi-tab, copy/paste setup | One setup controller and a zero-technical-intervention usability gate; separate archives, localhost pages, and technical fields are not team-ready |
| Convenience onboarding collapses key boundaries | Two processes; a secretless installer; ADMIN-approved recipient-sealed delivery; ADMIN-only local first-device bootstrap; Web/server/Browser never receive plaintext operator key |
| A browser action falsely reports `Ready` or clears a pending grant | Current live health plus owner/device reconciliation and recipient-bound persistence proof; browser self-attestation is advisory only |
| A stale grant restores an old operator key | Expiring one-use signed envelopes, recipient and generation binding, local replay state, server-side invalidation on rotation/revocation, and key/credential rotation for anything a lost device already obtained |
| Relay stores a grant but the completion response is lost | Atomically cache the completion proof with the grant and make exact Relay retry plus server completion idempotent; conflicting replay remains rejected |
| Legacy plaintext survives a “secure store” migration | Transactional import/verify/delete with crash, repair, rollback, backup, temp-file, and second-user tests; no plaintext fallback |
| Secure-store migration makes the retained rollback unreadable | Activate a secure-store-capable bridge first, commit a rollback floor at plaintext deletion, and forbid every older Relay afterward |
| Partial update creates a mixed Relay/Browser/engine set | Signed compatibility tuple, stage-before-activate, fault injection after every step, and complete-set rollback |
| R2 or an old valid manifest silently downgrades the device | Offline pinned release root and publisher, delegated-key rotation/revocation, durable highest-sequence state, damaged-state repair, and one-use local rollback authorization |
| Local Network Access denial or a port collision looks like a broken install | Direct-click probes in Chrome/Edge, named permission recovery, listener ownership checks, no silent port fallback, and one safe retry/repair action |
| Waiting for ADMIN looks like failure | Named non-error state, durable enrollment, actionable ADMIN queue, automatic resume, and no manual-key escape hatch for operators |
| Lost device retains cookies | State the real limit: revoke and rotate; never promise remote wipe |
| Fork delays business operations | Target a test profile within two weeks and use explicit stop gates |

## 16. Definition of Done for MKT Browser v1

V1 is complete only when all conditions hold:

1. The fork builds natively from documented instructions on a clean Windows x64 device.
2. License, NOTICE, SBOM, and engine acquisition have been approved.
3. CI produces one Authenticode-signed, secretless, per-user Windows installer and signed
   anti-downgrade compatibility manifest rooted in a pinned offline key/publisher with durable
   sequence state; updater and engine acquisition no longer target unapproved or unpinned releases.
4. The Relay discovers MKT Browser automatically; operators never copy an MCP token.
5. An unfamiliar normal operator reaches `Waiting for administrator approval` or `Ready` through one
   resumable setup controller with zero technical intervention; approval, reload, and reboot do not
   duplicate the device or require a secret paste.
6. First-device bootstrap is an ADMIN-only local ceremony. Later grants are ADMIN-approved,
   recipient-bound, generation-aware, delivered only with 30-second one-use authorization, and
   acknowledged idempotently by the live recipient Relay after secure persistence; Web, server,
   installer, and MKT Browser never hold the plaintext key.
7. Legacy operator/device secrets migrate transactionally to protected per-user storage, and tests
   establish a secure-store-capable rollback floor and find no plaintext fallback in active, backup,
   snapshot, temp, repair, rollback, or log paths.
8. Idempotent profile creation and atomic profile launch have tests.
9. Every accepted local operation preserves its `operationId`, returns a structured stage and error
   code, and passes negative secret-log tests.
10. Runtime MCP/IPC/Relay exposure matches a default-deny capability inventory; adding an
   unclassified operation fails CI.
11. MKTTool displays one plain current-PC state/action and makes actual provider, app, engine, and
    contract versions available as actionable support detail.
12. Import, repair, coordinated-set update, and rollback retain IDs and sessions, never delete source
    automatically, and the tested device-transfer flow never allows two active copies.
13. The proxy, DNS, WebRTC, fingerprint, cookie, Local Network Access, existing-install, port,
    startup-order, and update fault-injection matrices are green on at least two Windows devices.
14. A test profile runs for seven days and one real account completes a 14-day cold start without a
   technical incident.
15. Team-facing UI and documentation no longer require separate Relay/MKT Browser downloads,
    localhost navigation, archive extraction, command line, manual checksums, tokens, keys, IDs,
    ports, paths, or manual MultiZen administration.
16. MultiZen UX/UI remains intact in v1; every redesign belongs to MKB-06 and does not block release.
17. macOS is absent from v1 by decision, and the shared Relay core carries no Windows-only assumption
    that MKB-07 would have to undo.

## 17. Decisions required outside code

| Decision | Proposed default | Deadline |
|---|---|---|
| Product name | `MKT Browser` | Before MKB-01 |
| Operational engine | External binary downloaded from its official source after license approval | Before MKB-00 closes |
| macOS scope | Deferred to MKB-07; Apple Silicon only, Intel only if inventory requires it | Decided 10 August 2026 |
| Apple Developer | Account, Developer ID certificate, and notarization access | Before MKB-07; do not buy during v1 |
| Windows code-signing certificate | Buy a code-signing certificate for the organization or individual internal publisher | Before MKB-03 |
| Release channel | R2 plus authenticated MKTTool download page; artifacts exclude restricted engines | Before MKB-03 |
| Pilot devices | Two representative Windows devices | Before MKB-04 |
| UX/UI | Retain MultiZen in v1; redesign only in MKB-06 | Approved 10 August 2026 |
| Windows onboarding | One signed download → normal sign-in → confirm detected PC → `Waiting` or `Ready`; first-device secret bootstrap is ADMIN-only and local | Approved 11 August 2026 |

No decision in this table permits weakening the security invariants or adding automation excluded by
the product scope.

## 18. 9Router pattern review (11 August 2026)

The review compared the full MKT Browser plan and current MKTTool trust boundaries with 9Router. It
does not create another phase or dependency. Useful patterns are absorbed into the existing
MKB-01E/MKB-02/MKB-03 slices; incompatible patterns are recorded here so the shared word “Relay” does
not blur two different architectures.

| Pattern | Decision | Reason and placement |
|---|---|---|
| Capability discovery and layered health | Keep the existing plan | `get_runtime_info` and the four-layer status page already cover the useful behavior in MKB-01/MKB-03 |
| Correlated request diagnostics | Adopt, local and metadata-only | `operationId`, `requestId`, stage, code, duration, and versions join MKB-02; no server receipt or new table in v1 |
| Default-deny exposed-surface inventory | Adopt | MKB-01E inventories the desktop MCP/IPC surface; MKB-02 extends the guard across Relay routes and proves token capability separation. This directly controls the class of allowlist omission documented in the [9Router security advisory](https://github.com/decolua/9router/security/advisories/GHSA-fhh6-4qxv-rpqj) |
| Signed release manifest, staged update, rollback | Keep the existing plan | Already a core MKB-03 requirement; no second updater or release channel |
| Edge HTTP relay, public tunnel, or target forwarding | Reject | MKTTool Relay is a local ticket verifier and secret boundary, not a hosted forwarder. Public reachability would widen the most sensitive surface |
| Proxy pools, round-robin, and fallback identities | Reject | The invariant is one account → one static proxy → one profile → one device. Failure stops the same identity; it never selects another route or account |
| Bulk proxy management | No MKT Browser scope | MKTTool Web already checks one or all proxies and shows bindings/liveness. Import remains an ADMIN workflow, not desktop routing logic |
| Persistent outcome receipts, offline device inventory, circuit-breaker dashboard | Defer to MKB-04 evidence | Relay is intentionally outbound-offline, current volume is small and manual, and the plan already rejects a speculative device table. Reconsider only if pilot incidents cannot be diagnosed from correlated local results |
| Full request/response logging or cloud profile sync | Reject | Both would duplicate sensitive ticket, proxy, content, cookie, or profile data outside its current trust boundary |

Research inputs: [9Router repository](https://github.com/decolua/9router),
[architecture](https://github.com/decolua/9router/blob/master/docs/ARCHITECTURE.md), and
[proxy-pool implementation](https://github.com/decolua/9router/tree/master/src/app/api/proxy-pools).
