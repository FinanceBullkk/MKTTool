# Phase 03 — Theo dõi sức khỏe tài khoản

## Context Links
- [plan.md](plan.md) | [Phase 01](phase-01-identity-vault.md) | [Phase 02](phase-02-content-queue-and-safety-rules.md)

## Overview
- **Priority:** P1 — làm ngay sau Phase 02, vì đây là thứ đo được hệ thống có hoạt động không
- **Status:** ✅ Xong 03/08/2026. Còn chờ mua proxy quan sát viên + nick thật để chạy tuyến cuối
- **Thời lượng:** 4-5 ngày

## Đã làm khác kế hoạch — và vì sao

Ba chỗ lệch so với bản kế hoạch gốc, cả ba đều do đo thực tế chứ không phải đổi ý:

**1. `checkpoint-detector` phân biệt "ai bị chặn".** Kế hoạch gốc gộp captcha vào chung với
"nick dính checkpoint". Sai nguy hiểm: bộ dò xem trang ở chế độ chưa đăng nhập, nên captcha là
tin về **proxy quan sát viên**, không phải về nick. Gộp lại thì mỗi lần Reddit bóp proxy là cả
đàn nick khỏe bị cách ly cùng lúc. Giờ tín hiệu có `scope: ACCOUNT | PROBE`, và `PROBE` cho ra
`ERROR` chứ không cho ra `CHECKPOINT`.

**2. Tín hiệu shadowban là HTTP 404, không phải câu chữ.** Kế hoạch gốc dựa vào câu *"nobody on
Reddit goes by that name"*. Đo trên Reddit thật 03/08/2026: **câu đó không còn nữa**, trang 404
giờ là "page not found" thường và vẫn có đủ header, thanh điều hướng, ô đăng nhập. Bản parser
đầu tiên nhận nhầm nó là "profile rỗng" — tức nick chết mà báo còn sống. Mã HTTP là thứ ổn định
hơn câu chữ nên giờ nó là tín hiệu chính.

**3. Tách `reddit-shadowban-prober` thành parser thuần + lớp trình duyệt.** Kế hoạch gốc gộp làm
một. Tách ra thì toàn bộ việc đọc HTML test được bằng HTML mẫu, không cần mạng — và đó chính là
chỗ bắt được cả hai lỗi trên.

Ngoài ra `reddit-karma-reader.ts` không tồn tại thành file riêng: karma nằm ngay trong sidebar
của cùng trang profile, đọc riêng là tải trang hai lần vô ích.

## Kết quả kiểm chứng 03/08/2026

`npm run health:smoke` — **17/17 đạt**:
- Phần A (không chạm mạng): ghi bản ghi dò → ép trạng thái nick → bộ luật Phase 02 chặn job,
  AuditLog có ghi, dò khỏe không tự gỡ cách ly, giữ đủ lịch sử.
- Phần B (Reddit thật, không cần nick/proxy): đọc được karma 940.312 của `u/spez`, đếm được
  2 bài + 23 comment, tên không tồn tại trả 404 → `MISSING` → `SHADOWBANNED`.

Toàn tuyến qua **proxy thật** (Webshare GB) cũng đã chạy: mở phiên, tải trang, đọc karma,
chụp ảnh, ra kết luận.

**Chưa kiểm được:** lượt `npm run health` với proxy quan sát viên đã mua riêng và nick Reddit
thật. Cả hai đều là chặn đường của GĐ0 (mua), không phải của code.

## Key Insights

1. **Không đo thì không biết mình đang thắng hay thua.** Shadowban im lặng — bài vẫn hiện với
   chính mình, người khác không thấy. Không có bộ dò thì 3 tháng sau mới phát hiện cả cụm đã chết.
2. **Reddit dễ dò nhất trong các nền tảng:** mở `reddit.com/user/<tên>` ở chế độ chưa đăng nhập.
   Trống hoặc 404 = shadowban toàn cục. So sánh số bài thấy được với số bài thực đăng = shadowban từng bài.
3. **Bộ dò phải chạy từ IP sạch, tách biệt.** Dùng chính proxy của nick để dò là sai —
   phải là góc nhìn của người ngoài. Cần 1 proxy riêng "quan sát viên", không gắn nick nào.
