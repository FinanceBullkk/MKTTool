# Phase 04 — Facebook Pages Publisher (API chính thức)

**Giai đoạn độc lập, làm song song bất cứ lúc nào.** Không phụ thuộc antidetect browser.

## Context Links
- [plan.md](plan.md) | [Phase 02](phase-02-content-queue-and-safety-rules.md)

## Overview
- **Priority:** P1
- **Status:** 🟡 Khung xong 02/08/2026 — còn chờ Meta App thật để chạy bước 9 (đăng thử lên Page nháp)
- **Thời lượng:** 2-3 ngày
- **Mục đích:** Đăng nội dung thương hiệu lên 1-3 Fanpage qua Graph API. Miễn phí, hợp lệ,
  không bao giờ bị khóa vì vi phạm chính sách tự động hóa.

## Key Insights

1. **Groups API đã bị Meta khai tử tháng 04/2024.** Quyền `publish_to_groups` bị xóa khỏi mọi phiên
   bản Graph API. Không tool nào (Buffer, Hootsuite, Zoho, Make) auto-post group được nữa.
   → **Không cố build. Group làm tay.**
2. **Pages API vẫn chạy tốt và miễn phí.** Đây là con đường duy nhất đăng Facebook tự động mà an toàn.
3. **Fanpage luôn nằm dưới một nick cá nhân.** Dùng 1-2 nick cá nhân đã mua (Phase 00) làm quản trị
   viên Page. Nick đó phải là nick khỏe nhất trong đám, vì mất nó là mất quyền quản trị Page.
4. **Nick cá nhân FB dùng để seeding group** thì nằm trong kho danh tính (Phase 01) để mở đúng
   IP/vân tay, nhưng thao tác đăng là **thủ công**. Tool chỉ nhắc lịch + mở sẵn profile + copy nội dung.
5. Page Access Token phải đổi sang **long-lived** (60 ngày) rồi lấy token vĩnh viễn của Page,
   nếu không cứ 2 tiếng phải đăng nhập lại.

## Requirements

### Functional
- Kết nối Meta App → OAuth → lấy User Access Token → đổi thành Long-Lived → lấy Page Access Token
- Lưu Page token (mã hóa) trong kho danh tính
- Đăng lên Page: text, ảnh, link, lên lịch trước
- Dùng chung `ContentItem` và hàng đợi của Phase 02
- Rules engine áp dụng nhẹ hơn cho Page (Page là kênh chính thức, không cần luật 9:1 hay chống trùng
  giữa các nick — chỉ cần chống đăng trùng trên cùng 1 Page)
- **Luồng nhắc việc cho Group:** đến giờ hiện thông báo trên dashboard + nút mở sẵn profile + copy nội dung

### Non-functional
- Token tự làm mới trước khi hết hạn, cảnh báo nếu sắp hết
- Lỗi API hiện thông báo đọc được, không hiện mã lỗi thô

## Architecture

```
lib/facebook/
├── facebook-graph-client.ts          gọi Graph API, xử lý lỗi
├── facebook-token-manager.ts         đổi & làm mới token, cảnh báo hết hạn
├── facebook-page-publisher.ts        đăng bài lên Page
└── facebook-group-reminder.ts        sinh nhắc việc cho group (thủ công)
```

### Luồng lấy token (làm 1 lần)
```
1. Tạo Meta App tại developers.facebook.com (loại Business)
2. Xin quyền: pages_manage_posts, pages_read_engagement, pages_show_list
3. OAuth bằng nick cá nhân quản trị Page → User Access Token (2 giờ)
4. GET /oauth/access_token?grant_type=fb_exchange_token → Long-Lived User Token (60 ngày)
5. GET /me/accounts bằng token trên → Page Access Token (không hết hạn nếu user token là long-lived)
6. Lưu Page token đã mã hóa vào bảng FacebookPage
```

### Đăng bài
```
POST /{page-id}/feed          → text + link
POST /{page-id}/photos        → ảnh
Tham số scheduled_publish_time + published=false → lên lịch phía Facebook
```

**Ghi chú:** nên tự lên lịch ở tool thay vì dùng `scheduled_publish_time` của FB, để mọi thứ
tập trung một chỗ và rules engine kiểm soát được.

## Database Schema (bổ sung)

**Đã dựng 02/08/2026 — khác kế hoạch ở hai chỗ, lý do ghi ngay dưới.**

```prisma
model FacebookConnection {   // ← THÊM so với kế hoạch
  id             String    @id @default(cuid())
  fbUserId       String    @unique
  name           String
  accessTokenEnc String                    // user token long-lived, mã hóa
  expiresAt      DateTime?
  accountId      String?                   // nick trong kho danh tính, nếu đã nhập
  pages          FacebookPage[]
}

model FacebookPage {
  id             String    @id @default(cuid())
  pageId         String    @unique
  name           String
  accessTokenEnc String                    // mã hóa
  connectionId   String
  targetId       String?   @unique         // nối PlatformTarget để hàng đợi xếp lịch được
  adminAccountId String?                   // nick quản trị — KHÔNG bắt buộc
  tokenValid     Boolean   @default(true)
  tokenCheckedAt DateTime?
  tokenNote      String?
}
```

