# Xoay credential sau sự cố lộ 13/09/2026

Bản kiểm kê (`plans/reports/security-credential-exposure-inventory-20260913.md`) liệt kê những gì bị
lộ và theo thứ tự nào. Nó **không** nói phải gõ gì. Tài liệu này là phần đó.

Chỉ một credential đã xoay: `RELAY_RELEASE_DOWNLOAD_TOKEN` (13/09, đã xác minh bằng lượt GET đủ byte
và đúng SHA-256). Phần còn lại vẫn mở.

## Trước khi bắt đầu

**Không chạy bất cứ bước nào nếu chưa có đủ ba thứ sau.**

| Điều kiện | Cách kiểm |
|---|---|
| Có bản sao production mới | `npm run db:backup:remote` |
| Bản sao đó **khôi phục được** | `npm run db:restore:verify -- --dump <file> --psql-path <psql.exe>` → `mismatches: []` |
| Có người chịu trách nhiệm rollback, và họ đang rảnh | không tự động được |

Ngày 14/09/2026 hai điều kiện đầu đã có: `data/backups/mkttool-prod-20260914-103246.sql`, restore
verify `mismatches: []`, `cleanup: PASS`. Backup cũ đi thì làm lại — một bản sao không khôi phục thử
là một bản sao chưa biết dùng được.

> Nếu `PRODUCTION_DATABASE_URL` đang để `sslmode=require`, thêm `uselibpqcompat=true`. Bản `pg` mới
> coi `require` là `verify-full` nên Prisma gãy TLS với chứng chỉ tự ký của nhà cung cấp.

## Thứ tự, và vì sao là thứ tự đó

Đi từ thứ hỏng-thì-dễ-sửa tới thứ hỏng-thì-mất-dữ-liệu. Mỗi bước xác minh xong mới sang bước sau.

### 1. Khoá R2 (Cloudflare)

`R2_ACCESS_KEY_ID` / `R2_SECRET_ACCESS_KEY`, và cặp `RELAY_RELEASE_R2_*`.

1. Tạo cặp khoá mới trong Cloudflare R2, **giữ cặp cũ còn sống**.
2. Cập nhật biến trên Railway, đợi deploy xong.
3. Xác minh: `GET /api/healthz` phải trả `"r2":"ok"`; tải lại manifest sequence đang hoạt động và
   một artifact, đối chiếu kích thước và SHA-256.
4. Chỉ khi bước 3 xanh mới thu hồi cặp cũ ở Cloudflare.

Hỏng thì: publish và backup gãy. Sửa bằng cách trả lại cặp cũ.

### 2. `DATABASE_URL` (Railway/Postgres)

1. Xoay credential Postgres qua Railway.
2. Deploy lại, đợi khởi động xong.
3. Xác minh: `/api/healthz` `"database":"ok"`, rồi chạy lại `db:backup:remote` bằng URL mới.

Hỏng thì: toàn bộ app chết. Đây là lý do backup phải có trước.

### 3. OAuth (Google, Meta)

`GOOGLE_CLIENT_SECRET`, `FACEBOOK_APP_SECRET`.

1. Sinh secret mới ở console nhà cung cấp.
2. Cập nhật Railway, deploy.
3. Xác minh: `npm run auth:check`, rồi **đăng nhập Google thật một lần**. Với Meta, chạy
   `npm run facebook:smoke`.
4. Thu hồi secret cũ ở console.

Hỏng thì: đăng nhập gãy nhưng dữ liệu không sao.

### 4. `BETTER_AUTH_SECRET` — cần cửa sổ bảo trì

Xoay cái này **đăng xuất toàn bộ phiên đang mở**. Không làm giữa giờ làm việc.

1. Báo team trước.
2. Sinh secret mới, cập nhật Railway, deploy.
3. Xác minh: đăng nhập lại được, và phiên cũ đúng là đã mất hiệu lực.

### 5. `TICKET_SIGNING_KEY` — cần cửa sổ bảo trì và bản lùi

Xoay cái này **vô hiệu mọi vé đang lưu hành**. Máy operator phải hội tụ sang khoá mới.

1. Giữ khoá cũ lại, chưa xoá.
2. `npm run keys:server-keygen`, cập nhật Railway, deploy.
3. Xác minh: mở một profile thật qua Relay trên một máy operator. Vé mới phải đi qua; vé cũ phải bị
   chặn.
4. Chỉ khi bước 3 xanh mới bỏ khoá cũ.

### 6. `VAULT_KEY_SERVER` — nguy hiểm nhất, làm sau cùng

Làm sai là **toàn bộ credential mã hoá không mở được nữa**. Không đặt tay biến này.

```powershell
npm run vault:keygen                                        # sinh khoá mới
npm run vault:rekey -- --domain=server --new-key=<hex>      # THỬ: giải mã hết, không ghi gì
npm run vault:rekey -- --domain=server --new-key=<hex> --apply
```

Lượt thử là thứ quan trọng: nó giải mã **toàn bộ** bằng khoá cũ trước khi ghi bất cứ thứ gì. Một bản
ghi không giải mã được là dừng cả mẻ — đúng như thiết kế, vì một database xoay được nửa chừng thì
không khoá nào mở nổi nữa. Công cụ tự sao lưu ngay trước khi ghi và ghi trong một transaction.

Sau `--apply`:
1. `npm run vault:smoke`.
2. Mở một profile thật có proxy — proxy mở được nghĩa là mật khẩu proxy vẫn giải mã đúng.
3. Giữ khoá cũ **cho tới khi** cả hai bước trên xanh và một lượt khôi phục backup cũng xanh.

### `VAULT_KEY_OPERATOR` — không nằm trên máy chủ

Nó là bí mật của máy operator. Chỉ xoay nếu bản log chẩn đoán từng in ra môi trường của chính máy
đó. Xoay bằng `--domain=operator`, chạy **trên máy operator**, không phải trên server.

## Sau khi xong

- Ghi lại thời điểm thu hồi từng credential ở phía nhà cung cấp. Không có mốc đó thì không ai nói
  được là đã đóng.
- Chạy `npm run ci:secret-scan -- --root=plans --root=docs --root=src --root=relay --root=scripts`.
- Cập nhật bản kiểm kê: đánh dấu từng dòng đã xoay và đã thu hồi.

## Điều tài liệu này không làm được

Bước 1, 2, 3 cần đăng nhập console Cloudflare, Railway, Google Cloud và Meta. Máy build có API key
của những dịch vụ đó nhưng **không có quyền vào console để tạo khoá mới**. Đó là lý do gate này vẫn
mở, và nó sẽ còn mở cho tới khi người có quyền đăng nhập ngồi xuống làm.