4. **Gặp captcha/checkpoint = nick đã bị nghi ngờ.** Không tự giải. Cách ly, báo người.
   Tự giải để chui vào tiếp là cách nhanh nhất biến cảnh báo mềm thành khóa vĩnh viễn.
5. Karma Reddit là chỉ số sức khỏe tốt: karma tăng đều = nick đang được cộng đồng chấp nhận;
   karma đứng yên dù có đăng = dấu hiệu bị ẩn.

## Requirements

### Functional
- Dò shadowban Reddit hằng ngày cho từng nick, từ proxy quan sát viên
- Đối chiếu: số bài/comment nhìn thấy được từ ngoài vs số đã đăng trong `PostJob`
- Cập nhật karma từng nick
- Phát hiện checkpoint/captcha khi mở profile → tự đổi `status = CHECKPOINT`, chụp màn hình, dừng mọi job
- Dashboard: mỗi nick 1 dòng, đèn xanh/vàng/đỏ, biểu đồ karma 30 ngày
- Cảnh báo: nick chuyển trạng thái xấu → hiện nổi bật trên trang chủ

### Non-functional
- Chạy hết 8 nick trong < 10 phút
- Proxy quan sát viên tách hoàn toàn, không bao giờ dùng để đăng nhập

## Architecture

```
lib/health/
├── health-check-runner.ts             điều phối, chạy lần lượt từng nick
├── reddit-shadowban-prober.ts         mở profile ẩn danh, đếm bài thấy được
├── reddit-karma-reader.ts             đọc karma
├── checkpoint-detector.ts             nhận diện màn hình captcha/checkpoint
└── health-status-evaluator.ts         quy đổi kết quả thành trạng thái + mức cảnh báo
```

Dùng Playwright **không qua antidetect** cho bộ dò — đây là truy cập ẩn danh công khai, không cần
giả vân tay, chỉ cần proxy quan sát viên và User-Agent bình thường.

### Cách dò shadowban Reddit
```
1. Mở https://www.reddit.com/user/<username>/ ở context sạch, qua proxy quan sát viên
2. Trang 404 / "nobody on Reddit goes by that name" → SHADOWBANNED (toàn cục)
3. Trang hiện nhưng rỗng → SHADOWBANNED
4. Trang hiện: đếm số bài + comment public trong 7 ngày qua
5. So với số PostJob status=POSTED trong 7 ngày
   - thấy < 50% → nghi shadowban từng bài → WARN
   - thấy 0 mà đã đăng > 0 → SHADOWBANNED
```

### Nhận diện checkpoint
Kiểm tra sau khi mở profile, trước khi làm bất cứ việc gì:
- URL chứa `/checkpoint`, `/challenge`, `/quarantine`, `/suspended`
- DOM có iframe Arkose/hCaptcha/reCAPTCHA
- Reddit: có text "your account has been suspended" / yêu cầu xác minh email lại
- Facebook: có form upload giấy tờ hoặc video selfie

→ Chụp màn hình lưu `data/screenshots/<accountId>-<timestamp>.png`, set `status=CHECKPOINT`,
`quarantineReason`, đóng browser, **không thao tác gì thêm**.

## Database Schema (bổ sung)

```prisma
model HealthCheck {
  id             String   @id @default(cuid())
  accountId      String
  checkedAt      DateTime @default(now())
  shadowbanned   Boolean  @default(false)
  karma          Int?
  visiblePosts   Int?                       // đếm được từ ngoài
  expectedPosts  Int?                       // theo PostJob
  verdict        String                     // HEALTHY | WARN | SHADOWBANNED | CHECKPOINT | ERROR
  detail         String?
  screenshotPath String?
  @@index([accountId, checkedAt])
}

model ObserverProxy {                        // proxy riêng để dò, không gắn nick
  id       String @id @default(cuid())
  host     String
  port     Int
  username String
  passwordEnc String
  country  String
}
```

## Related Code Files

**Tạo mới:**
- `lib/health/*` (5 file như sơ đồ)
- `scripts/run-health-check.ts` — chạy tay bằng `npm run health`
- `app/page.tsx` — dashboard trang chủ (thay trang mặc định)
- `app/health/page.tsx` — lịch sử kiểm tra
- `app/api/health/run/route.ts` — nút "Kiểm tra ngay"
- `components/health/account-health-row.tsx`
- `components/health/karma-trend-chart.tsx`

