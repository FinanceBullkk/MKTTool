# MKTTool product requirements

**Updated:** 31 October 2026 | **Delivery status:** [development-roadmap.md](development-roadmap.md)

## What MKTTool is now

MKTTool is an internal identity vault and posting-safety console for a small, known team (five to
six people). It manages the team's social-account records (**nicks**) with their encrypted
credentials, the **static proxies** each nick is bound to, and the **Relay PCs** that own each
nick's local MKT Browser profile. Opening a profile issues a short-lived Ed25519-signed ticket
through the local Relay on the operator's own PC, which applies the nick's proxy and launches the
profile on the CloakBrowser engine.

The product makes three promises and refuses to pretend to make a fourth:

1. Ownership is explicit: every browser-backed nick has one responsible person and one Relay PC.
2. Secrets are protected: operator-zone secrets decrypt only on the operator's own PC.
3. Technical readiness is truthful: a nick that has not had its first human login reports exactly
   that, and a proxy that was never checked is never shown as healthy.

It does **not** promise identity isolation. `G2-IDENTITY=FAIL` remains the recorded result of the
licensed-engine collision measurements. Proxy binding, profile pinning, and one-record-per-nick
constraints are operational controls; they are not evidence that two accounts cannot be linked.

## The 31 October 2026 surgery

The repository was cut back to the surfaces the team actually runs. Three cuts, all visible in git
history (parent of the surgery commit on branch `surgery/261031`):

- **The posting surface was removed, not parked.** Content library, posting queue, the ten-rule
  safety engine, the shadowban/health observer with its observer proxies, posting targets, and the
  Facebook Pages publisher (Graph API client and OAuth flow) are deleted from the code. This is a
  code-removal decision, not a rollout-scope decision like the 2 September 2026 withdrawal, which
  kept the code and hid the routes. Re-entering any platform means rebuilding from git history
  under an explicit owner decision — there is no hidden switch.
- **Release ceremony machinery was removed.** The offline release-signing key ceremony, signed
  compatibility sequences, sequence pinning, and anti-downgrade/rollback tooling are gone.
- **The Relay self-update platform was removed.** Relay updates by reinstalling the current
  package from `/setup`.

What remains in scope: the nick vault, the proxy vault, the Relay PC registry, ticket-based launch
and secret reveal, Relay enrollment and revocation, setup/onboarding, backups, and the
authenticated R2 distribution of the Relay package.

## Prior direction still in force - 8 September 2026

The owner accepted MKT Browser as a **browser profile manager with proxy binding**: local browser
data, an assigned proxy, an explicit owner/PC, and human-controlled create/open/close operations.
Antidetect/identity-engine research, custom Chromium fingerprint work, and further Brave/Cloak
identity experiments are closed. Lane C remains **CLOSED** — there is no CloakBrowser channel, and
no vendor contact or new engine integration is scheduled. Accepting that direction does not relabel
`G2-IDENTITY=FAIL` as a pass.

The 2 September 2026 decision withdrew Reddit and Facebook from the team rollout scope. After the
31 October surgery that boundary is enforced by absence: the posting code no longer exists.

## Who uses it

| Role | People | What they do |
|---|---|---|
| Operators | 4-5 | Run the vault day to day: record nicks, attach proxies, create and open profiles, keep ownership current |
| Administrator | 1 | Everything operators do, plus: assign nick owner and Relay PC, register/revoke Relay PCs, grant operator keys, own the proxy vault |

Sign-in is Google OAuth behind an explicit email allowlist. There is no self-registration: Google
proves that a person owns an email address; it does not prove that the person belongs to the team.

## Scope boundaries

