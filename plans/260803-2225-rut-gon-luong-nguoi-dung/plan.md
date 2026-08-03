# Rút gọn luồng người dùng — 3 thay đổi

**Tạo:** 03/08/2026 · **Trạng thái:** ✅ Xong (03/08/2026) · **Ưu tiên:** P1

## Vì sao

Nav xếp 9 trang cùng trọng số, nhưng chúng thuộc hai thế giới: 3 trang dùng **mỗi ngày**,
6 trang dựng **một lần rồi quên**. Người dùng không có gì để phân biệt, nên mỗi lần đăng một
bài đều có cảm giác phải đi qua cả 9 trang.

Đo thật, mỗi bài Reddit hiện đi qua **4 trang MKTTool**:
`/content` → `/queue/new` → `/` (thẻ Đăng tay) → `/queue` (bấm "Đã đăng").
Mục tiêu sau khi sửa: **2 trang**.

Ba thay đổi dưới đều **không đụng schema, không đụng bộ luật**.

---

## Thay đổi 1 — Nav 9 mục → 4, chia theo tần suất

**File:** [src/app/layout.tsx](../../src/app/layout.tsx) (`NAV_ITEMS`, dòng 10-20)

Cấu trúc mới:

```
HÔM NAY  ·  HÀNG ĐỢI  ·  SỨC KHỎE  ·  KHO ▾
   /          /queue      /health      ├─ /accounts   Nick
                                       ├─ /personas   Nhân vật
                                       ├─ /proxies    Proxy
                                       ├─ /targets    Đích đăng
                                       ├─ /content    Content
                                       └─ /facebook   Facebook
```

- Đổi nhãn `Tổng quan` → **`Hôm nay`** (nói rõ trang trả lời câu gì).
- **Không xóa route nào**, chỉ đổi trọng số hiển thị. Mọi link hiện có vẫn chạy.
- Dropdown "Kho" phải mở được bằng bàn phím và có `:focus-visible` rõ.

**Xong khi:** nav còn 4 mục cấp 1; 6 trang kho vào được qua dropdown; không link nào chết.

---

## Thay đổi 2 — Thẻ "Đăng tay" khép kín tại chỗ

**File chính:** [src/components/queue/manual-post-reminders.tsx](../../src/components/queue/manual-post-reminders.tsx)

Thẻ hiện có `Mở profile` · `Copy tiêu đề` · `Copy thân bài`, nhưng đăng xong phải sang
`/queue` mới bấm được "Đã đăng". Một hop thừa đúng vào bước dễ quên nhất — quên là vòng
phản hồi đứt, bộ luật mù mà không có gì báo.

**Cách làm — tái dùng, đừng viết mới:**

- [src/components/queue/job-row-actions.tsx](../../src/components/queue/job-row-actions.tsx)
  đã có sẵn nút "Đã đăng" + ô nhập link.
