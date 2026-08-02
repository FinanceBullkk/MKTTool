# Rà soát bảo mật — mã Phase 03 + quét lại toàn hệ thống

**Ngày:** 03/08/2026 | **Commit:** `8f41292` | **Branch:** master
**Cách làm:** đọc mã + **thử nghiệm chạy thật** trên dev server và trên module, không chỉ đọc suông.

## Đã thử nghiệm — kết quả

### 1. Mật khẩu proxy quan sát viên không rò ra bất kỳ đâu

Dựng một proxy quan sát viên với mật khẩu đánh dấu, ép nó hỏng (cổng chết), rồi soi mọi đường
mà chuỗi đó có thể thoát ra:

| Đường | Kết quả |
|---|---|
| Chuỗi `server` đưa cho Playwright | sạch — `http://127.0.0.1:9`, user/mật khẩu đi riêng |
| `error.message` | sạch |
| `error.stack` | sạch |
| `error.cause` (nguyên lỗi gốc của Playwright) | sạch |
| Thông báo chặn socks5 | sạch |

Chuỗi kết nối **không bao giờ** có dạng `http://user:pass@host` — đó là dạng hay lọt vào log.

### 2. Không rò credential xuống trình duyệt

Tải trang `/proxies` rồi soi toàn bộ payload gửi về client: **0 lần** xuất hiện `passwordEnc`,
**0** chuỗi mã hóa dạng `v1.…`, **0** mật khẩu trần, **0** username proxy.

Đối chiếu ranh giới client/server bằng chuỗi import: **không file `"use client"` nào** import
`credential-encryption`, `encryption-key-loader`, `facebook-app-config`, `proxy-config-builder`,
hay `prisma-client`. 15 file client, tất cả chỉ gọi server action qua tham chiếu.

### 3. Route `/api/health/run` chặn đúng

| Thử | Kết quả |
|---|---|
| `Origin: https://trang-la.com` | **403** |
| Không có `Origin` | **403** |
| Body không phải JSON | 400, câu rõ ràng |
| `accountId` là số | 400 |
| `accountId` rác, cùng nguồn | 502 kèm hướng dẫn, không lộ gì về nick |

### 4. URL dựng từ username không lái đi đâu được

`encodeURIComponent` vô hiệu hóa mọi ký tự điều hướng:

```
"../../admin"  -> https://old.reddit.com/user/..%2F..%2Fadmin/
"evil.com/x"   -> https://old.reddit.com/user/evil.com%2Fx/
"a/b?x=1"      -> https://old.reddit.com/user/a%2Fb%3Fx%3D1/
```

Tên nick dùng làm tên file ảnh chụp lấy từ **DB (cuid)**, không phải từ body request — không
có đường đi ngược thư mục.

### 5. Parser không bị treo bằng HTML độc (ReDoS)

Năm mẫu 1MB thiết kế riêng để bẫy backtracking:

| Mẫu 1MB | parser | detector |
|---|---|---|
| toàn dấu `<` | 1ms | 2ms |
| div gần giống `thing` | 1ms | 4ms |
| span gần giống `karma` | 0ms | 2ms |
| 500K khoảng trắng trong thẻ | 1ms | 0ms |
| chuỗi thường | 0ms | 4ms |

Chậm nhất 4ms. Không có đường làm treo.

### 6. Quét lại nền cũ — vẫn nguyên

Mã mới **không** thêm `dangerouslySetInnerHTML`, `eval`, SQL thô, `as any`, hay `@ts-ignore`.
Bí mật (`VAULT_KEY`, `MULTIZEN_MCP_TOKEN`, `FACEBOOK_APP_SECRET`) chỉ đọc trong module server.
Không file nhạy cảm nào bị theo dõi trong git; `data/screenshots/` đã nằm trong `.gitignore`
(kiểm bằng `git check-ignore`).

---

## Phát hiện

### 1. [TRUNG BÌNH] Không có khóa chống hai lượt dò chạy đồng thời — ✅ ĐÃ SỬA

Không có `lock` / `isRunning` nào trong `src/lib/health/`. Nên chạy song song được:
`npm run health` theo lịch + người bấm "Dò lại ngay", hoặc bấm nhiều nút liền nhau.

Hậu quả nặng hơn nó trông:

Cả kiến trúc của bộ dò xoay quanh **giãn ngẫu nhiên 30-90 giây** giữa các nick, để proxy quan
sát viên không lộ ra là máy. Hai lượt chạy chồng nhau **phá đúng thứ đó** — request từ cùng một
IP dồn lại trong khoảng ngắn, đúng khuôn mẫu mà giãn cách sinh ra để tránh. Bộ dò tự làm mình
bị Reddit chặn, và lúc đó nó trả `ERROR` cho mọi nick trong khi vẫn trông như đang chạy đều.