### Khác kế hoạch #1 — thêm `FacebookConnection`

Kế hoạch chỉ có `FacebookPage`, nhưng yêu cầu "cảnh báo token sắp hết hạn" không làm được
nếu không lưu user token: **Page token thừa hưởng tuổi thọ của user token sinh ra nó**.
Nhét `expiresAt` vào từng Page là chép cùng một sự thật ra n dòng rồi sửa chỗ này quên chỗ
kia. Một connection → n Page mới đúng hình dạng thật của dữ liệu.

`adminAccountId` chuyển thành **không bắt buộc**: kết nối Page được ngay cả khi chưa mua nick
cá nhân, gán sau. Trường này chỉ để tra ngược "mất nick nào thì mất Page nào" — công cụ đăng
bằng Page token chứ không mượn nick.

### Khác kế hoạch #2 — KHÔNG có `GroupReminder`

Đối chiếu từng trường: `contentItemId`, `accountId`, `groupName`/`groupUrl`, `dueAt`,
`status` (PENDING|DONE|SKIPPED) — **đúng bằng một `PostJob` có đích FACEBOOK_GROUP**
(`contentItemId`, `accountId`, `targetId`, `scheduledAt`, `status` PENDING|POSTED|SKIPPED).

Dựng bảng song song thì bài group đi vòng qua bộ luật, mà group vận hành y hệt subreddit và
phải chấm đủ 9 luật (xem `COMMUNITY_PLATFORMS`). Nó cũng khiến bài group vô hình với luật 6
(tỷ lệ promo) và luật 8 (đụng độ thread) — đúng hai luật không cộng đồng nào tha thứ.

Việc còn thiếu thật sự chỉ là *nhắc đúng giờ*, và đó là **một câu truy vấn** chứ không phải
một bảng: `facebook-group-reminder.ts` lọc `PostJob` PENDING có đích FACEBOOK_GROUP đến hạn
trong 24h tới; trang tổng quan hiện kèm nút mở profile + copy nội dung.

## Related Code Files

**Đã tạo 02/08/2026:**
- `lib/facebook/facebook-app-config.ts` — đọc env, quyền cần xin, redirect URI
- `lib/facebook/facebook-graph-client.ts` — GET/POST + che token trong mọi thông báo lỗi
- `lib/facebook/facebook-graph-error-messages.ts` — dịch mã lỗi Graph sang câu hành động được
- `lib/facebook/facebook-oauth-flow.ts` — authorize URL, đổi code → token 60 ngày, lấy Page
- `lib/facebook/facebook-token-manager.ts` — lưu mã hóa, tự tạo đích, kiểm token hàng loạt
- `lib/facebook/facebook-token-health.ts` — hàm thuần chấm sức khỏe token
- `lib/facebook/facebook-post-payload.ts` — hàm thuần dựng nội dung + tham số đăng
- `lib/facebook/facebook-page-publisher.ts` — đăng thật, trả post id + URL
- `lib/facebook/facebook-page-actions.ts` — server action: kiểm token, gán admin, ngắt kết nối
- `lib/facebook/facebook-publish-action.ts` — đăng một job trong hàng đợi
- `lib/facebook/facebook-group-reminder.ts` — truy vấn nhắc việc group (không phải bảng)
- `app/facebook/page.tsx` — một trang gộp: kết nối + Page + token + giải thích về Group
- `app/api/facebook/oauth/start/route.ts` + `callback/route.ts`
- `components/facebook/*`, `components/queue/facebook-publish-button.tsx`,
  `components/queue/group-post-reminders.tsx`
- `scripts/smoke-test-facebook-pages.ts` — nghiệm thu không cần Meta App (`npm run facebook:smoke`)

**Khác kế hoạch #3 — gộp 3 trang thành 1, bỏ `api/facebook/publish/route.ts`.**
Ba trang (`pages`/`connect`/`groups`) thực chất là ba khối của cùng một câu hỏi "Facebook đang
thế nào" → một trang `/facebook`. Nhắc việc group nằm ở trang tổng quan vì đó là nơi bạn MKT mở
đầu ngày, không phải một trang phải nhớ mà vào. Việc đăng dùng **server action** như mọi thao
tác khác của hàng đợi (`markJobPosted`, `recheckJob`) thay vì thêm một API route — cùng một
kiểu thao tác thì đi cùng một đường.

