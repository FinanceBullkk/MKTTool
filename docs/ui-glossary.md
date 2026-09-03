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
| **nick owner** (*người phụ trách*) | The teammate assigned to a nick. This person is the only non-administrator who can request the nick password or OTP. | `Account.ownerId` |
| **Nick assignment** (*phân công cụm*) | The paired owner and Relay PC assignment for one nick. The Relay PC must belong to the nick owner. | `Account.ownerId` plus `Account.deviceId` |
| **writing voice** (*giọng viết*) | A human-authored note describing how the nick should write. It guides the operator; it is not an automated rule input. | `Account.voice` |
| **content focus** (*mảng nội dung*) | A human-authored note describing the subjects the nick normally covers. | `Account.contentAngle` |
| **first sign-in** (*đăng nhập lần đầu*) | The operator-confirmed first successful sign-in inside the nick's browser profile. | `Account.firstLoginAt` |
| **readiness** (*kiểm tra thao tác*) | Whether the nick has the configuration, ownership, and current status required for its next operation. A waiting state is distinct from missing setup. | `describeAccountReadiness()` |

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
| `Danh sách — N nick` | `Team nick vault - N nicks` |
| `Chưa có nick nào` | `No nicks in the team vault` |
| `Kiểm tra thao tác` | `Readiness` |
| `Nền tảng` | `Platform` |
| `Trạng thái` | `Status` |
| `Giọng viết` | `Writing voice` |
| `Mảng nội dung` | `Content focus` |
| `Tuổi nick` | `Nick age` |
| `Người phụ trách` | `Nick owner` |
| `Phân công cụm` | `Nick assignment` |
| `Đăng nhập lần đầu` | `First sign-in` |
| `Email gốc` | `Original email` |
| `Mật khẩu nick` | `Nick password` |
| `Mật khẩu Google` | `Google password` |
| `Mật khẩu email` | `Email password` |
| `Mã 2 lớp của Google` | `Google 2FA secret` |
| `Cold-start tới ngày` | `Cold-start until` |
| `Ngày tạo nick trên nền tảng` | `Platform creation date` |
| `Ngày mua` | `Purchase date` |
| `Ghi chú mua` | `Purchase notes` |
| `Lý do cách ly` | `Quarantine reason` |
| `Thêm nick` | `Add nick` |
| `Sửa nick` | `Edit nick` |
| `Xóa nick` | `Delete nick` |
| `Thao tác` | `Actions` |
| `Thông tin` | `Details` |
| `Nhật ký gần đây` | `Recent activity` |
| `Đủ điều kiện cấu hình` | `Configuration ready` |
| `Đang chờ` | `Waiting` |
| `Chưa dùng được` | `Not ready` |
| `Đã chết` | `Dead` |
| `Dính checkpoint` | `Checkpointed` |
| `Bị ẩn` | `Shadowbanned` |
| `Đang cold-start` | `Cold-start` |
| `Khỏe` | `Healthy` |
| `Nhãn` | `Label` |
| `Giao thức` | `Protocol` |
| `Mật khẩu` | `Password` |
| `Quốc gia` | `Country` |
| `Loại` | `Type` |
| `Ghi chú` | `Notes` |
| `Tên` | `Name` |
| `Karma tối thiểu` | `Minimum karma` |
| `Tuổi nick tối thiểu (ngày)` | `Minimum nick age (days)` |
| `Tỷ lệ promo` | `Promotional ratio` |
| `Sub cho phép đăng link` | `Subreddit allows link posts` |
| `Đang dùng` | `Active` |
| `Cài đặt` | `Settings` |