- [src/lib/queue/post-job-status-actions.ts:24](../../src/lib/queue/post-job-status-actions.ts#L24)
  đã có `markJobPosted(jobId, postedUrl)`.

Việc cần làm: nhúng phần "Đã đăng + ô link" vào thẻ nhắc việc. Nếu `JobRowActions` nhúng
thẳng được thì dùng luôn; nếu không, tách phần đó ra một component con dùng chung cho
cả hai chỗ — **không nhân bản logic**.

**Xong khi:** đăng một bài Reddit/Group không cần rời trang `Hôm nay`; job chuyển sang
`POSTED` và `postedUrl` lưu đúng; trang `/queue` vẫn bấm "Đã đăng" được như cũ.

---

## Thay đổi 3 — Gõ content thẳng ở trang xếp lịch

**Files:**
- [src/components/queue/post-job-composer.tsx](../../src/components/queue/post-job-composer.tsx)
- [src/lib/queue/post-job-actions.ts:20](../../src/lib/queue/post-job-actions.ts#L20) — schema đang ép `contentItemId`
- [src/app/api/rules/preview/route.ts:15](../../src/app/api/rules/preview/route.ts#L15) — schema đang ép `contentItemId`
- [src/lib/queue/post-job-rule-preview.ts](../../src/lib/queue/post-job-rule-preview.ts)

Trang xếp lịch chỉ có dropdown chọn content có sẵn. Muốn đăng bài mới là phải sang
`/content` tạo trước rồi quay lại.

**Phần khó đã xong:** bộ luật hỗ trợ sẵn content nháp —
`ContentSource = { contentItemId } | { draft }` ở
[rule-context-builder.ts:27-29](../../src/lib/rules/rule-context-builder.ts#L27-L29).
Thiếu là hai schema ở tầng trên chặn nhánh `draft` lại.

**Cách làm:** thêm hai tab **`Viết mới` | `Chọn từ kho`** vào composer, rồi nới hai schema
đó thành union chấp nhận cả `draft`.

> ### ⚠️ Ràng buộc bắt buộc: nháp phải được LƯU thành `ContentItem` khi tạo job
>
> Không được để job trỏ vào một content ảo. Luật 7 (trùng nội dung) so bài mới với các
> `ContentItem` đã có trong 30 ngày — content không nằm trong kho thì luật đó **mù dần**
> theo mỗi bài viết thẳng.
>
> Nhánh `draft` chỉ nới cho **xem thử verdict**. Lúc bấm lưu thì `createPostJob` tạo
> `ContentItem` trước, rồi tạo job trỏ vào nó. Người dùng không phải sang `/content`, nhưng
> kho content vẫn đầy đủ.

**Xong khi:** viết content mới ngay ở `/queue/new` và lưu job trong một lần; đèn luật hiện
realtime cho cả hai tab; content vừa viết xuất hiện ở `/content`; đường "Chọn từ kho" giữ
nguyên hành vi cũ.

---

## Không làm ở lần này

- **Không gộp Nhân vật vào trang Nick.** Schema là `accounts Account[]` — một nhân vật dùng
  được cho nhiều nick. Gộp là ép sai mô hình. (Proxy và profile thì `@unique` nên 1:1 thật,
  gộp được — nhưng để lần sau.)
- Không đụng schema, không đụng migration, không thêm dependency.
- Không đổi tên route.

## Kiểm chứng

```bash
npm run typecheck && npm run lint && npm test
npm run rules:smoke     # bộ luật không được đổi hành vi
```

Rồi chạy tay trên `npm run dev` (mở bằng `http://localhost:3000`, không phải `127.0.0.1`):
xếp lịch một bài bằng tab "Viết mới" → xem đèn luật → lưu → vào `Hôm nay` bấm "Đã đăng"
kèm link → kiểm `PostJob.status = POSTED` và `postedUrl` đã lưu.

## Todo

- [x] TĐ1 — gom nav 9 → 4, đổi nhãn "Tổng quan" → "Hôm nay"
- [x] TĐ2 — nhúng "Đã đăng" + ô link vào thẻ nhắc việc (tách `MarkPostedControl` dùng chung)
- [x] TĐ3a — nới schema `createPostJob` + route preview để nhận `draft`
- [x] TĐ3b — thêm tab "Viết mới / Chọn từ kho" vào composer
- [x] TĐ3c — `createPostJob` lưu nháp thành `ContentItem` trước khi tạo job
- [x] Chạy typecheck + lint + test (358) + `rules:smoke` (6/6) + `next build`
- [ ] Chạy tay đủ vòng, đếm lại số trang mỗi bài (mục tiêu: 2) — phần của người dùng

## Câu hỏi đã chốt

1. **Tab mặc định ở `/queue/new`: "Chọn từ kho", trừ khi kho trống thì mở thẳng "Viết mới".**
   Mặc định không được tự ý ghi dữ liệu: mở sẵn "Viết mới" thì người định tái dùng bài cũ dễ gõ
   lại thành bài mới, kho sinh bản gần-trùng, và luật 7 bắt đầu kêu vì chính rác mình tạo ra.
   Đổi tab tốn một cú bấm; dọn kho tốn nhiều hơn thế. Kho trống thì "Chọn từ kho" là ngõ cụt nên
   lật mặc định — một dòng, không phải mẹo.
2. **"Kho" là dropdown, không làm trang `/kho`.** Trang mục lục thêm đúng một hop vào luồng vừa
   bỏ công rút ngắn, lại thêm route mới trong khi ràng buộc là không đổi route. Sáu mục thì
   dropdown đủ; nếu sau này kho vượt ~8 mục hoặc mỗi mục cần mô tả thì mới tính tới trang riêng.

## Đã làm khác plan (có lý do)

- Đổi luôn tiêu đề trang chủ `Tổng quan` → `Hôm nay`: bấm nav "Hôm nay" mà trang ghi "Tổng quan"
  là hai tên cho một chỗ.
- `markJobPosted` revalidate thêm `/`: thẻ nhắc việc giờ nằm ở trang chủ, bấm xong phải biến mất.
- Trang `/queue/new` không còn đòi kho có content mới cho vào — tab "Viết mới" tự lo được.
- Thêm `src/lib/queue/post-job-actions.database.test.ts` khóa ràng buộc "nháp phải vào kho".