**Sửa:**
- `prisma/schema.prisma`
- `lib/rules/rule-account-health.ts` — đọc thêm kết quả HealthCheck mới nhất

## Implementation Steps

1. Bổ sung schema, migrate. Mua thêm 1 proxy quan sát viên, nhập vào hệ thống.
2. Viết `checkpoint-detector.ts` trước — dùng được ngay cho Phase 01/05.
3. Viết `reddit-shadowban-prober.ts`: Playwright mở context sạch qua proxy quan sát viên.
   Test tay với 1 nick khỏe và (nếu có) 1 nick đã chết để đối chiếu.
4. Viết `reddit-karma-reader.ts` — đọc karma từ trang profile công khai.
5. Viết `health-status-evaluator.ts` quy đổi ra verdict.
6. Viết `health-check-runner.ts`: chạy lần lượt, **giãn ngẫu nhiên 30-90 giây giữa các nick**
   (dò 8 nick liên tiếp từ 1 IP cũng là hành vi bất thường).
7. Dashboard: bảng nick + đèn trạng thái + karma + lần kiểm tra cuối. Nick đỏ đẩy lên đầu.
8. Biểu đồ karma 30 ngày (dùng `recharts` hoặc SVG tự vẽ — không cần thư viện nặng).
9. Nút "Kiểm tra ngay" + hướng dẫn đặt lịch chạy hằng ngày bằng Task Scheduler (Windows).

## Todo List
- [ ] **Mua proxy quan sát viên riêng** — việc duy nhất còn lại, và là việc mua chứ không phải code
- [x] Schema HealthCheck + ObserverProxy
- [x] Checkpoint detector (có phân biệt ACCOUNT / PROBE)
- [x] Reddit shadowban prober (parser thuần tách khỏi lớp trình duyệt)
- [x] Đọc karma — gộp vào parser, không tách file riêng
- [x] Health status evaluator
- [x] Runner có giãn ngẫu nhiên 30-90 giây
- [x] UI nhập proxy quan sát viên ở /proxies
- [x] Dashboard trang chủ + trang /health + biểu đồ karma SVG
- [x] Nút "Dò lại ngay" (một nick) qua `POST /api/health/run`
- [x] Nối kết quả vào bộ luật — thành **luật 10** riêng, không nhét vào luật 1
- [x] `npm run health` + `npm run health:smoke`
- [ ] Đặt lịch chạy hằng ngày bằng Task Scheduler — làm sau khi có proxy quan sát viên

## Success Criteria
- Chạy 1 lệnh → có báo cáo sức khỏe 8 nick trong < 10 phút
- Cố tình dùng 1 nick đã chết → hệ thống báo `SHADOWBANNED` đúng
- Nick dính checkpoint → tự cách ly, Phase 02 tự động chặn mọi job của nick đó
- Có biểu đồ karma cho thấy xu hướng từng nick

## Risk Assessment

| Rủi ro | Giảm thiểu |
|---|---|
| Reddit đổi HTML → bộ dò hỏng thầm lặng | Nếu không parse được thì trả `ERROR`, **không trả HEALTHY**. Cảnh báo rõ |
| Proxy quan sát viên bị Reddit chặn | Dùng proxy residential riêng, giãn thời gian, chỉ 8-10 lượt/ngày |
| Dò quá thường xuyên → chính bộ dò bị nghi | 1 lần/ngày là đủ, không dò mỗi giờ |
| Đếm bài sai do phân trang | Chỉ đếm trong 7 ngày gần nhất, trang đầu là đủ |

## Security Considerations
- Ảnh chụp màn hình có thể chứa thông tin nick → thư mục `data/screenshots/` vào `.gitignore`.
- Proxy quan sát viên **tuyệt đối không** dùng để đăng nhập bất kỳ nick nào, kể cả 1 lần.

## Next Steps
→ [Phase 04 — Facebook Pages](phase-04-facebook-pages-publisher.md) (nếu chưa làm)
→ [Phase 05 — Tự động đăng Reddit](phase-05-reddit-posting-automation.md)
