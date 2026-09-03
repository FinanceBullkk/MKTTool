# UI glossary

**Updated:** 4 September 2026

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
| **proxy** | The network endpoint assigned to one browser-backed nick. The proxy controls that nick's route; it is not a browser profile or proof of identity isolation. | Prisma model `Proxy`; route `/proxies` |
| **ticket** (*vé*) | A short-lived, single-use encrypted instruction issued to one Relay PC. The browser transports it but cannot read its contents. | `src/lib/tickets`; `TicketEnvelope` |
| **operator key** (*khóa vùng operator*) | The key held by Relay that opens nick credentials on an authorized Relay PC. The server stores only a sealed grant for the receiving PC. | `VAULT_KEY_OPERATOR`; `RelayDevice.operatorKeyGrant` |
| **Relay PC revocation** (*thu hồi máy*) | The irreversible action that blocks a Relay PC from receiving new tickets. It does not erase secrets already stored on that PC. | `RelayDevice.revokedAt`; route `/relay-devices` |
| **posting queue** (*hàng đợi*) | The schedule of posting jobs and their current rule verdicts. | Route `/queue`; Prisma model `PostJob` |
| **posting target** (*đích đăng*) | The subreddit, Facebook Group, or Facebook Page that a job would publish to. | Prisma model `PlatformTarget` |
| **posting rules** (*bộ luật*) | The safety checks evaluated for a proposed posting job. Each rule returns Allow, Warning, or Block with a user-readable reason. | `src/lib/rules` |
| **rule verdict** (*kết luận luật*) | The stored result of one posting rule, including its level and explanation. | `PostJob.ruleVerdicts`; `RuleResult` |
| **value post** (*bài hữu ích*) | A non-promotional contribution counted toward a target's promotional ratio. | Content type `VALUE` |
| **promotional post** (*bài quảng cáo*) | A post that promotes the team's product or service and consumes promotional-ratio capacity. | Content type `PROMO` |
| **thread collision** (*đụng độ thread*) | Two nicks under the same operation touching the same thread, which is a non-overridable coordination risk. | Rule `thread-collision`; `Interaction.threadKey` |
| **health check** (*lần dò sức khỏe*) | An outside-visibility check used to detect stale, hidden, checkpointed, or untracked nick activity. | Prisma model `HealthCheck`; route `/health` |
| **content library** (*kho content*) | The team-authored source items available to the posting queue and duplicate-content rules. | Prisma model `ContentItem`; route `/content` |
| **Facebook Page** (*Fanpage*) | An owned Facebook Page connected through the official Graph API. Use `Facebook Page`, not `Fanpage`, in English UI copy. | Prisma model `FacebookPage`; route `/facebook` |
| **parked workflow** (*phạm vi đã gác*) | A retained, history-only workflow outside the current team rollout scope. Its routes remain visible, but posting actions fail closed. | `ROLLOUT_PLATFORMS`; `parkedPlatformMessage()` |

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
| `Máy chạy cầu nối` | `Relay PC registry` |
| `Cầu nối` when naming the software | `Relay` |
| `Khóa operator` | `Operator key` |
| `Cấp khóa` / `Cấp lại khóa` | `Grant operator key` / `Grant operator key again` |
| `Thu hồi máy` | `Revoke Relay PC` |
| `Thêm Proxy` / `Sửa proxy` / `Xóa` | `Add proxy` / `Edit proxy` / `Delete proxy` |
| `Chưa gắn Profile` / `Đang gắn Profile` | `Not assigned to a nick` / `Assigned to a nick` |
| `Profile Đang Gắn` | `Assigned nick` |
| `Dân cư tĩnh (ISP)` | `Static ISP` |
| `Kiểm` / `Đo tốc độ (1 MB)` | `Check` / `Measure speed (1 MB)` |
| `Karma tối thiểu` | `Minimum karma` |
| `Tuổi nick tối thiểu (ngày)` | `Minimum nick age (days)` |
| `Tỷ lệ promo` | `Promotional ratio` |
| `Sub cho phép đăng link` | `Subreddit allows link posts` |
| `Đang dùng` | `Active` |
| `Cài đặt` | `Settings` |
| `Hàng đợi` | `Posting queue` |
| `Xếp lịch đăng` | `Schedule a post` |
| `Đích đăng` | `Posting target` |
| `Bộ luật` | `Posting rules` |
| `Kết luận luật` / `verdict` | `Rule verdict` |
| `Bài hữu ích` | `Value post` |
| `Bài quảng cáo` | `Promotional post` |
| `Đụng độ thread` | `Thread collision` |
| `Kết quả dò gần nhất` | `Latest health check` |
| `Đăng được` / `Cân nhắc` / `Bị chặn` | `Can post` / `Consider` / `Blocked` |
| `Kho content` | `Content library` |
| `Thêm content` / `Sửa content` | `Add content` / `Edit content` |
| `Fanpage` | `Facebook Page` |
| `Kết nối nick Facebook` | `Connect Facebook nick` |
| `Nick quản trị` | `Administrator nick` |
| `Chờ đăng` / `Đang đăng` / `Đã đăng` | `Pending` / `Posting` / `Posted` |
| `Lỗi` / `Bỏ qua` | `Failed` / `Skipped` |
| `Đang tạm gác` | `Parked` |
| `Quay lại kho nick` | `Return to the nick vault` |
| `Dùng được` / `Đang đóng` | `Available` / `Closed` |
| `Chú ý` / `Đang hỏng` | `Attention` / `Broken` |
| `Xóa thật` / `Thôi` | `Delete permanently` / `Cancel` |
| `proxy không dùng được` | `unusable proxy` |
| `nick có cụm đã hỏng` | `nick has a broken assignment` |
| `Quản trị viên gán lại cụm` | `An administrator reassigns the nick` |
| `nick chưa dùng được vì còn thiếu cấu hình` | `nick is not ready because configuration is missing` |
| `trang Chuẩn bị` | `Setup page` |
| `Sao lưu ra ngoài Railway` | `Off-Railway backup` |
| `nick cần xử lý tay` | `nick needs manual attention` |

Audit-log `detail` text is display copy too, and reads as `<actor email> <detail>`:

| Before | After |
|---|---|
| `gỡ chủ của nick` | `removed the nick owner` |
| `giao nick cho …` | `assigned the nick to …` |
| `gỡ ghim khỏi máy …` | `unpinned the nick from Relay PC …` |
| `ghim nick vào máy …` | `pinned the nick to Relay PC …` |
| `chuyển nick từ máy … sang máy …` | `moved the nick from Relay PC … to Relay PC …` |
| `khai đã đăng nhập được nick vào profile của nó` | `confirmed the nick signed in to its browser profile` |
| `tạo profile … trên máy …` | `created browser profile … on Relay PC …` |
| `trạng thái` / `không gắn` / `không có` | `status` / `unassigned` / `none` |

Audit `action` enum values are unchanged; only the human-readable `detail` is translated. Rows
written before this change keep their original Vietnamese text.
