# Ghim nick vào một máy operator — quản lý acc/proxy khi nhiều người dùng chung

## Context

Web đã chạy thật trên Railway (GĐ5) và sắp bàn giao cho 5-6 người (GĐ6). Mô hình phân quyền hiện tại được viết cho **một** người vận hành cả đàn nick, và có đúng 4 việc chỉ-ADMIN-làm-được: gán chủ nick, đăng ký/thu hồi máy cầu nối, cấp khóa operator. Mọi thứ khác — kể cả xóa nick và xóa proxy — bất kỳ OPERATOR nào cũng làm được.

Gốc của vấn đề là **một pointer bị thiếu**: `Account.antidetectProfileId` là khóa chính của một file SQLite trên **đúng một máy** (đã đo 07/08/2026: MultiZen không có cloud sync, không có account/license server; sync + team workspace chỉ nằm ở roadmap của họ). Nhưng database lưu nó như một giá trị toàn cục và `Account` không biết profile đó nằm ở máy nào. Vì thiếu ô đó, [launch/route.ts:122](../../src/app/api/accounts/[id]/launch/route.ts) buộc phải đoán "máy của người đang bấm", và đoán đó sai mỗi khi người bấm không phải chủ nick.

Bốn hệ quả đang mở:

1. **Bấm "Mở profile" trên nick người khác vẫn phát được vé** — `launch/route.ts` không gọi `requireNickOwner`, và cầu nối bên kia báo một lỗi MultiZen mơ hồ chứ không nói "sai máy".
2. **Rút được mật khẩu proxy bằng nút bấm.** Ruột vé `LAUNCH_PROFILE` chứa mật khẩu proxy đã giải mã ([proxy-config-builder.ts:52](../../src/lib/antidetect/proxy-config-builder.ts)), vé mở profile lại **được miễn** hạn nhịp 10/phút, và UI `/proxies` cố ý không bao giờ hiện mật khẩu.
3. **Kho proxy ai cũng sửa/xóa được** — dữ liệu đã trả tiền, mật khẩu không có bản thứ hai. Nút "Đo tốc độ" đốt 1 MB quota mỗi lượt, không gác.
4. **Nút "Mở profile" ở thẻ nhắc việc đang hỏng với người có 2 máy** — [manual-post-reminders.tsx:75](../../src/components/queue/manual-post-reminders.tsx) gọi `/launch` không kèm `deviceId`, nên `resolveTicketRecipient` từ chối kèm câu "chọn máy bạn đang ngồi" mà giao diện đó không có ô chọn.

**Kết quả mong muốn:** cụm `nick → proxy → profile → máy → người` khép kín và do database ép, y như cách nó đang ép `1 nick = 1 proxy`. Vé đi tới **máy giữ nick**, không đi tới máy người bấm.

**Làm trước GĐ6 vì kho nick trên máy chủ còn rỗng** — migration không cần backfill. Nhập 8-10 nick trước rồi mới thêm cột là phải gán tay từng cụm, đúng lúc chưa ai nhớ profile nào ở máy nào.

## Quyết định thiết kế

| Quyết định | Chốt | Vì sao |
|---|---|---|
| Thêm `Account.deviceId → RelayDevice` | ✅ | Ô còn thiếu. Một dòng schema đóng lỗ 1, 2, 4 |
| Giữ cả `ownerId`, **không gộp** | ✅ | Nick Facebook không có profile lẫn máy (Graph API) nhưng vẫn cần chủ để đọc bí mật. Gộp là biến mọi nick FB thành nick không chủ |
| Vé mở profile → máy giữ nick, **ADMIN không có ngoại lệ** | ✅ | Vé bọc mật mã cho máy của Hà thì ADMIN phát được cũng không mở nổi. Ngoại lệ của ADMIN thuộc về *bí mật*, không thuộc về *mở profile* |
| Vé bí mật cũng theo máy giữ nick | ✅ | Mật khẩu được gõ vào profile — thứ chỉ có ở một máy. Bỏ luôn ô "chọn máy bạn đang ngồi" khỏi luồng này |
| **Không** làm đường thoát "lấy bí mật về máy tôi" cho ADMIN | ✅ | Dư thừa: ADMIN gán lại cụm là xong, và cách đó để lại `AuditLog` tốt hơn. Người rời team → gán lại cụm cho người kế nhiệm |
| Thu hồi máy **không bị chặn** bởi nick đang ghim | ✅ | Mất laptop là đường khẩn cấp, chặn nó lại là sai. Thay vào đó: gỡ ghim các nick trong cùng transaction rồi nói rõ mấy nick vừa mất ghim |
| Proxy CRUD + đo tốc độ → `adminAction` | ✅ | Xóa nhầm một dòng là mất credential đã trả tiền. Nút **Kiểm** thì để mở: tốn vài KB, cần bấm lúc gấp |
| Chuyển máy: cảnh báo + `AuditLog` riêng, **không chặn** | ✅ | Chuyển hẳn rồi xóa bản cũ là chuyện người thật vẫn làm. Thứ giết nick là xoay vòng hai máy và quên xóa bản cũ — database không với tới được, nên can thiệp bằng câu chữ + dấu vết |
| Không dựa vào "MultiZen chặn profile ở 2 máy" | ✅ | Sync opt-in nằm trong roadmap của họ. Hàng rào phải là `deviceId` do MKTTool ép |

