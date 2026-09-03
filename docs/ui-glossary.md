# UI glossary

**Updated:** 3 September 2026

This glossary fixes the user-facing vocabulary for the identity workspace. It changes display
copy only: Prisma models, database columns, TypeScript domain names, and routes keep their current
names.

## Canonical terms

| UI term | Meaning | Code boundary |
|---|---|---|
| **nick** | A Reddit, Facebook, or TikTok identity record stored in the shared vault. A nick lives on its social platform; it is not local browser data. | Prisma model `Account`; route `/accounts` |
| **browser profile** (*profile trình duyệt*) | Browser data stored locally on one PC, including the browser workspace and its local state. It is not a vault record and is not proof of identity isolation. | `Account.antidetectProfileId`; MKT Browser local storage |
| **Relay PC** (*máy Relay*) | The registered operator PC that receives and consumes encrypted tickets for a nick. | Prisma model `RelayDevice`; route `/relay-devices` |

`Relay` or *cầu nối Relay* names the background software running on a **Relay PC**. Do not use
those software terms as another name for the PC itself.

## Scope labels

- Use **Team nick vault** when a view contains every visible nick in the shared vault.
- Use **My nicks** (*nick của tôi*) only when the data is actually filtered to the current owner. Do not imply
  this scope from a team-wide query.
- Use **browser profile** in browser-runtime actions such as create, open, transfer, or local
  readiness. Do not shorten it to `profile` where that could be read as a nick record.
- Use **Relay PC** for the registered PC. Use `Relay` only for the software or protocol.

## Display-label migration

| Before | After |
|---|---|
| `Kênh / Profiles` on `/` | `Home` |
| No `/accounts` navigation item | `Nick vault` |
| `All profiles` | `Team nick vault` |
| `New profile` | `Open nick vault` |
| `No profiles yet` / `Create first profile` | `No nicks in the team vault` / `Open nick vault` |
| Header `Search profiles, tags, urls...` | Home `Search nicks by username, voice, proxy, or notes...` |
| Header `Ctrl K` shortcut badge | Removed until a real shortcut exists |
| Header `running / total` summary | Removed; accurate nick and local browser profile counts stay inside Home |
| `Tài khoản` | `Nick vault` |
| `Profile & channel` | `Nick` |
| `Máy / Relay` | `Relay PCs` |
| `Device` | `Relay PC` |
| Fabricated fallback `Local PC` | `Relay PC not assigned` |
| `running` / `idle` | `Open on this Relay PC` / `Not open on this Relay PC` |
| `Thiết lập Máy Vận Hành (MKT Setup)` | `Relay PC setup` |
| `Bước 2: Kết nối Relay hiện tại` | `Step 2: Register this Relay PC` |
| `Tạo hồ sơ TikTok mới` | `Create TikTok nick` |
| `Tên Profile / Kênh` | `Nick username` |
| `Tạo profile & lưu cấu hình` | `Create TikTok nick` |
| `Profile antidetect` / `Id profile antidetect` | `Browser profile` / `Browser profile ID` |
| `Máy giữ profile` | `Relay PC` |
| `Mở profile` | `Open browser profile` |
