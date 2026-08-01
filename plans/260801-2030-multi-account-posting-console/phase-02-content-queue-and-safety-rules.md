# Phase 02 — Hàng đợi content + Bộ luật an toàn

**Đây là giai đoạn quan trọng nhất của cả dự án.** Vân tay và proxy chống "bị nhận ra là cùng một
người". Giai đoạn này chống "bị nhận ra là đang spam" — nguyên nhân shadowban số 1.

## Context Links
- [plan.md](plan.md) | [Phase 01](phase-01-identity-vault.md)

## Overview
- **Priority:** P0 — không có phần này thì các phần khác vô nghĩa
- **Status:** ⬜ Chưa bắt đầu
- **Thời lượng:** 7-10 ngày

## Key Insights

1. **Nguyên nhân shadowban thật:** đăng nội dung trùng/na ná giữa nhiều nick trên **cùng một
   nền tảng**. X cấm thẳng, Reddit coi là "coordinated inauthentic behavior".
2. **Khác nền tảng thì không sao.** Các nền tảng không chia sẻ dữ liệu với nhau. Nên bộ chặn trùng
   chỉ so sánh **trong cùng platform**.
3. **Luật 9:1 của Reddit** — hầu hết sub ngách áp tỷ lệ 9 đóng góp hữu ích : 1 bài quảng cáo.
   Vi phạm → mod (người thật) để ý → soi cả cụm nick.
4. **2 nick chung IP cùng tương tác 1 bài = shadowban tức thì trên Reddit.** Kể cả IP khác nhau,
   2 nick của mình cùng vào 1 thread cũng là tín hiệu phối hợp. Phải chặn ở tầng phần mềm.
5. Không cần embedding/AI để so sánh độ giống. Trigram Jaccard là đủ và chạy tức thì. YAGNI.

## Requirements

### Functional
- Nhập content: title, body, links, `type` = `VALUE` (hữu ích) | `PROMO` (có nhắc sản phẩm)
- Xếp lịch: chọn nick + target (subreddit) + giờ đăng
- **Rules Engine** — chạy 8 luật kiểm tra trước khi cho phép đăng, trả về `ALLOW | WARN | BLOCK`
  kèm lý do đọc được bằng tiếng Việt
- Bộ đếm tỷ lệ promo theo từng cặp (nick × target)
- Ghi nhận mọi tương tác (`interactions`) để chặn đụng độ
- Xem trước: "Nếu đăng cái này sẽ vi phạm luật nào"

### Non-functional
- Rules engine chạy < 200ms
- Mọi luật phải giải thích được lý do, không chỉ chặn suông
- Cho phép ghi đè thủ công (`override`) nhưng bắt buộc ghi log lý do

## Architecture

```
lib/rules/
├── rules-engine.ts                     điều phối, chạy tuần tự các luật
├── rule-account-health.ts              nick còn sống, hết cold-start chưa
├── rule-target-eligibility.ts          đủ karma? đủ tuổi nick?
├── rule-daily-cap.ts                   quá số bài/ngày chưa
├── rule-target-cooldown.ts             đăng lại cùng sub quá sớm không
├── rule-promo-ratio.ts                 tỷ lệ 9:1
├── rule-content-similarity.ts          trùng nội dung cùng platform
├── rule-thread-collision.ts            2 nick đụng cùng thread
└── rule-link-policy.ts                 sub có cấm link không
```

Mỗi luật là 1 hàm thuần: `(ctx: RuleContext) => RuleVerdict`. Dễ test, dễ thêm luật mới.

```ts
export type RuleVerdict =
  | { level: 'ALLOW' }
  | { level: 'WARN';  reason: string }
  | { level: 'BLOCK'; reason: string };
```

### Thuật toán so trùng nội dung
```
1. Chuẩn hóa: lowercase, bỏ dấu câu, bỏ khoảng trắng thừa
2. Tách thành tập trigram ký tự
3. Jaccard = |giao| / |hợp|
4. So với mọi bài ĐÃ ĐĂNG cùng platform trong 30 ngày gần nhất
5. >= 0.70 → BLOCK ; 0.50-0.70 → WARN
```
Ngưỡng để trong config, chỉnh được không cần sửa code.

## Database Schema (bổ sung)

```prisma
model ContentItem {
  id         String   @id @default(cuid())
  title      String
  body       String
  links      String?                      // JSON array
  type       String                       // VALUE | PROMO
  authorName String                       // ai trong team viết
  createdAt  DateTime @default(now())
  jobs       PostJob[]
}

model PostJob {
  id             String   @id @default(cuid())
  contentItemId  String
  accountId      String
  targetId       String
  scheduledAt    DateTime
  status         String   @default("PENDING")  // PENDING|BLOCKED|POSTED|FAILED|SKIPPED
  ruleVerdicts   String?                       // JSON kết quả rules engine
  overrideReason String?                       // nếu người dùng ghi đè
  postedUrl      String?
  errorMessage   String?
  postedAt       DateTime?
  contentItem    ContentItem @relation(fields: [contentItemId], references: [id])
  @@index([accountId, scheduledAt])
}

model Interaction {                            // dùng cho chặn đụng độ
  id         String   @id @default(cuid())
  accountId  String
  targetId   String
  threadUrl  String
  kind       String                            // POST | COMMENT | UPVOTE
  at         DateTime @default(now())
  @@index([threadUrl])
  @@index([accountId, at])
}

model RuleConfig {                             // ngưỡng chỉnh được
  key   String @id
  value String
}
```