## Bất biến phải giữ

`deviceId` có giá trị ⟹ `device.userId === ownerId` **và** `device.revokedAt === null`.

Postgres không diễn đạt được ràng buộc bắc qua hai bảng này mà không cần trigger, nên ép bằng ba lớp:

1. **Một action ghi cả hai ô cùng lúc** — không có đường tạo trạng thái nửa vời.
2. **Ô chọn máy chỉ liệt kê máy của đúng người vừa chọn** trong form.
3. **Khay cảnh báo vận hành** ([ops-alert-types.ts](../../src/lib/ops-alerts/ops-alert-types.ts), `audience: "ADMIN"`) kêu khi có hàng lệch, hoặc khi nick Reddit có `antidetectProfileId` mà chưa ghim máy nào. Không hỏng lặng lẽ.

## Bước 1 — Ghim cụm (phải xong trước khi nhập nick)

**Schema** — `prisma/schema.prisma`, migration `20260807xxxxxx_pin_account_to_relay_device`:

```prisma
/// Máy giữ profile antidetect của nick này. `antidetectProfileId` là khóa chính của một file
/// SQLite trên đúng một máy (MultiZen không đồng bộ), nên id đó vô nghĩa nếu không nói kèm máy nào.
///
/// Nullable: nick Facebook không cần (Graph API), và nick vừa nhập chưa gán cụm vẫn phải tồn tại
/// được. `SetNull` như `ownerId` — xóa một người thì máy của họ mất theo (Cascade), và nick chỉ
/// mất ghim chứ không bị xóa.
deviceId String?
device   RelayDevice? @relation(fields: [deviceId], references: [id], onDelete: SetNull)
@@index([deviceId])
```

Thêm quan hệ ngược `accounts Account[]` vào `RelayDevice`.

**Gán cụm** — [account-owner-actions.ts](../../src/lib/accounts/account-owner-actions.ts): đổi `assignAccountOwner` → `assignAccountCluster`, nhận `{ accountId, ownerId, deviceId }`, vẫn `adminAction`. Luật:

- `ownerId` rỗng ⟹ `deviceId` cũng bị xóa (nick không chủ thì không có máy nào giữ hộ).
- `deviceId` khai mà máy không thuộc `ownerId`, hoặc đã thu hồi ⟹ từ chối kèm câu nói rõ máy đó của ai.
- Giữ nguyên lượt kiểm `isEmailAllowed` đang có (hàng `User` chỉ chứng minh họ *từng* đăng nhập).
- `AuditLog`: thêm `ACCOUNT_DEVICE_PINNED` / `ACCOUNT_DEVICE_UNPINNED` / `ACCOUNT_DEVICE_MOVED` vào [audit-log-actions.ts](../../src/lib/audit/audit-log-actions.ts). Ba loại rời nhau vì câu hỏi *"nick này từng ở máy nào, từ ngày nào"* là câu sẽ phải trả lời vào đúng ngày một nick chết không rõ lý do.