**Sửa:**
- `prisma/schema.prisma`
- ~~`lib/rules/rules-engine.ts` — bỏ qua luật 6 (9:1) và luật 8 (đụng thread) khi platform = FACEBOOK_PAGE~~
  **Xong 02/08/2026**, và rộng hơn kế hoạch: bỏ luôn luật 4 (hạn mức ngày) và luật 5 (nghỉ 24h)
  cho FACEBOOK_PAGE. Fanpage đăng nhiều bài mỗi ngày là chuyện thường. Facebook **Group** thì
  vẫn chạy đủ 9 luật — group vận hành như sub Reddit. Xem `COMMUNITY_PLATFORMS`.

## Implementation Steps

1. Tạo Meta App, cấu hình OAuth redirect về `http://localhost:3000/api/facebook/oauth/callback`.
2. Schema + migration.
3. `facebook-graph-client.ts`: wrapper `fetch`, tự thêm token, parse lỗi Graph API ra tiếng Việt.
4. `facebook-token-manager.ts`: đổi short→long token, lấy Page token, kiểm tra hạn, cảnh báo còn < 7 ngày.
5. Luồng OAuth: trang connect → redirect FB → callback lưu token → hiện danh sách Page chọn được.
6. `facebook-page-publisher.ts`: đăng text/link/ảnh, trả về post id + URL, ghi vào `PostJob.postedUrl`.
7. Nối vào hàng đợi Phase 02: chọn target loại `FACEBOOK_PAGE` thì đăng bằng API, không mở browser.
8. Luồng nhắc việc Group: tạo reminder → dashboard hiện "đến giờ đăng group X bằng nick Y" →
   bấm nút mở profile (dùng adapter Phase 01) + copy nội dung vào clipboard → bạn MKT dán và đăng →
   bấm "Đã xong".
9. Build sạch, test đăng thử 1 bài lên Page nháp.

## Todo List
- [x] Tạo Meta App + xin quyền — xong 03/08/2026 (app loại Business + Facebook Login for Business,
      quyền khai qua configuration, xem `FACEBOOK_LOGIN_CONFIG_ID`)
- [x] Schema FacebookConnection + FacebookPage (bỏ GroupReminder, xem lý do trên)
- [x] Graph API client + xử lý lỗi
- [x] Token manager (long-lived + cảnh báo hạn)
- [x] Luồng OAuth + chọn Page
- [x] Page publisher (text/link/ảnh)
- [x] Nối vào hàng đợi Phase 02
- [x] Luồng nhắc việc Group thủ công
- [x] Test đăng thật lên Page nháp — đạt 03/08/2026. Job `POSTED` kèm URL thật, `Interaction` POST
      tự ghi, `AuditLog` ghi `FACEBOOK_PAGE_PUBLISHED`, verdict luật lưu kèm job.
      Phát hiện kèm theo: `Account` ép proxy + antidetect profile cho cả nick FACEBOOK — phải bịa
      nick giả mới xếp lịch được. Việc sửa nằm ngoài phase này, đã ghi ở `docs/codebase-summary.md`.

## Success Criteria
- Đăng được bài lên Fanpage từ tool, bài hiện đúng trên Facebook — ⏳ chờ Meta App
- Token sống > 60 ngày, có cảnh báo trước khi hết — ✅ code + test xong (`facebook-token-health`)
- Nhắc việc group hiện đúng giờ, bấm 1 nút là mở đúng profile + có sẵn nội dung trong clipboard — ✅
- **Không có bất kỳ đoạn code nào cố tự động đăng vào Group** — ✅ và ghi rõ lý do trong
  `schema.prisma`, `facebook-publish-action.ts`, `facebook-publish-button.tsx`, trang `/facebook`

### Đã nghiệm thu được mà không cần Meta App (`npm run facebook:smoke`, 11/11 đạt)
Token mã hóa trước khi chạm DB · giải mã lại đúng nguyên bản · kết nối lại ghi đè chứ không đẻ
dòng trùng · Page tự sinh đích đăng · token hỏng thì chặn đăng **trước** khi gọi mạng và nêu
đúng lý do · Page chưa kết nối thì báo rõ · job group đến giờ hiện ở nhắc việc kèm nội dung
copy đủ tiêu đề + thân bài + link.

## Risk Assessment

| Rủi ro | Giảm thiểu |
|---|---|
| Nick cá nhân quản trị Page bị khóa | Đặt 2 nick làm quản trị Page, không để 1 |
| Meta App bị từ chối duyệt quyền | Chế độ Development đủ dùng cho Page mình sở hữu, không cần App Review |
| Token hết hạn thầm lặng | Kiểm tra token mỗi ngày cùng lúc chạy health check |
| Ai đó cố thêm auto-post group sau này | Ghi rõ trong code comment + file này lý do không làm |

## Security Considerations
- Page Access Token quyền rất mạnh — mã hóa như credential nick, không log ra console.
- `App Secret` chỉ nằm trong biến môi trường server, không bao giờ gửi xuống client.
- OAuth redirect chỉ chấp nhận `localhost`, không mở ra internet.

## Next Steps
→ [Phase 05 — Tự động đăng Reddit](phase-05-reddit-posting-automation.md)
