# Phase 05 — Bán tự động đăng Reddit

**Chỉ bắt đầu khi Phase 00-03 đã chạy ổn ít nhất 2 tuần với thao tác thủ công.**

## Context Links
- [plan.md](plan.md) | [Phase 00](phase-00-preparation-and-feasibility-check.md) |
  [Phase 02](phase-02-content-queue-and-safety-rules.md) | [Phase 03](phase-03-account-health-monitor.md)

## Overview
- **Priority:** P2 — làm cuối cùng, giá trị thấp nhất, rủi ro cao nhất
- **Status:** ⬜ Chưa bắt đầu
- **Thời lượng:** 7-10 ngày
- **Mục đích:** tự đăng bài/comment Reddit qua antidetect browser, thay vì bạn MKT dán tay.

> ### ⚠️ Cần viết lại phần kỹ thuật trước khi bắt đầu (ghi 02/08/2026)
>
> Kế hoạch dưới đây giả định **Playwright + `connectOverCDP`**. Giả định đó đã sai:
> MultiZen không phơi endpoint CDP ra ngoài, mà phơi thẳng tool điều khiển qua MCP —
> `navigate`, `click`, `type`, `extract`, `screenshot`. Xem [kết luận ở Phase 00](phase-00-preparation-and-feasibility-check.md).
>
> Ảnh hưởng tới phần này:
>
> - **Bỏ `connectOverCDP` và `browser-session-manager.ts`** — gọi tool MCP qua adapter sẵn có.
> - **Insight số 5 tự giải quyết:** MultiZen lo nhịp gõ ở tầng CDP input, nên không còn chuyện
>   "chồng hai tầng gõ chậm". Dùng tool `type` của nó, bỏ `pressSequentially`.
> - **Human handoff có sẵn:** gặp 2FA/CAPTCHA thì người vào tay ngay trong cửa sổ đó rồi máy chạy
>   tiếp — đúng cái "bán tự động" mà insight số 2 mô tả, không phải tự dựng.
> - Selector vẫn là rủi ro như cũ, xử lý không đổi: không thấy nút thì chụp màn hình, dừng, báo người.
>
> Đổi lại thì phase này **nhẹ hơn** dự kiến, không nặng hơn.

## Key Insights

1. **Đây là phần ít giá trị nhất.** 15-20 bài/ngày làm tay mất ~1 tiếng. Tự động hóa tiết kiệm
   ~45 phút/ngày nhưng chiếm 80% công sức code và gần như toàn bộ rủi ro ban. Làm cuối là đúng.
2. **"Bán tự động" chứ không phải "tự động".** Tool soạn sẵn, mở profile, điền nội dung, **dừng lại
   chờ người bấm nút cuối**. Người vẫn nhìn thấy màn hình trước khi đăng. Cách này giữ được phần lớn
   lợi ích mà tránh được kịch bản bot đăng bậy hàng loạt lúc 3 giờ sáng.
3. **`page.type()` đã deprecated.** Dùng `locator.pressSequentially(text, { delay })`.
   Và delay **phải ngẫu nhiên** — gõ đều đúng 100ms là dấu hiệu bot rõ hơn cả dán nguyên đoạn.
4. Từ 2026 Reddit thêm nhận diện hành vi: nhịp gõ phím, thói quen vote, thời gian ở lại trang.
5. **MultiZen tự nhận là đã nhân bản hóa nhịp gõ ở tầng CDP.** Nếu vậy thì Playwright gõ chậm nữa là
   thừa hoặc phá. Phải xác định rõ tầng nào lo việc này — chọn một, không chồng hai.
6. Selector Reddit đổi thường xuyên → **không tìm thấy nút thì chụp màn hình, dừng, báo người.**
   Tuyệt đối không thử lại nhiều lần.

## Requirements

### Functional
- Adapter Reddit: đăng bài (text/link), đăng comment vào thread
- Mở profile qua antidetect adapter (Phase 01) → `connectOverCDP`
- Điều hướng tự nhiên: vào trang chủ → tìm sub → không `page.goto` thẳng vào form đăng
- Gõ nội dung với delay ngẫu nhiên
- **Chế độ mặc định: dừng trước khi bấm nút đăng cuối cùng, chờ người xác nhận**
- Chế độ tự động hoàn toàn: chỉ bật cho content `type=VALUE`, có công tắc riêng
- Chạy `checkpoint-detector` (Phase 03) ngay sau khi mở profile, trước mọi thao tác
- Tự ghi `Interaction` sau khi đăng thành công (thay cho nhập tay ở Phase 02)
- Lỗi → chụp màn hình + ghi log + đóng browser, không thử lại