**Chuyển máy là một thao tác, không phải sửa một ô dropdown.** Khi `deviceId` đổi từ máy này sang máy khác (khác với gán lần đầu), thẻ phải cảnh báo trước khi lưu và ghi `ACCOUNT_DEVICE_MOVED`. Câu cảnh báo nhắc đúng ba bước, vì bước thứ ba là bước luôn bị bỏ:

> Profile MultiZen không tự đi theo. Export ở máy cũ → import ở máy mới → **xóa bản ở máy cũ**. Bỏ bước cuối là nick sống ở hai máy cùng lúc: một phiên đăng nhập, hai bộ tín hiệu thiết bị, và hai người có thể cùng đăng một bài mà bộ dò không phân biệt được.

Vì sao chỉ cảnh báo chứ không chặn: chuyển hẳn sang máy mới rồi xóa bản cũ là chuyện bình thường và người thật vẫn làm (mua máy mới). Thứ giết nick là *xoay vòng giữa hai máy* và *quên xóa bản cũ* — cả hai đều nằm ngoài tầm với của database, nên chỗ đúng để can thiệp là câu chữ cộng dấu vết trong sổ.

**Tìm máy nhận** — [ticket-recipient-lookup.ts](../../src/lib/tickets/ticket-recipient-lookup.ts): thêm `resolveNickDeviceRecipient(actor, accountId)` dùng lại `ResolvedRecipient` + `toRecipient()` sẵn có. Bốn lối ra, mỗi lối một câu tiếng Việt nói được **làm gì tiếp**:

| Tình huống | Câu trả lời |
|---|---|
| Nick chưa ghim máy nào | "Nick này chưa ghim vào máy nào — nhờ quản trị viên gán cụm ở trang chi tiết nick." |
| Máy đã bị thu hồi | "Máy *X* giữ nick này đã bị thu hồi. Gán lại cụm sang máy khác." |
| Máy của người khác | "Nick này ở máy *X* của `hà@…` — vé mã hóa cho đúng máy đó nên bấm ở đây không mở được." |
| Hợp lệ | `{ ok: true, recipient }` |

Giữ `resolveTicketRecipient` **nguyên vẹn** — nó vẫn là đường của nick không có máy (Facebook) và của luồng đăng ký cầu nối.

**Route mở profile** — [launch/route.ts](../../src/app/api/accounts/[id]/launch/route.ts): đổi sang `resolveNickDeviceRecipient`, **bỏ** việc đọc `deviceId` từ query string. Bốn lớp chặn trong doc comment đầu file lên thành năm — cập nhật comment đó, nó là hợp đồng của file.

**Vé bí mật** — [vault-credential-actions.ts](../../src/lib/accounts/vault-credential-actions.ts): trong cả `requestCredentialTicket` và `requestOtpTicket`, nếu nick có `deviceId` thì dùng `resolveNickDeviceRecipient`, ngược lại lùi về `resolveTicketRecipient(actor, deviceId)`. Bảng ba lớp chặn trong doc comment thành bốn lớp.

**UI:**

- [accounts/[id]/page.tsx](../../src/app/accounts/[id]/page.tsx) — thẻ "Phân công nick" thêm ô chọn máy; danh sách máy phải là **máy của chủ nick**, không phải của người đang xem (dòng 62-64 hiện đang lấy của người xem — đúng cho panel thao tác, sai cho thẻ này). Thêm dòng "Máy giữ profile" vào bảng `facts`.
- [account-vault-actions-panel.tsx](../../src/app/accounts/[id]/account-vault-actions-panel.tsx) — bỏ state `deviceId` và ô chọn máy; `relayDevices` chỉ còn cần cho nick không ghim máy.
- [manual-post-reminders.tsx](../../src/components/queue/manual-post-reminders.tsx) — không đổi code, tự hết hỏng (lỗ 4).
- [relay-devices](../../src/app/relay-devices/page.tsx) — mỗi dòng máy hiện số nick đang ghim, để người sắp thu hồi biết mình đang làm gì.

**Thu hồi máy** — [relay-device-actions.ts:184](../../src/lib/tickets/relay-device-actions.ts): bọc `update` + `account.updateMany({ where: { deviceId }, data: { deviceId: null } })` vào một `$transaction`, câu trả về nói thêm "N nick vừa mất ghim, gán lại cụm trước khi mở profile".

