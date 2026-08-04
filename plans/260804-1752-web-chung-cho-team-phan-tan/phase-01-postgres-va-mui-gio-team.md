# Phase 01 — Postgres + múi giờ team

## Context

- [plan.md](plan.md) — quyết định 8, 9
- [prisma-client.ts](../../src/lib/db/prisma-client.ts), [prisma.config.ts](../../prisma.config.ts)
- [vitest.global-setup.ts](../../vitest.global-setup.ts)
- [vietnamese-date-format.ts](../../src/lib/format/vietnamese-date-format.ts)

## Overview

**Ưu tiên:** cao | **Trạng thái:** ✅ **XONG HẲN 05/08/2026** | **Dự kiến:** 2-3 ngày

> **Chốt 05/08/2026 — bắt đầu từ kho rỗng, không nhập lại gì.** Chưa có nick thật nào: 3 nick
> trong `dev.db` cũ đều là nick thử. Nhập lại dữ liệu thử vào kho mới rồi lát nữa xóa đi là
> công vô ích, và tệ hơn là nó làm mọi con số trên trang tổng quan nói dối trong lúc chờ mua nick.
>
> Quyết định này **xóa nốt việc cuối cùng của GĐ1** — phase đóng hoàn toàn.
>
> ⚠️ Nhưng **đừng xóa `dev.db`**: 10 proxy Webshare trong đó là dữ liệu thật đã trả tiền, đã
> kiểm 10/10 ra đúng IP và đúng quốc gia ngày 04/08. Giữ file cho tới khi nhập lại chúng vào
> Postgres — mật khẩu proxy không nằm ở đâu khác. File đã được `.gitignore` phủ (`*.db`).

> Làm nửa múi giờ **trước** nửa Postgres, ngược thứ tự các bước dưới đây. Lý do: đổi nền dữ
> liệu làm `vitest.global-setup.ts` tạm thời hỏng, mà lại cần bộ test còn chạy được mới chứng
> minh nổi phần múi giờ đúng. Làm ngược lại là tự bịt mắt mình.
>
> Nghiệm thu nửa múi giờ: cả bộ test chạy ở ba múi giờ hệ điều hành (`UTC`,
> `America/New_York`, `Asia/Ho_Chi_Minh`) đều ra **473/473 giống hệt nhau**.

Đổi nền dữ liệu từ SQLite một file sang Postgres dùng chung, và **chốt một múi giờ cho cả team**.

Hai việc gộp một phase vì cùng chạm tầng dữ liệu và cùng phải xong trước khi có người thứ hai
dùng — nhất là múi giờ: dữ liệu nhập lệch múi giờ thì sau không sửa ngược được.

## Key Insights

- **Không viết script chuyển dữ liệu.** Dữ liệu thật hiện có: 3 nick, 10 proxy, 1 nhân vật,
  3 đích, 3 content, 4 job. Nhập tay nửa tiếng. Script chuyển ciphertext tốn hơn và rủi ro hơn.
- `startOfLocalDay` dùng `setHours(0,0,0,0)` = **giờ của máy đang chạy**. Team ngồi khác chỗ thì
  luật 4 (hạn mức ngày) và cold-start chấm ra kết quả khác nhau tùy máy. Đây là bug thật, không
  phải giả định.
- Mẹo `@unique` trên cột nullable (`Account.proxyId`) **giữ nguyên hành vi trên Postgres** —
  nguyên tắc 1 nick = 1 proxy không bị nới.
- `vitest.global-setup.ts` áp thẳng file `migration.sql` vào SQLite tạm. Postgres thì cần một
  Postgres thật để test → **đây là chi phí ẩn lớn nhất của phase này**.

## Requirements

- Toàn bộ app chạy trên Postgres, `npm test` / `npm run lint` / `npm run typecheck` xanh
- Một biến `TEAM_TIMEZONE` quyết định ranh giới ngày ở **mọi** phép tính, không phụ thuộc máy
- `npm run db:backup` chạy được trên Postgres

## Architecture

