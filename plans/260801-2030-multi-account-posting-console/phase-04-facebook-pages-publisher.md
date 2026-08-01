# Phase 04 — Facebook Pages Publisher (API chính thức)

**Giai đoạn độc lập, làm song song bất cứ lúc nào.** Không phụ thuộc antidetect browser.

## Context Links
- [plan.md](plan.md) | [Phase 02](phase-02-content-queue-and-safety-rules.md)

## Overview
- **Priority:** P1
- **Status:** ⬜ Chưa bắt đầu
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

```prisma
model FacebookPage {
  id              String   @id @default(cuid())
  pageId          String   @unique          // id Page trên Facebook
  name            String
  accessTokenEnc  String                    // mã hóa
  adminAccountId  String                    // nick cá nhân quản trị (FK Account)
  tokenCheckedAt  DateTime?
  tokenValid      Boolean  @default(true)
}

model GroupReminder {                        // luồng thủ công cho Group
  id            String   @id @default(cuid())
  contentItemId String
  accountId     String                       // nick cá nhân sẽ đăng
  groupName     String
  groupUrl      String
  dueAt         DateTime
  status        String   @default("PENDING") // PENDING | DONE | SKIPPED
  doneAt        DateTime?
  note          String?
}
```

## Related Code Files

**Tạo mới:**
- `lib/facebook/facebook-graph-client.ts`
- `lib/facebook/facebook-token-manager.ts`
- `lib/facebook/facebook-page-publisher.ts`
- `lib/facebook/facebook-group-reminder.ts`
- `app/facebook/pages/page.tsx` — danh sách Page, trạng thái token
- `app/facebook/connect/page.tsx` — luồng OAuth
- `app/facebook/groups/page.tsx` — danh sách nhắc việc group
- `app/api/facebook/oauth/callback/route.ts`
- `app/api/facebook/publish/route.ts`

**Sửa:**
- `prisma/schema.prisma`
- `lib/rules/rules-engine.ts` — bỏ qua luật 6 (9:1) và luật 8 (đụng thread) khi platform = FACEBOOK_PAGE

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
- [ ] Tạo Meta App + xin quyền
- [ ] Schema FacebookPage + GroupReminder
- [ ] Graph API client + xử lý lỗi
- [ ] Token manager (long-lived + cảnh báo hạn)
- [ ] Luồng OAuth + chọn Page
- [ ] Page publisher (text/link/ảnh)
- [ ] Nối vào hàng đợi Phase 02
- [ ] Luồng nhắc việc Group thủ công
- [ ] Test đăng thật lên Page nháp

## Success Criteria
- Đăng được bài lên Fanpage từ tool, bài hiện đúng trên Facebook
- Token sống > 60 ngày, có cảnh báo trước khi hết
- Nhắc việc group hiện đúng giờ, bấm 1 nút là mở đúng profile + có sẵn nội dung trong clipboard
- **Không có bất kỳ đoạn code nào cố tự động đăng vào Group**

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