### Non-functional
- Chỉ 1 browser mở tại một thời điểm (`concurrency: 1` ở GĐ này)
- Mỗi phiên tối đa 5 phút, quá thì hủy
- Mọi thao tác ghi `AuditLog`

## Architecture

```
lib/automation/
├── browser-session-manager.ts        mở/đóng profile, connectOverCDP, khóa 1 phiên/lúc
├── human-behavior.ts                 delay ngẫu nhiên, cuộn tự nhiên, nghỉ giữa thao tác
├── reddit/
│   ├── reddit-post-publisher.ts      đăng bài mới
│   ├── reddit-comment-publisher.ts   đăng comment
│   ├── reddit-navigator.ts           điều hướng tự nhiên tới sub/thread
│   └── reddit-selectors.ts           gom toàn bộ selector vào 1 chỗ để dễ sửa khi Reddit đổi UI
└── session-lock.ts                   khóa theo accountId, không cho 2 job cùng nick chạy song song
```

**Tách `reddit-selectors.ts` riêng là bắt buộc** — Reddit đổi giao diện liên tục, gom selector vào
1 file để sửa 1 chỗ thay vì lục khắp codebase.

### Quy tắc hành vi
```ts
// human-behavior.ts
randomDelay(min, max)                    // nghỉ giữa các thao tác
typeHumanLike(locator, text)             // pressSequentially, delay 60-180ms ngẫu nhiên,
                                         // nghỉ dài hơn ở dấu câu, thỉnh thoảng xóa 1 ký tự rồi gõ lại
scrollNaturally(page, durationMs)        // cuộn từng đoạn, có dừng đọc
warmUpBeforeAction(page)                 // vào trang chủ, cuộn 20-40s trước khi làm việc chính
```

### Luồng đăng 1 bài
```
1. session-lock: giành khóa cho accountId (nếu bận → hoãn job)
2. Rules engine chạy lại lần cuối (dữ liệu có thể đã đổi từ lúc xếp lịch)
3. Mở profile antidetect → connectOverCDP
4. checkpoint-detector → nếu dính: cách ly nick, dừng, báo người, KẾT THÚC
5. warmUpBeforeAction: cuộn trang chủ 20-40s
6. reddit-navigator: tìm sub qua thanh search, không goto thẳng
7. Mở form đăng, gõ title rồi body bằng typeHumanLike
8. CHẾ ĐỘ MẶC ĐỊNH: dừng lại, hiện thông báo "sẵn sàng đăng, bấm xác nhận"
   CHẾ ĐỘ TỰ ĐỘNG: bấm đăng luôn
9. Xác minh đăng thành công (lấy URL bài)
10. Ghi PostJob.postedUrl, PostJob.status=POSTED, tạo Interaction
11. Nghỉ ngẫu nhiên 10-30s, đóng browser, nhả khóa
```

## Database Schema (bổ sung)

```prisma
model AutomationRun {
  id           String   @id @default(cuid())
  postJobId    String
  startedAt    DateTime @default(now())
  finishedAt   DateTime?
  outcome      String                       // SUCCESS | CHECKPOINT | SELECTOR_NOT_FOUND | TIMEOUT | CANCELLED
  screenshotPath String?
  logText      String?
}
```

## Related Code Files

**Tạo mới:** `lib/automation/*` (8 file như sơ đồ), `app/api/automation/run/route.ts`,
`app/automation/page.tsx` (bảng điều khiển chạy job + xem log), `components/automation/run-log-viewer.tsx`

**Sửa:** `prisma/schema.prisma`, `app/queue/page.tsx` (thêm nút "Chạy job này")

## Implementation Steps

1. **Xác định tầng lo nhịp gõ.** Test: gõ bằng MultiZen tự lo vs Playwright `pressSequentially`.
   Chọn 1, ghi quyết định vào code comment.