```
Prisma 7 + @prisma/adapter-pg  ──►  Postgres (Railway)
                                      ▲
                        test ─────────┘ Postgres cục bộ (cài native)
```

Múi giờ: mọi phép cắt ngày đi qua một hàm duy nhất đọc `TEAM_TIMEZONE`, không ai được gọi
`setHours` trực tiếp nữa.

## Related Code Files

**Sửa:**
- `prisma/schema.prisma` — `provider = "postgresql"`
- [prisma-client.ts](../../src/lib/db/prisma-client.ts) — `PrismaBetterSqlite3` → `PrismaPg`
- [vitest.global-setup.ts](../../vitest.global-setup.ts) — dựng schema test trên Postgres
- [database-backup.ts](../../src/lib/db/database-backup.ts) — bỏ `VACUUM INTO`, dùng `pg_dump`
- [upgrade-database.ts](../../scripts/upgrade-database.ts) — kiểm lại `$queryRawUnsafe` trên `_prisma_migrations`
- [vietnamese-date-format.ts](../../src/lib/format/vietnamese-date-format.ts) — `startOfLocalDay` / `endOfLocalDay` / `formatDayMonth` theo `TEAM_TIMEZONE`
- `.env.example` — thêm `TEAM_TIMEZONE`, đổi mẫu `DATABASE_URL`
- `package.json` — bỏ `@prisma/adapter-better-sqlite3`, thêm `@prisma/adapter-pg`

**Tạo:** `prisma/migrations/` baseline mới cho Postgres

**Xóa:** 4 thư mục migration SQLite hiện tại

## Implementation Steps

1. **Postgres 17 đã cài sẵn và đang chạy** như dịch vụ Windows `postgresql-x64-17` (đo 04/08/2026:
   7 tiến trình, tổng **38 MB RAM**). Chỉ còn hai việc vặt:
   - thêm `C:\Program Files\PostgreSQL\17\bin` vào PATH (cần `pg_dump` cho bước 4)
   - xác nhận mật khẩu user `postgres`, tạo database `mkttool_dev` + `mkttool_test`

   **Không dùng Docker.** Docker Desktop trên Windows chạy máy ảo Linux, ăn 1.5-3 GB RAM trước khi
   có container nào; máy này chỉ còn 2.6 GB trống. Bản cài native làm cùng việc bằng 38 MB.
2. Đổi provider + adapter. Xóa migration cũ, `prisma migrate dev` sinh baseline Postgres
3. Sửa `vitest.global-setup.ts`: dựng schema riêng trên Postgres test rồi dọn sạch khi xong.
   **Giữ nguyên nguyên tắc cũ** — áp từ file migration, không `db push`, để mỗi lượt test vẫn
   kiểm được chuỗi migration áp sạch từ đầu
4. Viết lại `database-backup.ts` bằng `pg_dump`. Giữ nguyên quy tắc tên file có mốc thời gian và
   **không bao giờ ghi đè bản cũ**
5. Thêm `TEAM_TIMEZONE`, viết lại ba hàm ngày tháng. Thiếu biến thì **dừng app kèm thông báo rõ**,
   không lặng lẽ dùng giờ máy
6. Rà mọi chỗ gọi `setHours` / `getHours` ngoài file đó; thêm test chặn tái phạm
7. Chạy lại 4 smoke test (`vault`, `rules`, `facebook`, `health`) trên Postgres
8. Nhập tay lại dữ liệu thật; kết nối lại Fanpage bằng OAuth

## Todo List