**Cảnh báo** — [collect-ops-alerts.ts](../../src/lib/ops-alerts/collect-ops-alerts.ts): thêm hai mục `audience: "ADMIN"` — hàng lệch bất biến (`tone: "red"`), và nick Reddit có profile mà chưa ghim máy (`tone: "amber"`).

## Bước 2 — Kho proxy về tay ADMIN

Đổi `guardedAction` → `adminAction`: `createProxy` ([vault-create-actions.ts:58](../../src/lib/accounts/vault-create-actions.ts)), `updateProxy` ([vault-update-actions.ts:71](../../src/lib/accounts/vault-update-actions.ts)), `deleteProxy` ([vault-delete-actions.ts:46](../../src/lib/accounts/vault-delete-actions.ts)), `measureOneProxySpeed` ([proxy-bandwidth-actions.ts:19](../../src/lib/proxies/proxy-bandwidth-actions.ts)).

**Giữ `guardedAction`** cho `checkOneProxy` / `checkEveryProxy` — vài KB, và là thứ cần bấm lúc đang gấp.

UI ẩn form theo `viewer?.role === "ADMIN"` ở [proxies/page.tsx](../../src/app/proxies/page.tsx) và [proxies/[id]/page.tsx](../../src/app/proxies/[id]/page.tsx), theo đúng khuôn thẻ "Phân công nick" đang dùng — ẩn nút chỉ để dọn màn hình, chặn thật nằm ở wrapper.

Hai script `scripts/import-proxies-*.ts` gọi `prisma.proxy.create` trực tiếp nên không bị ảnh hưởng.

## Test

`ACTION_GUARDS` đã có `"adminAction"` nên phép kiểm hình dạng ([guarded-entry-points.test.ts](../../src/lib/auth/guarded-entry-points.test.ts)) không cần sửa. Test mới, theo khuôn `*.database.test.ts` sẵn có (phiên OPERATOR thật, vì ADMIN được cho qua sớm):

| File | Chứng minh |
|---|---|
| `src/lib/accounts/account-cluster-assignment.database.test.ts` | từ chối máy của người khác; từ chối máy đã thu hồi; gỡ chủ thì gỡ luôn ghim; ghi đủ `AuditLog` |
| `src/lib/tickets/nick-device-recipient.database.test.ts` | bốn lối ra của `resolveNickDeviceRecipient`, gồm ca **ADMIN cũng bị từ chối** khi nick ở máy người khác |
| `src/lib/tickets/relay-device-revoke-unpins.database.test.ts` | thu hồi máy gỡ ghim mọi nick của nó, trong một transaction |
| `src/lib/proxies/proxy-writes-are-admin-only.database.test.ts` | OPERATOR bị từ chối tạo/sửa/xóa/đo proxy, nhưng **kiểm được** proxy |
| `collect-ops-alerts.test.ts` (mở rộng) | hai cảnh báo mới bật đúng điều kiện, tắt khi sạch |

Cập nhật `vault-update-owner-guard.database.test.ts` nếu chữ ký `assignAccountCluster` làm nó đỏ.

## Nghiệm thu

1. `npm run db:upgrade` rồi **khởi động lại** `npm run dev` (dev server giữ bản mô tả DB trong bộ nhớ — README ghi rõ bẫy này).
2. `npm test` + `npm run lint` + `npm run typecheck`.
3. `npm run vault:smoke` — chứng minh ranh giới hai vùng khóa còn nguyên sau khi đổi luồng vé.
4. **Tay, hai vai:** ADMIN gán cụm một nick Reddit cho chính mình + máy này → bấm "Mở profile" ở cả `/accounts/[id]` và thẻ "Đăng tay" ở trang chủ, cả hai phải mở được **mà không hỏi máy nào**. Rồi gán cụm sang người khác → bấm lại, phải ra đúng câu "nick này ở máy X của …". Kiểm `AuditLog` ở cuối trang nick.
5. Thu hồi máy đó ở `/relay-devices` → câu trả về phải nói đúng số nick vừa mất ghim, và khay cảnh báo phải kêu.
6. Đăng nhập bằng một email OPERATOR → `/proxies` không còn form thêm/sửa/xóa, nút **Kiểm** vẫn bấm được.

Không tự chạy `npm run build` (máy còn ít RAM).

## Rủi ro