| Not in scope | Why |
|---|---|
| **Any automated posting** (Reddit, Facebook, TikTok, or otherwise) | Removed on 31 October 2026. The tool records ownership and readiness; it does not post. If posting is ever rebuilt, the boundaries below apply |
| **Auto-DM, bulk messaging, reply hijacking, automated CAPTCHA solving, unsupervised 24/7 bot behavior** | Spam by every definition, and the fastest route to permanent bans. This boundary outlives any feature set |
| **AI-generated bulk content** | The team writes its own content. Bulk AI content is exactly what platforms hunt |
| **Reusing one proxy across nicks** | The 1:1 invariant is enforced by the database, not by discipline |
| **Cheap datacenter proxies for real accounts** | Fine for technical checks; fatal for real identities |
| **Identity-isolation claims or antidetect engineering** | Research closed 8 September 2026; `G2-IDENTITY=FAIL` stands |
| **macOS Relay or Browser builds** | Windows x64 only for v1; macOS stays deferred (MKB-07) |

## Core decisions that still stand

1. **Web-first, shared.** Postgres + Prisma, Google sign-in with an allowlist, two roles. A
   single-machine SQLite tool could not serve five or six people in five or six places.
2. **Operator secrets never live on the server.** Two vault key zones (`VAULT_KEY_SERVER`,
   `VAULT_KEY_OPERATOR`); the operator zone decrypts only inside the local Relay. Stealing the
   whole server must not open a single nick password.
3. **The server issues tickets, not capabilities.** An Ed25519-signed, recipient-sealed, ~30-second,
   single-use payload is the only thing the server hands out. The browser is a courier that cannot
   read it.
4. **Profiles are driven through the local Relay, not from the server.** The path is
   Web → Relay → authenticated MCP → MKT Browser on loopback `47822`. Relay listens only on
   `127.0.0.1:47821`.
5. **Business constraints are enforced at the database layer** (`@unique` bindings), not in the UI.
   The UI explains errors; it does not relax them.
6. **Windows x64 only for the Relay and MKT Browser v1.** Unsigned internal installer; the audience
   is five or six known operators on machines the project administers.
7. **English for every project artifact** (decided 10 August 2026). Direct conversation with the
   owner may stay Vietnamese; existing Vietnamese artifacts are legacy.
8. **TikTok is an identity scope, not a posting scope** (decided 19 August 2026). TikTok accounts
   are valid vault records with the same proxy/profile/PC/owner boundaries; no content, scheduling,
   or publishing behavior exists for them.

## Invariants

> **Every browser-backed nick has exactly 1 static proxy, 1 managed browser profile, 1 Relay PC,
> and 1 responsible operator.** This is an ownership and data-binding invariant enforced by the
> database (`Account.proxyId` and `Account.antidetectProfileId` are `@unique`; the device binding
> is checked at assignment and again before ticket issuance). It is not a uniqueness guarantee for
> the fingerprint and not identity-isolation evidence.

Facebook accounts used only to administer Pages may leave the proxy and profile fields empty —
there is no browser in that workflow. The database still prevents two accounts from sharing a real
proxy; it simply does not require one where no browser exists.

## What "done" means for the current scope

| Criterion | Measured by |
|---|---|
| Vault records are complete and truthful | Every active nick has owner, proxy, profile, and PC assigned or an explicit reason why not |
| Relay handoff works for a new operator | Install from `/setup`, register, get approval, receive operator key, complete a real launch — without copying keys or editing JSON |
| Secrets stay in their zones | Server cannot decrypt operator-zone columns; audits record every reveal and launch |
| Recovery works | Revocation blocks new tickets; operator-key rotation completes; backups restore into a disposable database |

Posting volume, account survival, and fingerprint uniqueness are not current delivery targets and
must not be presented as such.

## Open questions

- Real operator onboarding for the 5-6 person team has not been run against the post-surgery
  product; the setup journey needs one end-to-end pass with a person who did not build it.
- The Railway service is currently 404 and needs to be restored and re-verified against the exact
  deployed SHA (see the [roadmap](development-roadmap.md)).
- Relay updates are reinstall-only after the self-update platform removal; whether that is
  acceptable operational friction for every operator PC is untested in practice.