Phụ: mỗi lượt mở một Chromium (~200MB). Tám lượt chồng nhau là ~1,6GB.

**Đề xuất ban đầu SAI, và cái sai đó đáng ghi lại:** tôi đề xuất khóa trong bộ nhớ, lý do
"app chạy một process". Sai — `npm run health` chạy ở **tiến trình riêng**, không nằm trong web
app. Khóa trong bộ nhớ chỉ chặn được hai lời gọi API cùng lúc và hoàn toàn không thấy lượt chạy
theo lịch, mà đó mới là cặp dễ đụng nhau nhất (lịch 3 giờ sáng gặp người bấm nút).

**Đã sửa** (`src/lib/health/health-check-lock.ts`): file khóa `data/health-check.lock` chứa PID
và mốc bắt đầu. Tạo bằng cờ `wx` — hệ điều hành đảm bảo "tạo hoặc thất bại" trong một thao tác,
không có khe hở giữa "kiểm tra tồn tại" và "ghi". Khóa mồ côi quá 30 phút thì lượt sau giành
lấy, và `release()` chỉ xóa khóa của chính mình để không kéo lượt của người khác.

**Kiểm chứng chạy thật:**

| Thử | Kết quả |
|---|---|
| Có khóa, gọi API | **409** kèm câu nói rõ ai giữ và giữ bao lâu |
| Xóa khóa, gọi lại | đi tiếp tới bước sau (502 vì chưa có proxy quan sát viên) |
| Sau khi lượt chạy hỏng | khóa **được thả sạch**, không sót |
| `git check-ignore` | khóa đã nằm trong `.gitignore` |

Thêm 14 test: giành/thả, báo bận, ranh giới mồ côi, nội dung hỏng, `release()` không xóa khóa
người khác, và **runner giành khóa TRƯỚC khi chạm database hay mở trình duyệt** — giành muộn thì
hai lượt vẫn kịp bắn chồng nhau mà test chỉ nhìn "có ném lỗi không" vẫn xanh.

### 2. [THẤP] `/api/health/run` không giới hạn tần suất — ✅ ĐÃ SỬA cùng mục 1

Cùng gốc rễ. Khóa chặn luôn: lời gọi thứ hai ăn 409 thay vì mở thêm một Chromium.

### 3. [RẤT THẤP] `console.error` ghi nguyên lỗi Prisma vào log server

`src/lib/db/prisma-error-helpers.ts:22` ghi cả object lỗi. Chưa thấy đường nào đưa credential
vào đó — `passwordEnc` đã là chuỗi mã hóa, và lỗi ràng buộc duy nhất chỉ nêu **tên** field.
Ghi nhận để biết, chưa cần sửa.

### 4. Ghi nhận, không phải lỗi: không có xác thực

Công cụ vẫn không có màn hình đăng nhập — ai mở được trang là làm được mọi thứ. Các server
action mới (thêm/tắt/xóa proxy quan sát viên) nhận `id` bất kỳ mà không kiểm quyền, **đúng và
nhất quán** với mô hình đang có. Hàng rào thật vẫn là app chỉ nghe `127.0.0.1`, và README đã
nói rõ điều đó.

---

### 5. Ảnh chụp không bao giờ tự xóa — ✅ ĐÃ SỬA

`data/screenshots/` chỉ phình. Chạy hằng ngày, mỗi nick có vấn đề một ảnh ~300KB, một năm là
vài trăm MB nằm im trên máy.

**Đã sửa** (`src/lib/health/screenshot-retention.ts`): cuối mỗi lượt dò, xóa ảnh cũ hơn 30 ngày.
Dọn theo **database** chứ không quét thư mục — mỗi file bị xóa thì đường dẫn trong bản ghi cũng
được gỡ trong cùng lượt. Quét thư mục thì đĩa sạch mà trang `/health` vẫn chỉ vào file không còn
tồn tại, người dùng đi tìm rồi tưởng công cụ mất dữ liệu.

Bản ghi kết luận **giữ nguyên vĩnh viễn** — đó là thứ vẽ ra xu hướng karma. Ảnh chỉ là bằng
chứng kèm theo, hết hạn được. Dọn hỏng cũng không làm hỏng kết quả dò (bọc riêng trong `try`).

6 test chạy trên SQLite thật, kiểm cả "đĩa và database còn khớp nhau sau khi xóa không".

---

## Trạng thái sau khi sửa

317 test xanh (thêm 20), typecheck + build sạch, lint 0 lỗi / 3 cảnh báo cũ đã biết,
4/4 smoke test đạt.

## Câu hỏi chưa giải

Không còn. Rác `smoke-proxy-a-*` và nick `smoke_user_...` trong database vẫn còn — sót từ một
lần chạy `rules:smoke` bản cũ, không phải do đợt này. Chờ người dùng quyết có xóa không.
