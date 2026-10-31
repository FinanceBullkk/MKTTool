# Domain glossary

**Updated:** 31 October 2026

The fixed vocabulary of the identity vault. Each entry: **term → definition → why it matters →
where it lives in code.** User-facing terms are fixed in the [UI glossary](ui-glossary.md); product
boundaries are in [project-overview-pdr.md](project-overview-pdr.md).

> The 31 October 2026 surgery removed the posting surface (content library, queue, rules engine,
> shadowban observer, Facebook Pages publisher). Terms that belonged to those domains were removed
> from this glossary; the historical definitions survive in
> [docs/archive/](archive/README.md) and in git history.

---

## Identity

| Term | Definition | Why it matters | Where it lives |
|---|---|---|---|
| **Nick (UI) / Account (model)** | A Reddit, Facebook, or TikTok identity record in the shared vault. A nick lives on its social platform; it is not local browser data. Browser-backed nicks bind 1:1 to a static proxy, browser profile, and Relay PC; accounts used only for browserless workflows may omit those fields. | Keeps the vault record distinct from the local browser profile, and keeps a platform from inheriting the wrong configuration. | `prisma/schema.prisma` → model `Account`; route `/accounts`; `account-readiness.ts` |
| **Writing voice + content focus** | Two human-authored notes on the nick: how it should write, what it normally writes about. | A prompt for the operator who will eventually sit down and use the nick, not an input any automated system reads. Missing voice is reported as a readiness blocker (`NO_VOICE`). | `Account.voice`, `Account.contentAngle` |
| **Fingerprint** | The fields the profile provider reports for a browser configuration (device family, locale, timezone, screen, and runtime surfaces the provider manages). | Used to align the profile with its proxy and to notice misconfiguration. Never evidence that two profiles present different full-surface tuples, and never identity isolation. | Managed by the antidetect browser; MKTTool stores only `antidetectProfileId` |
| **Antidetect browser** | A legacy integration/category name retained in code and historical records. Current MKT Browser product copy says *browser profile manager with proxy binding*. | Provider configuration and separate profile storage do not prove identity isolation. The term does not authorize an engine change. | `src/lib/antidetect/` |
| **MKT Browser** | The MultiZen-derived browser profile manager with proxy binding. Stores browser data locally and provides human-controlled lifecycle operations through Relay; the local MCP contract defaults to port `47822`. | Antidetect/identity-engine research and Lane C are **CLOSED**; `G2-IDENTITY=FAIL` remains recorded. | [Product direction](project-overview-pdr.md#what-mkttool-is-now); `src/lib/antidetect/` |
| **Browser engine** | The Chromium-derived binary (CloakBrowser) that actually runs sites, separate from the MKT Browser application layer. | MIT application source does not grant engine redistribution rights; app and engine require separate version and licence approval. | MKT Browser `ChromiumBootstrap`; MKB-00 evidence |
| **Browser profile (UI)** | Browser workspace and state stored locally on one PC, linked 1:1 to a nick through `antidetectProfileId @unique`. Not a vault record. | The database prevents two nicks from sharing one recorded profile ID, but the binding is not proof of identity isolation. | `schema.prisma` → `Account.antidetectProfileId`; MKT Browser local storage |
| **Relay PC (UI) / RelayDevice (model)** | The registered operator PC that receives and consumes encrypted tickets for a nick. | A browser profile ID is meaningful only on the Relay PC that owns the local data. The term names the PC, not the Relay software running on it. | `schema.prisma` → model `RelayDevice`; route `/relay-devices` |
| **Original email** | The email that came with the nick, for account recovery. For Reddit nicks this is the Google account that actually opens the nick. Encrypted at rest (operator zone). | Losing it means losing the recovery path. | `Account.emailAddress`, `Account.emailPasswordEnc` |
| **TOTP secret** | The base32 seed that generates 2FA codes. For Reddit nicks this is the Google account's 2FA, not Reddit's. Encrypted at rest (operator zone). | Without it, a 2FA-enabled nick cannot be signed back in. | `Account.totpSecretEnc`; `src/lib/totp/` |

## Network

| Term | Definition | Why it matters | Where it lives |
|---|---|---|---|
| **Static proxy (static ISP)** | A fixed residential-ISP IP, rented per IP rather than per gigabyte. The required type for browser-backed nicks. | A stable route is what the 1-nick-1-IP invariant is defined against. It does not make an account look human and is not identity isolation. | `schema.prisma` → `Proxy` (`type STATIC_ISP`) |
| **Rotating residential proxy** | Residential IPs that change constantly, billed per GB. | The type that was rejected: a changing exit IP breaks 1 nick : 1 IP by construction. | Historical; see `docs/archive/` |
| **Datacenter proxy** | Cheap, easily flagged as server-origin IP. | Fine for technical checks (does the profile actually route through the proxy); fatal for real accounts. | Warning in [project-overview-pdr.md](project-overview-pdr.md) |
| **Protocol (http / socks5)** | The network protocol a proxy speaks. Providers often serve the two on different ports. | Filling in the wrong port/protocol combination means the profile does not connect — or worse, silently runs on the home IP. Both protocols keep DNS resolution remote via MKT Browser's internal SOCKS5 bridge. | `Proxy.protocol`; provider desktop profile fields |
| **/24 range** | 256 adjacent IPs sharing the first 24 bits. | Two nicks on the same /24 can still be correlated — buy from different ranges. | Operational practice; nothing enforces it |
| **ASN** | Autonomous System Number — the network provider's identity. | Platforms use ASN to distinguish residential from datacenter traffic. | Not checked automatically |

## Nick lifecycle

| Term | Definition | Why it matters | Where it lives |
|---|---|---|---|
| **Cold-start** | The initial read-only window after a nick is acquired: no posting or account action. | A new nick that acts loudly immediately gets scrutiny. It is a real-world clock; software cannot shorten it. | `Account.coldStartUntil` |
| **Nick status** | `COLD_START` → `ALIVE` → `CHECKPOINT` / `SHADOWBANNED` / `DEAD`. | Readiness treats any status other than `ALIVE` as a blocker. | `Account.status`; `src/lib/accounts/account-status.ts` |
| **Checkpoint** | The platform suspects the nick and demands verification (captcha, phone…). | A checkpoint means the account is *already* under suspicion. Handled by a human in the correct profile; never automated. | `Account.status = "CHECKPOINT"` |
| **Shadowban** | Content visible to the nick's owner but hidden from everyone else (account-wide or per-item). | The account state still exists as a status value; the automated observer that detected it was removed on 31 October 2026, so today the value changes only when a human sets it. | `Account.status = "SHADOWBANNED"` |
| **Karma / account age** | Platform reputation score and creation date, recorded as account metadata. | Retained vault fields; with the rules engine removed, nothing computes against them automatically — they inform human judgement. | `Account.karma`, `Account.platformCreatedAt` |
| **First sign-in** | The operator-confirmed first successful sign-in inside the nick's browser profile. | Profile creation produces a *blank* browser — proxy and settings, zero cookies. A nick with a green configuration and no confirmed login is not technically ready, and pretending otherwise is exactly the failure the field exists to prevent. | `Account.firstLoginAt`; blocker `NOT_LOGGED_IN` |

## Security and shared use

The question this whole group answers: **if the server is stolen, what is obtained?** The required
answer is *no nick password at all*.

| Term | Definition | Why it matters | Where it lives |
|---|---|---|---|
| **Two vault key zones** | Credentials are encrypted with two separate keys: `VAULT_KEY_SERVER` (proxy passwords, API tokens the server needs) and `VAULT_KEY_OPERATOR` (nick passwords, emails, TOTP seeds). | The goal state is that the operator key is not on the server at all: stealing the whole server must not open a single nick password. Each column's zone is declared in `schema.prisma` (`vault:server` / `vault:operator`) and checked by a test that reads the schema. | `src/lib/crypto/encrypted-field-registry.ts`; `npm run vault:rekey -- --domain=…` |
| **Relay software** | The background program running on a Relay PC at `127.0.0.1:47821`. It holds `VAULT_KEY_OPERATOR` and is the only component that can open nick secrets. Do not use `Relay` as another name for the PC. | This is what makes the two key zones real: the server checks session, ownership, and writes the audit trail; Relay opens ciphertext, shows passwords, applies the proxy, and opens the browser profile. | `relay/src/`; `src/lib/relay/`; `RELAY_PORT` |
| **Ticket** | An encrypted payload sealed for exactly one PC, alive ~30 seconds, consumable exactly once. The browser only carries it; opening devtools at the moment of a click shows the ticket and nothing else. | The only thing the server ever hands out. Four kinds: reveal credential, reveal OTP, open profile, create profile. | `src/lib/tickets/`; `TICKET_LIFETIME_MS`, `TICKET_KINDS` |
| **Sealed box** | The ticket interior encrypted to the receiving PC: one keypair per ticket → X25519 → HKDF → AES-256-GCM. | The server holds a box it cannot open. The same mechanism moves `VAULT_KEY_OPERATOR` to a new PC without anyone copying a hex string. | `ticket-sealed-box.ts` |
| **Ticket-signing key (Ed25519)** | The server's keypair; the signature covers the sealed payload. The public key is derived from the seed — a mismatched pair cannot be configured. | The signature is the assertion "the server issued this after checking session and ownership". Relay verifies it **before** decoding anything. | `TICKET_SIGNING_KEY`; `keys:server-keygen`, `keys:server-pubkey` |
| **Replay guard** | The persistent journal of spent tickets, kept in the **Relay**, not the server; validated before the operation, fail-closed on invalid state. | A spent ticket does not come back to life because a process restarted or was force-killed. Relay does not need a second server round-trip. | `relay/src/spent-ticket-journal.ts`; `ticket-replay-guard.ts` |
| **Ticket version floor** | Every ticket kind carries a minimum Relay version, checked right after the signature. The general security floor is 13; profile create/launch require a newer floor. | An old Relay must be able to say "I am too old for this", not die ambiguously in decryption. The fix is reinstalling the current package from `/setup`. | `MIN_RELAY_VERSION`, `MIN_RELAY_VERSION_BY_KIND` |
| **Device registry** | The list of Relay PCs, each with an X25519 public key, visible to the whole team. Operators register the PC they are sitting at; ADMIN approves, grants operator keys, and revokes. | A PC that is not registered receives no tickets at all. A public key is not a secret; hiding it would leave nobody able to answer "is my PC registered?". | `schema.prisma` → `RelayDevice`; `/relay-devices`, `/setup` |
| **Revocation** | Marking a PC as lost or untrusted. One-way. | Blocks new tickets immediately, but does **not** reach data already on that PC's disk. If exposure is plausible, rotate `VAULT_KEY_OPERATOR` and re-grant keys to the trusted PCs. | `RelayDevice.revokedAt` |
| **Operator key grant** | ADMIN one-click approval: the Relay on the ADMIN's machine wraps `VAULT_KEY_OPERATOR` to the receiving PC's public key; the server stores the sealed box until that PC opens the web app. | No code to read out, no hex to copy. The registry says "not granted", not "no key" — a PC that pasted its key manually is invisible to the server until it self-reports. | `RelayDevice.operatorKeyGrant`, `operatorKeyReadyAt` |
| **Nick pinning** | Every nick belongs to exactly one Relay PC. `Account.deviceId` decides where tickets fly — not the machine of whoever pressed the button. | Profile data is local to that machine, so operations must return to it. This is a storage/routing boundary, not identity-isolation evidence. ADMIN has no exception at the launch button: the ticket is sealed to the other machine's key, so the admin recovery path is reassignment — a named, audited action. | `Account.deviceId`; `ticket-recipient-lookup.ts` |
| **ADMIN / OPERATOR** | The two roles. ADMIN: cluster assignment, PC registration/revocation, operator-key grants, and the proxy vault. OPERATOR: everything except those four powers, plus only the secrets of nicks they are responsible for. | Visibility is deliberately **not** split: everyone sees every nick and its state, because ownership and readiness are public facts in a small team. What is split is write authority and nick secrets, enforced at the ticket-issuance layer. | `ALLOWED_EMAILS`, `ADMIN_EMAILS`; `src/lib/auth/require-actor.ts` |
| **Readiness** | The verdict on whether a nick's **technical setup** is complete for its next controlled action. Browser-backed nicks require proxy, profile, device, owner, and first sign-in; accounts used without a browser use the lighter path. | Separates a legitimate wait from missing configuration. A cold-start countdown is not a forgotten proxy, and neither is approval of anything. | `src/lib/accounts/account-readiness.ts` → `ReadinessBlockerCode` |