2. `session-lock.ts` — khóa theo accountId trong bộ nhớ (1 process nên đủ, không cần Redis).
3. `browser-session-manager.ts` — mở profile, `connectOverCDP`, timeout 5 phút, luôn đóng ở `finally`.
4. `human-behavior.ts` + test bằng mắt (chạy headful, xem có giống người không).
5. `reddit-selectors.ts` — thu thập selector từ Reddit hiện tại, ghi chú ngày cập nhật.
6. `reddit-navigator.ts` — điều hướng qua search, không goto thẳng.
7. `reddit-comment-publisher.ts` **trước** `reddit-post-publisher.ts` — comment ít rủi ro hơn,
   dùng để test luồng.
8. Chạy thử comment ở 1 sub nháp (r/test) bằng 1 nick, chế độ mặc định (chờ xác nhận).
9. Làm `reddit-post-publisher.ts` tương tự.
10. Nối vào hàng đợi: nút "Chạy job này" ở trang queue.
11. Xử lý lỗi: mọi nhánh lỗi đều phải chụp màn hình + ghi `AutomationRun` + đóng browser.
12. Chạy thật 1 tuần ở chế độ chờ xác nhận trước khi cân nhắc bật tự động hoàn toàn.

## Todo List
- [ ] Chốt tầng xử lý nhịp gõ (MultiZen vs Playwright)
- [ ] Session lock theo accountId
- [ ] Browser session manager + timeout + đóng chắc chắn
- [ ] Human behavior module
- [ ] Reddit selectors (gom 1 file)
- [ ] Reddit navigator (điều hướng tự nhiên)
- [ ] Comment publisher + test ở r/test
- [ ] Post publisher + test ở r/test
- [ ] Nối vào hàng đợi, nút chạy job
- [ ] Xử lý lỗi + chụp màn hình đầy đủ
- [ ] Tự ghi Interaction sau khi đăng
- [ ] Chạy thật 1 tuần chế độ chờ xác nhận

## Success Criteria
- Đăng được comment và bài lên r/test bằng 1 nick, đúng IP, không dính captcha
- Selector không tìm thấy → dừng gọn, có ảnh chụp màn hình, nick không bị ảnh hưởng
- 2 job cùng nick không bao giờ chạy song song
- Sau 1 tuần chạy thật: 0 nick chuyển sang CHECKPOINT do lỗi automation

## Risk Assessment

| Rủi ro | Khả năng | Ảnh hưởng | Giảm thiểu |
|---|---|---|---|
| Reddit đổi UI → selector hỏng | Cao | Trung bình | Gom 1 file; hỏng thì dừng chứ không click bừa |
| Bot bị nhận diện qua nhịp gõ | Trung bình | Cao | Delay ngẫu nhiên; chốt 1 tầng xử lý; chạy thử ở sub nháp trước |
| ~~MultiZen không nối được Playwright~~ | — | — | Đã giải ở Phase 00 (02/08/2026): dùng tool MCP của MultiZen, bỏ Playwright |
| Bật tự động hoàn toàn quá sớm → đăng bậy hàng loạt | Trung bình | Rất cao | Mặc định chờ xác nhận; tự động chỉ cho `type=VALUE`; có công tắc tắt khẩn cấp |
| Job treo, browser không đóng | Trung bình | Thấp | Timeout 5 phút, `finally` luôn đóng, dọn tiến trình mồ côi khi khởi động |

## Security Considerations
- Không log mật khẩu/OTP vào `AutomationRun.logText` — lọc trước khi ghi.
- Ảnh chụp màn hình có thể chứa nội dung riêng tư → `data/screenshots/` trong `.gitignore`.
- Công tắc tắt khẩn cấp: 1 biến trong `RuleConfig`, bật lên là mọi job dừng ngay.

## Next Steps
Sau Phase 05, nếu cần chạy 24/7 thì mới cân nhắc:
- Chuyển sang VPS (nhớ `--shm-size=2gb` cho Docker, nếu không Chromium sẽ crash)
- Thêm BullMQ + Redis cho lịch chạy nền
- **Chỉ làm khi đã có số liệu chứng minh Reddit ra lead thật.** Trước đó là tối ưu sớm.
