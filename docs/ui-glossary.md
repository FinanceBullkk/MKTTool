# UI glossary

**Updated:** 31 October 2026

This glossary fixes the user-facing vocabulary for the identity workspace. It changes display
copy only: Prisma models, database columns, TypeScript domain names, and routes keep their current
names.

> Labels belonging to the surface removed on 31 October 2026 (posting queue, rules, health checks,
> content library, Facebook Pages) were dropped from this glossary. The historical tables, including
> the Vietnamese-to-English migration ledger for those surfaces, are preserved in git history and in
> the archived documents.

## Canonical terms

| UI term | Meaning | Code boundary |
|---|---|---|
| **nick** | A Reddit, Facebook, or TikTok identity record stored in the shared vault. A nick lives on its social platform; it is not local browser data. | Prisma model `Account`; route `/accounts` |
| **browser profile** (*profile trình duyệt*) | Browser data stored locally on one PC, including the browser workspace and its local state. It is not a vault record and is not proof of identity isolation. | `Account.antidetectProfileId`; MKT Browser local storage |
| **MKT Browser** | The browser profile manager with proxy binding for MKTTool. It provides local profile storage and human-controlled lifecycle operations through Relay. It makes no antidetect, unique-fingerprint, or account-safety promise. | Existing MKT Browser product name, local MCP contract, and `src/lib/antidetect/` identifiers |
| **Relay PC** (*máy Relay*) | The registered operator PC that receives and consumes encrypted tickets for a nick. | Prisma model `RelayDevice`; route `/relay-devices` |
| **nick owner** (*người phụ trách*) | The teammate assigned to a nick. This person is the only non-administrator who can request the nick password or OTP. | `Account.ownerId` |
| **nick assignment** (*phân công cụm*) | The paired owner and Relay PC assignment for one nick. The Relay PC must belong to the nick owner. | `Account.ownerId` plus `Account.deviceId` |
| **writing voice** (*giọng viết*) | A human-authored note describing how the nick should write. It guides the operator; it is not an automated input. | `Account.voice` |
| **content focus** (*mảng nội dung*) | A human-authored note describing the subjects the nick normally covers. | `Account.contentAngle` |
| **first sign-in** (*đăng nhập lần đầu*) | The operator-confirmed first successful sign-in inside the nick's browser profile. | `Account.firstLoginAt` |
| **readiness** (*kiểm tra thao tác*) | Whether the nick has the configuration, ownership, and current status required for its next operation. A waiting state is distinct from missing setup. | `describeAccountReadiness()` |
| **proxy** | The network endpoint assigned to one browser-backed nick. The proxy controls that nick's route; it is not a browser profile or proof of identity isolation. | Prisma model `Proxy`; route `/proxies` |
| **ticket** (*vé*) | A short-lived, single-use encrypted instruction issued to one Relay PC. The browser transports it but cannot read its contents. | `src/lib/tickets`; `TicketEnvelope` |
| **operator key** (*khóa vùng operator*) | The key held by Relay that opens nick credentials on an authorized Relay PC. The server stores only a sealed grant for the receiving PC. | `VAULT_KEY_OPERATOR`; `RelayDevice.operatorKeyGrant` |
| **Relay PC revocation** (*thu hồi máy*) | The irreversible action that blocks a Relay PC from receiving new tickets. It does not erase secrets already stored on that PC. | `RelayDevice.revokedAt`; route `/relay-devices` |

`Relay` or *cầu nối Relay* names the background software running on a **Relay PC**. Do not use
those software terms as another name for the PC itself.

## Scope labels

- Use **Workspace overview** only for Home, where nick counts, local Relay PC state, and next
  actions are summarized together.
- Use **Nick vault** for `/accounts`, where every visible shared nick is managed.
- Use **My nicks** (*nick của tôi*) only when the data is actually filtered to the current owner. Do
  not imply this scope from a team-wide query.
- Use **browser profile** in browser-runtime actions such as create, open, transfer, or local
  readiness. Do not shorten it to `profile` where that could be read as a nick record.
- Describe **MKT Browser** as a **browser profile manager with proxy binding**. A `Ready` state
  describes the next technical operation; it never certifies identity isolation.
- Use **Relay PC** for the registered PC. Use `Relay` only for the software or protocol.

## Relay version and connection labels

Profile actions fail closed, and the label must say which measured condition failed — never a
guessed one:

| Condition | Label rule |
|---|---|
| Relay version below the effective create-profile floor | **Relay update required** — the only situation where that label is allowed. The fix is reinstalling the current package from `/setup`; there is no self-update anymore. |
| Current Relay cannot reach MKT Browser | **MKT Browser is not connected**; open MKT Browser on this PC, then **Check again**. |
| Relay transport or local-network permission failure | **Relay is not reachable on this PC** or **Local PC access needs checking**; describe the local action without claiming an update is required. |
| Browser contract, engine, capability, or capacity failure | Name the measured Browser condition and give its safe next action; an unknown state is neither Ready nor outdated. |
| Retry the readiness check | **Check again** rechecks health and profile inventory; **Checking...** disables duplicate retries. It does not create a profile or issue a ticket. |

Profile-setup messages come from reviewed local states, never raw Relay/provider errors, tokens,
paths, or configuration details.

## Relay cleanup recovery labels

| Label | Meaning and boundary |
|---|---|
| **Finish local cleanup** | Resume signed cleanup for the signed-in owner's exact already-revoked Relay PC. It does not revoke an active PC, unpin nicks, restore access, or delete Browser profiles. |
| **Finish device retirement** | A protected retirement receipt needs recovery. This label does not establish ownership; server authorization and exact local recipient checks still apply. |
| **Retire this PC** | ADMIN planned retirement: revoke server access, unpin nicks, then complete signed local Relay cleanup on the exact PC. |
| **Contact an administrator** | The PC cannot be safely matched to its owner, has another binding conflict, or requires an ADMIN-only operation. |

After successful cleanup/finalization, tell the operator to **restart Relay**, return to **Setup**,
and register a **new Relay identity**. Never describe this as restoring the revoked registration.