## 8 luật cụ thể

| # | Luật | Điều kiện BLOCK | WARN |
|---|---|---|---|
| 1 | Sức khỏe nick | status ≠ ALIVE | – |
| 2 | Cold start | `now < coldStartUntil` | còn < 2 ngày nữa hết |
| 3 | Đủ điều kiện sub | karma < `minKarma` hoặc tuổi nick < `minAccountAgeDays` | karma dư < 20% |
| 4 | Giới hạn ngày | nick đã đăng ≥ 2 bài hôm nay | đã đăng 1 bài |
| 5 | Nghỉ giữa lần đăng | đăng cùng sub trong < 24h | < 48h |
| 6 | Tỷ lệ promo | `type=PROMO` mà chưa đủ 9 `VALUE` ở sub đó | tỷ lệ đang 8:1 |
| 7 | Trùng nội dung | Jaccard ≥ 0.70 với bài cùng platform trong 30 ngày | 0.50-0.70 |
| 8 | Đụng độ thread | nick khác của mình đã tương tác `threadUrl` này | cùng sub trong 1h |

**Luật 6 và 8 là hai luật không nền tảng nào tha thứ.** Không cho phép override luật 8.

## Related Code Files

**Tạo mới:**
- `lib/rules/*` (9 file như sơ đồ trên)
- `lib/rules/content-similarity-calculator.ts` — trigram Jaccard
- `lib/rules/text-normalizer.ts`
- `app/content/page.tsx` — nhập & danh sách content
- `app/queue/page.tsx` — hàng đợi, hiện verdict từng job
- `app/queue/new/page.tsx` — tạo job, chạy rules realtime khi chọn nick/target
- `app/api/rules/preview/route.ts` — chạy thử rules, trả verdict
- `components/queue/rule-verdict-badge.tsx`

**Sửa:** `prisma/schema.prisma`

## Implementation Steps

1. Bổ sung schema, migrate.
2. Viết `text-normalizer.ts` + `content-similarity-calculator.ts` **kèm unit test trước**
   (2 câu giống hệt → 1.0; 2 câu khác hẳn → < 0.2; đổi vài từ → 0.6-0.8).
3. Viết từng luật một, mỗi luật 1 file + 1 test. Bắt đầu từ luật đơn giản (1,2,4) tới phức tạp (6,7,8).
4. Viết `rules-engine.ts` gộp: chạy tuần tự, gom hết verdict, mức nặng nhất thắng.
5. UI nhập content — form đơn giản, có nút "Dán từ clipboard".
6. UI tạo job: chọn content → chọn nick → chọn target → **rules chạy ngay, hiện đèn xanh/vàng/đỏ**
   kèm lý do. Nút "Đăng" bị khóa nếu đỏ, trừ khi bấm "Ghi đè" và nhập lý do.
7. UI hàng đợi: bảng job theo ngày, lọc theo trạng thái.
8. Bảng theo dõi tỷ lệ promo: mỗi cặp (nick × sub) hiện `7/9` chẳng hạn.
9. Nhập tương tác thủ công: form nhanh để bạn MKT ghi lại "vừa comment ở thread X"
   (Phase 05 sẽ tự ghi, giờ nhập tay).

## Todo List
- [ ] Schema bổ sung + migration
- [ ] Text normalizer + similarity calculator + test
- [ ] 8 luật, mỗi luật có test
- [ ] Rules engine gộp verdict
- [ ] UI nhập content
- [ ] UI tạo job có kiểm tra realtime
- [ ] UI hàng đợi
- [ ] Bảng tỷ lệ promo theo cặp nick × sub
- [ ] Form ghi tương tác thủ công
- [ ] Build sạch

## Success Criteria
- Thử tạo 2 job cùng nội dung cho 2 nick Reddit → job thứ 2 **bị chặn**, hiện lý do rõ ràng
- Thử đăng bài PROMO khi nick mới có 3 bài VALUE → **bị chặn**, hiện "còn thiếu 6 bài hữu ích"
- Thử cho 2 nick comment cùng 1 thread → **bị chặn**, không cho override
- Bạn MKT xếp lịch 15 bài trong < 15 phút

## Risk Assessment

| Rủi ro | Giảm thiểu |
|---|---|
| Luật quá chặt → bạn MKT ghi đè liên tục → vô dụng | Ngưỡng để trong `RuleConfig`, chỉnh được; theo dõi số lần override, nếu cao thì nới |
| Luật quá lỏng → vẫn shadowban | Bắt đầu chặt, nới dần theo số liệu Phase 03 |
| Trigram Jaccard bỏ sót bài "viết lại ý" | Chấp nhận ở GĐ1. Nếu Phase 03 cho thấy vẫn dính, nâng cấp lên embedding |
| Nhập tương tác thủ công hay quên | Phase 05 tự động hóa; trước đó nhắc trong quy trình hằng ngày |

## Security Considerations
- Content có thể chứa link sản phẩm → không log ra console ở production.
- Override phải ghi `AuditLog` kèm người thao tác và lý do.

## Next Steps
→ [Phase 03 — Theo dõi sức khỏe](phase-03-account-health-monitor.md)