| Rủi ro | Giảm thiểu |
|---|---|
| Đổi tên `assignAccountOwner` sót chỗ gọi | Chỉ có 1 chỗ ([page.tsx:168](../../src/app/accounts/[id]/page.tsx)); `npm run typecheck` bắt hết |
| Định dạng vé không đổi nên cầu nối cũ vẫn chạy — nhưng máy chủ đổi *người nhận* | Không cần tăng `TICKET_FORMAT_VERSION` / `MIN_RELAY_VERSION`: bao ngoài và ruột giữ nguyên hình dạng, chỉ đổi `deviceId` được điền vào. Ghi rõ điều này trong commit |
| Nick Facebook bị đòi ghim máy | Nhánh lùi về `resolveTicketRecipient` phải có test riêng cho nick không proxy/không profile |
| Ghim sai máy lúc nhập liệu GĐ6 | Thứ tự nhập: cài cầu nối + đăng ký máy **trước**, rồi mới tạo nick — bổ sung vào mục "Thứ tự nhập liệu" của README |

## Tài liệu phải cập nhật sau khi xong

`README.md` (mục "Hai vai trò", "Cầu nối", "Thứ tự nhập liệu", "Bảo mật"), `docs/huong-dan-van-hanh-cho-team.md` (câu "máy chủ từ chối phát vé cho nick không phải của bạn" ở dòng 303 hiện đúng cho vé bí mật nhưng **sai cho vé mở profile** — sau bước 1 thì đúng cho cả hai), `docs/system-architecture.md`, `docs/project-changelog.md`, `docs/development-roadmap.md`.

## Phụ lục — VPS thay cho laptop

Đã cân 07/08/2026. **Code không đổi**: sổ `RelayDevice` không quan tâm chiếc máy là sắt hay ảo, nên một VPS đăng ký cầu nối y hệt một laptop. VPS **không thay thế** `deviceId`, nó chỉ làm giá trị đó đứng yên.

**Chốt: một VPS cho mỗi người, KHÔNG dùng một VPS chung cả team.** Ba lý do:

1. Một VPS chung là gom cả đàn nick về đúng một nền phần cứng thật — ngược hẳn với việc đang chi tiền cho 10 proxy riêng + 10 vân tay riêng. Rò một chỗ ở nền đó là nối cả 10 nick cùng lúc.
2. Windows desktop chỉ cho một phiên RDP tại một thời điểm; người thứ hai đăng nhập là đá người thứ nhất ra và profile đang mở chết theo. Nhiều phiên đòi Windows Server + RDS CAL.
3. Một hộp bị chiếm = mọi phiên đăng nhập đang mở + khóa vùng operator.

**Hai ràng buộc cứng nếu dùng VPS:**

- **Không có headless.** Tài liệu MCP của MultiZen: *"Profiles always open as visible desktop windows. There is no headless mode."* Phải là Windows VPS có desktop, có phiên RDP đang đăng nhập.
- **Phải đo vân tay TRƯỚC khi đưa nick thật lên.** VPS không có GPU thật → Chromium render bằng phần mềm (SwiftShader/llvmpipe). MultiZen giả được tên GPU, nhưng canvas/WebGL vẫn cho ra đặc tính của bộ render phần mềm — cái khai và cái đo được mâu thuẫn nhau. Chưa đo được MultiZen che tới đâu. Quy trình đo: mở cùng một profile trên laptop và trên VPS, vào một trang đo vân tay, so hai kết quả — cùng cách đã bắt ra lỗi `sv-SE` trên IP Anh hồi 02/08. Luật firewall chặn WebRTC cũng phải dựng lại trên VPS.

Với 1-2 người vận hành Reddit ở GĐ6, laptop vẫn rẻ và an toàn hơn. VPS là thứ tính khi lên 4-5 người hoặc khi có người phải đổi máy thường xuyên.

## Đã chốt

- **Một nick = một máy tại một thời điểm.** Không làm bảng nối nhiều-nhiều: profile MultiZen không đồng bộ nên máy thứ hai vốn không có profile đó, và cho ghim hai máy là hệ thống chúc phúc cho ca tệ nhất — một nick sống ở hai nơi cùng lúc.
- **Bước 2 làm cùng lượt, tách thành commit riêng.**
