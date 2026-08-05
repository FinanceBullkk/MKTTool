# Phase 05 — Lên Railway + cron + sao lưu

## Context

- [plan.md](plan.md) — quyết định 9
- Phụ thuộc: [Phase 01](phase-01-postgres-va-mui-gio-team.md). Làm song song được với Phase 02-04
- [run-health-check.ts](../../scripts/run-health-check.ts),
  [health-check-lock.ts](../../src/lib/health/health-check-lock.ts)

## Overview

**Ưu tiên:** trung bình | **Trạng thái:** chưa làm | **Dự kiến:** 2-3 ngày

Đưa web lên Railway, chuyển bộ dò shadowban thành cron chạy trên đó, và dựng nếp sao lưu.

Kết quả: không ai trong team phải cài Playwright, không ai phải đặt Task Scheduler, và bộ dò
chạy đều kể cả khi mọi người tắt máy.

## Key Insights

- Bộ dò chạy trên Railway **tốt hơn** chạy trên máy cá nhân: máy luôn bật, lịch chạy một chỗ,
  không phụ thuộc ai nhớ bật máy.
- ~~Khóa file `data/health-check.lock` chỉ đúng khi **một máy duy nhất** chạy bộ dò~~ — **đã làm
  05/08/2026**, và đi khác chốt ban đầu: **một hàng trong bảng `HealthCheckLock`**, không phải
  advisory lock. Xem [ghi chú trong plan.md](plan.md#mười-một-quyết-định-đã-chốt) và chú thích
  model trong `schema.prisma`. Lý do ngắn: advisory lock hỏng **mở** (connection bị cắt là
  Postgres tự nhả khóa, lượt thứ hai chen vào được), và nó không mang được dữ liệu "ai đang giữ"
  nên vẫn phải kèm một hàng — hai cơ chế cho một khái niệm.
- Lượt dò đầy đủ nghỉ ngẫu nhiên 30-90 giây giữa các nick → 8 nick mất gần 10 phút. Cron phải
  chịu được tác vụ dài, không phải hàm serverless hết giờ giữa chừng.
- Playwright cần trình duyệt cài sẵn trong ảnh chạy — không tự có.

## Requirements

1. Web chạy trên Railway, HTTPS, deploy bằng cách đẩy code lên GitHub
2. Cron chạy `npm run health` mỗi ngày một lần theo `TEAM_TIMEZONE`
3. Playwright Chromium có sẵn trong môi trường chạy
4. Sao lưu tự động + một bản tải về được
5. Redirect URI Facebook khai lại theo domain thật

## Architecture

```
GitHub ──push──► Railway build ──► dịch vụ web (Next.js)
                              └──► cron mỗi ngày: npm run health
                                     └─ proxy quan sát viên → Reddit
                       Postgres (cùng dự án, nối nội bộ)
```

## Related Code Files

**Tạo:** `Dockerfile` — môi trường chạy kèm thư viện hệ thống cho Playwright
~~**Sửa:** [health-check-lock.ts](../../src/lib/health/health-check-lock.ts)~~ — **xong 05/08/2026.**
Khóa file → hàng trong bảng `HealthCheckLock`. Giữ nguyên ngưỡng mồ côi 30 phút; thông báo "ai
đang giữ" nay có thêm **tên máy** — từ lúc khóa bắc qua nhiều nơi, "tiến trình 4821" một mình
không nói được gì
**Sửa:** `.env.example` — thêm biến của môi trường chạy thật
**Sửa:** `docs/deployment-guide.md`

## Implementation Steps

1. Tạo dự án Railway, nối GitHub, thêm Postgres cùng dự án
2. Khai biến môi trường: `DATABASE_URL`, `VAULT_KEY_SERVER`, `TICKET_SIGNING_KEY` (khóa riêng
   ký vé), `TEAM_TIMEZONE`, biến Google, biến Facebook.
   **`VAULT_KEY_OPERATOR` KHÔNG được có mặt ở đây** — kiểm lại bằng mắt sau khi khai xong
3. Viết `Dockerfile` cài Chromium + thư viện hệ thống cho Playwright
4. Thử domain miễn phí của Railway làm redirect URI Facebook. Meta từ chối thì mua tên miền
5. Khai lại redirect URI trong Meta app; thêm cả team vào vai trò Tester
6. Cron chạy `npm run health` mỗi ngày, giờ tính theo `TEAM_TIMEZONE`
7. ~~Đổi khóa file sang advisory lock Postgres~~ **xong** — còn phép thử hai lượt chạy song song
   từ hai tiến trình thật (test tự động đã phủ phần logic; phép thử này kiểm cả đường mạng)
8. Bật sao lưu tự động của Railway; viết script `pg_dump` tải bản sao về máy
9. Chạy thử một lượt dò thật, xem log, xem kết quả vào `/health`

## Todo List

- [ ] Dự án Railway + Postgres + nối GitHub
- [ ] Khai biến môi trường; **xác nhận không có `VAULT_KEY_OPERATOR`**
- [x] `Dockerfile` + `.dockerignore` (05/08/2026) — **đã build thật và nghiệm thu trong container.**
  Ảnh **4.86 GB**, chạy bằng `pwuser` (không phải root). Dựng trên
  `mcr.microsoft.com/playwright:v1.62.1-noble`. Ba chốt lúc viết ở [dưới](#dockerfile--ba-chốt-đã-đóng);
  ba lỗi mà chính lượt build bắt được ở [đây](#build-thật-bắt-được-ba-lỗi-mà-test-không-thấy)
- [ ] Thử domain Railway với Facebook; mua tên miền nếu bị từ chối
- [ ] Redirect URI + cả team vào vai trò Tester
- [ ] Cron dò shadowban hằng ngày theo `TEAM_TIMEZONE`
- [x] ~~Advisory lock Postgres~~ **bảng `HealthCheckLock`** thay khóa file (05/08/2026) —
  còn nợ phép thử **hai tiến trình thật chạy song song**, làm ở bước 9 khi đã có Railway
- [ ] Sao lưu tự động + script tải bản sao về máy
- [ ] Chạy thử một lượt dò thật, kết quả lên `/health`

### Dockerfile — ba chốt đã đóng

**1. `playwright`, `tsx` và `prisma` chuyển từ `devDependencies` sang `dependencies`.** Đây là
sửa một khai báo **sai từ trước**, không phải nhượng bộ cho Docker: `health-check-process-launcher.ts`
sinh tiến trình dò bằng `tsx scripts/run-health-check.ts` **lúc chạy**, và tiến trình đó gọi
`chromium.launch()`. Bất kỳ ai cài bằng `npm ci --omit=dev` — cách cài production tiêu chuẩn, và
là mặc định của một số hãng — đều nhận một app mà nút "Dò cả đàn" sinh ra tiến trình chết ngay
dòng đầu, kèm `stdio: "ignore"` nuốt sạch câu lỗi. QĐ 9 đòi ảnh chạy được ở nhiều hãng, nên không
thể dựa vào việc hãng nào cũng cài cả devDependencies.

**2. Ảnh KHÔNG dùng `output: "standalone"`.** Cùng lý do: `standalone` chỉ gói những gì Next truy
vết được từ đồ thị import của nó, mà tiến trình dò không nằm trong đồ thị đó — nó được sinh ra
bằng `spawn`. Ảnh phải mang theo `src/`, `scripts/` và `tsx`. Ảnh to hơn, và đó là cái giá đã
biết của quyết định "lượt dò chạy ở tiến trình riêng".

**3. `TEAM_TIMEZONE` là ARG lúc BUILD, không phải biến lúc chạy.** `next.config.ts` nhúng nó
thẳng vào bundle vì ô chọn giờ là component client. Hệ quả phải ghi vào tài liệu vận hành: **đổi
múi giờ team thì phải build lại**, khởi động lại không đủ.

> Kèm theo: ảnh cài `postgresql-client` cho `pg_dump` — `db:backup` và bước tự sao lưu của
> `vault:rekey` đều gọi nó. Thiếu thì xoay khóa dừng ngay ở bước sao lưu.

### Build thật bắt được ba lỗi mà test không thấy

Cả ba đều **không** hiện ra trong 605 test, `typecheck` hay `lint` — vì cả ba đều chạy trong môi
trường *có* `.env` và trên máy Windows của dev. Chúng chỉ lộ ra ở nơi đắt nhất để phát hiện: lần
deploy đầu tiên.

**1. App không build được nếu thiếu `DATABASE_URL`.** `prisma-client.ts` dựng client ngay ở thân
module, nên chỉ cần **import** là đã đòi biến. `next build` phải nạp mọi route để đọc cấu hình
đoạn, mà `layout.tsx` → `SessionBadge` → `require-actor` → file đó, nên build dừng ở
`/_not-found`. Máy dev không thấy vì `next build` tự nạp `.env`; ảnh Docker cố ý **không** có
file đó. Đã sửa: dựng trễ bằng `Proxy` — không phải sửa hơn trăm chỗ gọi — kèm test canh. Tiện
thể gỡ luôn một tác dụng phụ âm thầm: trước đây import module này mở sẵn connection pool, kể cả
trong test không hỏi database câu nào.

**2. `RUN chown -R pwuser /app` một mình nó nặng 998 MB.** `chown` đụng metadata mọi file nên
Docker coi cả cây là đã đổi và chép lại nguyên `/app` thành tầng thứ hai — ảnh mang hai bản của
cùng một thứ. Thay bằng `COPY --chown` và đổi user trước khi chép. Ảnh **6.6 GB → 4.86 GB**.

**3. `pg_dump` của Ubuntu Noble là bản 16, server là 17.** `pg_dump` **từ chối** dump từ server
có major cao hơn nó — nên bản mặc định trông như cài xong nhưng hỏng đúng ngày cần sao lưu. Đã
chuyển sang kho PGDG lấy `postgresql-client-17`.
> **Quy tắc khi nâng cấp:** `pg_dump` phải có major ≥ major của server. Nâng Postgres lên 18 mà
> quên sửa `ARG PG_CLIENT_MAJOR` thì **mọi bản sao lưu im lặng ngừng chạy** — cùng họ rủi ro với
> luật firewall WebRTC ở GĐ6.

**Một giả thiết đã kiểm ra là SAI, ghi lại để khỏi ai đi lại:** `npm ci` trong ảnh **không** tải
trình duyệt lần hai. Ảnh nền đặt sẵn `PLAYWRIGHT_BROWSERS_PATH=/ms-playwright` nên bước cài của
gói `playwright` thấy đủ rồi thì bỏ qua.

**Còn 595 MB firefox + webkit trong ảnh nền, dự án không dùng bao giờ.** Bỏ được, nhưng phải rời
ảnh Playwright chính chủ sang tự cài thư viện hệ thống — **đề nghị để nguyên**: đổi 12% dung
lượng lấy một cơ chế hỏng vào ngày nâng cấp là lỗ, đúng nguyên tắc chọn của plan.

**Nghiệm thu đã chạy thật trong container** (không phải chỉ kiểm file có tồn tại): chạy bằng
`pwuser`, `tsx` v4.23.1, `prisma` CLI, `pg_dump` 17.10, `scripts/` và `src/` đủ, và **Chromium mở
được thật** — `chromium.launch()` rồi dựng một trang.

## Success Criteria

- Đẩy một commit lên GitHub → web tự cập nhật, không cần gõ lệnh
- Cron chạy đúng giờ, `/health` có bản ghi mới, ảnh chụp lưu đúng quy tắc (chỉ giữ khi khác "khỏe")
- Chạy `npm run health` từ **hai tiến trình cùng lúc** → lượt thứ hai bị từ chối kèm câu nói rõ
  ai đang giữ và giữ bao lâu rồi. Đúng kể cả khi hai tiến trình ở hai máy khác nhau
- Deploy được sang một hãng khác (Render/Fly) **chỉ bằng cùng `Dockerfile` đó**, không sửa code
- Tải được một bản sao lưu về máy và khôi phục thử được vào Postgres cục bộ

## Risk Assessment

| Rủi ro | Mức | Giảm thiểu |
|---|---|---|
| `VAULT_KEY_OPERATOR` lỡ khai lên máy chủ → phá Phase 03 | **cao** | Kiểm bằng mắt sau khi khai; thêm chốt chặn lúc khởi động: có biến đó thì **dừng app** |
| Playwright thiếu Chromium trong ảnh chạy | trung bình | Khai bước cài trong cấu hình build; chạy thử ở bước 8 |
| Meta từ chối domain miễn phí của Railway | trung bình | Mua tên miền (~12 USD/năm) |
| Cron bị cắt giữa chừng vì tác vụ dài | trung bình | Chọn kiểu dịch vụ chịu được tác vụ dài; khóa mồ côi tự hết sau 30 phút như hiện tại |

## Security Considerations

- Máy chủ chỉ giữ khóa **vùng máy chủ**; thêm chốt chặn tự dừng nếu phát hiện khóa operator
- `DATABASE_URL` dùng mạng nội bộ của Railway, không phơi Postgres ra internet
- Bản sao lưu chứa ciphertext — cất tách khỏi nơi cất khóa (hai nửa của một thứ)
- Biến môi trường chỉ ADMIN xem được trong bảng điều khiển Railway

## Next Steps

Xong → [Phase 06](phase-06-ban-giao-team.md).