- [x] PATH có `pg_dump` (đã có sẵn từ trước); tạo database `mkttool_dev` + `mkttool_test`
- [x] `provider` + adapter đổi sang Postgres (`PrismaPg`)
- [x] Baseline migration mới, 9 migration SQLite cũ đã xóa
- [x] `vitest.global-setup.ts` chạy trên Postgres, vẫn áp từ file migration
- [x] *(phát sinh)* `assertIsTestDatabase()` — chỉ nhận database tên kết thúc bằng `_test`
- [x] `database-backup.ts` dùng `pg_dump`, không ghi đè bản cũ
- [x] `upgrade-database.ts` kiểm lại trên Postgres — áp baseline vào `mkttool_dev` chạy đúng
- [x] `TEAM_TIMEZONE` + các hàm ngày tháng, thiếu biến thì dừng app — **xong 04/08/2026**
- [x] Test chặn gọi `setHours` ngoài module ngày tháng — cấm cả họ hàm, quét toàn `src/`
- [x] *(phát sinh)* Ô `datetime-local` cũng đọc theo giờ máy chủ — sửa bằng `parseDateTimeInput`
- [x] *(phát sinh)* Đưa `TEAM_TIMEZONE` sang bundle trình duyệt qua `next.config.ts`
- [x] *(phát sinh)* Hai test cũ dựng mốc theo giờ máy — đỏ khi chạy ở UTC, đã sửa
- [x] `npm test` (482/482) + `lint` + `typecheck` xanh
- [x] 4 smoke test xanh trên Postgres — vault 10/10, rules 6/6, facebook 11/11, health 17/17
- [x] *(phát sinh)* README + 4 file `docs/` còn mô tả SQLite — đã sửa
- [x] ~~Nhập tay dữ liệu thật, nối lại Fanpage~~ — **bỏ, chốt 05/08/2026: bắt đầu từ kho rỗng**

## Nghiệm thu (04/08/2026)

| Phép thử | Kết quả |
|---|---|
| `npm test` trên Postgres thật | 482/482, 48 file |
| `npm run lint` / `npm run typecheck` | sạch |
| 4 smoke test | xanh hết, gồm lượt `health:smoke` chạm Reddit thật |
| `npm run db:backup` | dump 21 KB — 14 bảng, 11 unique index |
| Ràng buộc 1 nick = 1 proxy | `Account_proxyId_key` có trong dump ✅ |
| `pg_dump` không lộ credential trần | `vault:smoke` quét bản dump thật, đạt |

Bẫy đã gặp: `mkttool_dev` chưa từng được áp migration nên lượt `db:backup` đầu ra file **1 KB
rỗng mà vẫn báo thành công**. Backup của một database rỗng trông y hệt backup thành công — chỉ
lộ ra khi đếm `CREATE TABLE` trong file. Nghiệm thu sao lưu phải soi nội dung, không phải soi
mã thoát.

## Success Criteria

- Hai máy đặt múi giờ hệ điều hành khác nhau, mở cùng một job → **luật 4 và cold-start ra kết quả
  giống hệt nhau**. Đây là phép thử chính của phase, không phải test xanh chung chung.
- `npm run db:backup` ra file khôi phục được
- Ràng buộc 1 nick = 1 proxy vẫn bị database chặn (thử tạo trùng, phải lỗi)

## Risk Assessment

| Rủi ro | Mức | Giảm thiểu |
|---|---|---|
| Test cần Postgres → chạy chậm hơn, cài đặt phiền hơn | **thấp** | Postgres 17 native đã chạy sẵn trên máy dev (38 MB RAM). CI dùng service container |
| Sót một chỗ tính ngày bằng giờ máy | cao | Test chặn `setHours`; rà bằng grep toàn repo |
| Baseline migration mới làm mất một ràng buộc đang có | trung bình | Đối chiếu `\d+` của Postgres với schema; smoke test `vault` kiểm ràng buộc 1:1 |

## Security Considerations

- `DATABASE_URL` bắt buộc TLS khi trỏ Railway
- Bản `pg_dump` chứa ciphertext → `.gitignore` phải phủ thư mục sao lưu như hiện tại
- Chưa tách hai vùng khóa ở phase này; toàn bộ vẫn dùng một `VAULT_KEY` — Phase 03 mới tách

## Next Steps

Xong → [Phase 02](phase-02-dang-nhap-vai-tro-chu-so-huu.md).
[Phase 05](phase-05-len-railway-cron-sao-luu.md) làm song song được từ đây.
