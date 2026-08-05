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
- [ ] `Dockerfile` — Chromium + thư viện hệ thống cho Playwright
- [ ] Thử domain Railway với Facebook; mua tên miền nếu bị từ chối
- [ ] Redirect URI + cả team vào vai trò Tester
- [ ] Cron dò shadowban hằng ngày theo `TEAM_TIMEZONE`
- [x] ~~Advisory lock Postgres~~ **bảng `HealthCheckLock`** thay khóa file (05/08/2026) —
  còn nợ phép thử **hai tiến trình thật chạy song song**, làm ở bước 9 khi đã có Railway
- [ ] Sao lưu tự động + script tải bản sao về máy
- [ ] Chạy thử một lượt dò thật, kết quả lên `/health`

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
