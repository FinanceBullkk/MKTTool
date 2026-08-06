# Đưa MKTTool lên Railway — làm từng bước

**Cập nhật:** 06/08/2026 | Thuộc [GĐ5](../plans/260804-1752-web-chung-cho-team-phan-tan/phase-05-len-railway-cron-sao-luu.md)

Đây là **danh sách thao tác tay**, làm theo đúng thứ tự. Thứ tự không tùy tiện — có ba chỗ
phụ thuộc nhau và làm ngược là phải quay lại:

| Phải có trước | Mới làm được |
|---|---|
| Postgres **rỗng** trên Railway | nạp bản sao từ máy dev (nạp sau khi app đã dựng bảng là đụng bảng trùng tên) |
| App deploy xong, đã sinh domain | khai redirect URI cho Google và Facebook (chưa có domain thì chưa biết khai gì) |
| Redirect URI đã khai | đăng nhập thử được |

Ba quyết định đã chốt 06/08/2026:

1. **Nạp lại kho từ bản sao của máy dev** — giữ 10 proxy Webshare đã trả tiền. Hệ quả bắt buộc:
   `VAULT_KEY_SERVER` trên Railway phải là **đúng khóa hiện tại**, vì ciphertext trong bản sao mã
   hóa bằng nó.
2. **Railway deploy từ nhánh `master`**, qua PR như nếp đang làm.
3. **Dùng lại `TICKET_SIGNING_KEY` hiện tại** — cầu nối trên máy Windows thứ hai đã có khóa công
   khai tương ứng, đổi khóa là phải đi chép lại từng máy.

---

## Bước 1 — Đưa code lên `master` (làm ở máy anh)

Nhánh `feat/gd03-tach-hai-vung-khoa` đang có 13 commit chưa đẩy.

```bash
git push origin feat/gd03-tach-hai-vung-khoa
```

Rồi mở PR và merge vào `master` trên GitHub. Railway sẽ deploy từ `master`, nên **chưa merge thì
Railway không thấy code mới**.

## Bước 2 — Chuẩn bị 7 giá trị, dán sẵn vào một file nháp

Mở `.env` ở máy anh, chép ra **nguyên văn** 6 giá trị này. Đừng gõ lại bằng tay — sai một ký tự
trong khóa mã hóa là kho không mở được, mà thông báo lỗi sẽ nói về "giải mã thất bại" chứ không
nói về gõ nhầm.

| Biến | Lấy ở đâu | Vì sao phải đúng bản cũ |
|---|---|---|
| `VAULT_KEY_SERVER` | `.env` máy anh | **Bắt buộc.** Mật khẩu 10 proxy trong bản sao mã hóa bằng khóa này |
| `TICKET_SIGNING_KEY` | `.env` máy anh | Cầu nối đã cài đang tin khóa công khai của nó |
| `GOOGLE_CLIENT_ID` | `.env` máy anh | cùng một Google OAuth client |
| `GOOGLE_CLIENT_SECRET` | `.env` máy anh | – |
| `ALLOWED_EMAILS` | `.env` máy anh | – |
| `ADMIN_EMAILS` | `.env` máy anh | – |

Giá trị thứ bảy thì **sinh mới**, đừng dùng lại của máy dev:

```bash
node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
```

Đó là `BETTER_AUTH_SECRET` của máy chủ. Sinh mới vì nó chỉ ký cookie phiên — không liên quan gì
tới dữ liệu, và hai môi trường dùng chung một khóa ký phiên là thứ không có lợi ích nào bù lại.

> ⚠️ **`VAULT_KEY_OPERATOR` KHÔNG có trong danh sách trên, và đó là cả điểm của GĐ3.** Đừng khai
> nó lên Railway. Khai nhầm thì khay cảnh báo vận hành sẽ hiện một dòng vàng cho ADMIN — nhưng
> đừng dựa vào đó, hãy kiểm bằng mắt sau khi khai xong.

## Bước 3 — Tạo dự án Railway + Postgres

1. Vào [railway.com](https://railway.com), đăng nhập bằng GitHub.
2. **New Project** → **Deploy PostgreSQL**. Dựng Postgres **trước** để có sẵn database rỗng cho
   bước nạp dữ liệu.
3. Bấm vào dịch vụ Postgres → tab **Variables** → chép hai giá trị:
   - `DATABASE_URL` — địa chỉ **nội bộ** (`postgres.railway.internal`). App sẽ dùng cái này.
   - `DATABASE_PUBLIC_URL` — địa chỉ **công khai** (`*.proxy.rlwy.net`). Máy anh dùng cái này để
     nạp dữ liệu và để sao lưu.

> Gói **Hobby ($5/tháng)** là mức tối thiểu thực tế: ảnh chạy nặng 4.86 GB vì mang theo Chromium
> cho bộ dò shadowban, và gói miễn phí không đủ chỗ.

## Bước 4 — Nạp kho từ máy dev lên Railway

**Làm bây giờ, khi Postgres còn rỗng.** Làm sau khi app đã dựng bảng là đụng bảng trùng tên.

Ở máy anh, đảm bảo `pg_dump` và `psql` có trong PATH (`C:\Program Files\PostgreSQL\17\bin`), rồi:

```bash
npm run db:backup
```

Xem dòng kết quả — nó in **số hàng dữ liệu**. Phải thấy proxy trong đó, không phải số 0. Rồi nạp
lên Railway bằng `DATABASE_PUBLIC_URL` lấy ở bước 3:

```bash
psql "<DATABASE_PUBLIC_URL>" -f data/backups/mkttool-<ngày>-<giờ>.sql
```

Bản sao xuất kèm `--no-owner --no-privileges` nên nạp được vào Railway dù tên role khác máy anh.

Đối chiếu ngay, đừng tin dòng "thành công":

```bash
psql "<DATABASE_PUBLIC_URL>" -c "SELECT count(*) FROM \"Proxy\";"
psql "<DATABASE_PUBLIC_URL>" -c "SELECT count(*) FROM _prisma_migrations;"
```

Kho dev **tính tới 06/08/2026** chứa đúng ngần này (đã đếm trên bản dump thật), nên hai con số
phải ra:

| Bảng | Số hàng | Là gì |
|---|---|---|
| `Proxy` | **10** | 10 IP Webshare đã trả tiền — thứ chính đáng phải mang sang |
| `_prisma_migrations` | **5** | sổ migration, đúng bằng số thư mục trong `prisma/migrations/` |
| `User` + `AuthAccount` | 1 + 1 | tài khoản Google của anh |
| `Session` | 2 | phiên đăng nhập cũ ở máy dev |

Mọi bảng khác đang **rỗng** — chưa có nick, content hay job nào. Nên nếu con số ra khác hẳn, tức
là đã nạp nhầm file.

Hai hàng `Session` sang theo là **vô hại**: `BETTER_AUTH_SECRET` của máy chủ là khóa mới (bước 2)
nên hai phiên đó không ký được nữa và tự chết. Còn `User`/`AuthAccount` sang theo thì có lợi —
cùng một tài khoản Google.

> **Bản dump đã kiểm là nạp được sang Railway**: nó không chứa `CREATE SCHEMA`, `GRANT`,
> `CREATE EXTENSION` hay `SET SESSION AUTHORIZATION` — những câu lệnh đòi quyền superuser mà
> Railway không cấp. Đó là nhờ `--no-owner --no-privileges` lúc xuất.

## Bước 5 — Tạo dịch vụ web từ GitHub

1. Trong cùng dự án Railway: **New** → **GitHub Repo** → chọn `Techieslab-app/MKTTool`.
2. Cho phép Railway truy cập kho nếu nó hỏi.
3. Vào dịch vụ vừa tạo → **Settings**:
   - **Source → Branch:** `master`
   - **Build:** Railway tự nhận `Dockerfile` ở gốc kho. Không cần đổi gì.
   - **Deploy → Pre-Deploy Command:** `npx prisma migrate deploy`

> **Vì sao pre-deploy là `prisma migrate deploy` chứ không phải `npm run db:upgrade`.**
> `db:upgrade` là lệnh cho **máy người dùng**: nó sao lưu trước khi áp, và trong container thì bản
> sao đó rơi vào ổ tạm rồi biến mất — một bản dự phòng không tồn tại nhưng trông như có. Trên máy
> chủ, nửa "sao lưu trước" là việc anh làm ở máy mình (bước 10), còn `migrate deploy` chỉ lo phần
> áp. (Nó cũng không chạy được trong container: `db:upgrade` đòi có file `.env`, thứ ảnh Docker
> cố ý không mang theo.)

Lần deploy đầu sẽ **build thành công nhưng trang lỗi** — chưa có biến môi trường nào. Đúng như dự
kiến, làm tiếp bước sau.

## Bước 6 — Khai biến môi trường

Vào dịch vụ **web** → tab **Variables** → **Raw Editor**, dán khối này rồi thay giá trị:

```
DATABASE_URL=${{Postgres.DATABASE_URL}}
TEAM_TIMEZONE=Asia/Ho_Chi_Minh
VAULT_KEY_SERVER=<chép từ .env máy anh>
TICKET_SIGNING_KEY=<chép từ .env máy anh>
BETTER_AUTH_SECRET=<khóa vừa sinh mới ở bước 2>
ALLOWED_EMAILS=<chép từ .env máy anh>
ADMIN_EMAILS=<chép từ .env máy anh>
GOOGLE_CLIENT_ID=<chép từ .env máy anh>
GOOGLE_CLIENT_SECRET=<chép từ .env máy anh>
HEALTH_CHECK_DAILY_AT=09:00
```

Vài chỗ đáng nói:

- `${{Postgres.DATABASE_URL}}` là **tham chiếu** của Railway, không phải chuỗi cần thay. Nó trỏ
  vào mạng nội bộ nên Postgres không phải phơi ra internet, và nó tự đúng lại nếu Railway đổi mật
  khẩu database.
- `TEAM_TIMEZONE` được nhúng vào bundle **lúc build**, không phải lúc chạy. Đổi giá trị này về sau
  thì phải **build lại**, khởi động lại không đủ.
- `HEALTH_CHECK_DAILY_AT` là thứ bật lịch dò shadowban. Thiếu nó thì bộ dò chỉ chạy khi có người
  bấm nút — và khay cảnh báo sẽ nhắc ADMIN đúng chuyện đó.
- **Chưa khai `BETTER_AUTH_URL`** — chưa có domain để khai. Bước sau.
- **Không khai `VAULT_KEY_OPERATOR`.** Đọc lại danh sách trên một lượt bằng mắt trước khi lưu.
- Không cần biến MultiZen/AdsPower nào: từ GĐ4, việc mở trình duyệt do cầu nối trên máy operator
  làm, máy chủ không gọi tới MultiZen.

## Bước 7 — Sinh domain, rồi khai nốt `BETTER_AUTH_URL`

1. Dịch vụ web → **Settings** → **Networking** → **Generate Domain**. Nhận được một địa chỉ dạng
   `mkttool-production-xxxx.up.railway.app`.
2. Quay lại **Variables**, thêm:

```
BETTER_AUTH_URL=https://<domain-vừa-sinh>
```

Phải là `https://`, không có dấu `/` ở cuối. Railway sẽ tự deploy lại.

## Bước 8 — Khai redirect URI cho Google

Vào [Google Cloud Console](https://console.cloud.google.com/) → **APIs & Services** →
**Credentials** → mở OAuth client đang dùng:

- **Authorized JavaScript origins:** thêm `https://<domain>`
- **Authorized redirect URIs:** thêm `https://<domain>/api/auth/callback/google`

**Giữ nguyên hai dòng `localhost` cũ**, đừng xóa — máy dev vẫn cần chúng.

> ⚠️ Google so **từng ký tự**, kể cả dấu `/` cuối. Sai là màn hình lỗi của Google chứ không phải
> của công cụ, nên đọc kỹ dòng nó in ra khi hỏng.

## Bước 9 — Nghiệm thu

Mở `https://<domain>` và đi hết danh sách này:

| Kiểm | Đúng thì thấy gì |
|---|---|
| Đăng nhập bằng Google | vào được, và **email ngoài `ALLOWED_EMAILS` thì bị chặn** — thử luôn một email lạ |
| Khay cảnh báo trên đầu trang | **không có dòng nào về khóa.** Có dòng vàng *"máy chủ vẫn giữ VAULT_KEY_OPERATOR"* nghĩa là khai nhầm ở bước 6 |
| `/proxies` | đủ **10** proxy Webshare — chứng minh bản sao nạp đúng |
| Bấm **"Kiểm"** một proxy | ra kết luận thật (Sống / Chết / …). Đây là phép thử `VAULT_KEY_SERVER` đúng khóa: sai khóa thì không giải mã được mật khẩu proxy |
| `/health` → khối *"Lịch dò hằng ngày"* | *"Tự chạy 09:00 mỗi ngày theo giờ team"* |
| Log của dịch vụ web lúc khởi động | dòng `[lịch dò] Bật: 09:00 mỗi ngày theo Asia/Ho_Chi_Minh.` |
| `/relay-download` | nói *"chưa có gói"* kèm đường dẫn nó đã tìm. Đúng — `.exe` chưa lên máy chủ, xem bước 12 |

## Bước 10 — Nếp sao lưu

**Hai nửa, và cần cả hai.**

1. **Railway tự sao lưu ổ đĩa.** Dịch vụ Postgres → **Settings** → **Backups** → bật lịch hằng
   ngày. Cái này chống lỡ tay xóa dữ liệu và migration hỏng.
2. **Kéo một bản về máy anh.** Thêm vào `.env` **của máy anh** (không phải của máy chủ):

```
PRODUCTION_DATABASE_URL="<DATABASE_PUBLIC_URL>?sslmode=require"
```

rồi:

```bash
npm run db:backup:remote
```

File ra `data/backups/mkttool-prod-<ngày>-<giờ>.sql`. Dấu `prod` trong tên là thứ ngăn bản của
máy dev bị khôi phục nhầm lên máy chủ. Lệnh in ra **số hàng dữ liệu** — số 0 nghĩa là URL trỏ
nhầm sang một Postgres khác, đừng bỏ qua.

Nửa thứ hai chống thứ nửa thứ nhất không chống được: **mất cả dự án Railway, hoặc mất tài khoản.**
Bản sao nằm cùng nhà với bản gốc thì không phải bản sao.

> **Chạy `npm run db:backup:remote` trước mỗi lần deploy có thay đổi cấu trúc database.**
> `prisma migrate deploy` không tự sao lưu, và đó là lúc rủi ro cao nhất.

## Bước 11 — Facebook (làm khi cần đăng Fanpage)

Bỏ qua được, cả app vẫn chạy bình thường thiếu nó.

1. Thêm vào Variables của dịch vụ web: `FACEBOOK_APP_ID`, `FACEBOOK_APP_SECRET`,
   `FACEBOOK_LOGIN_CONFIG_ID` (chép từ `.env` máy anh), và
   `FACEBOOK_REDIRECT_URI=https://<domain>/api/facebook/oauth/callback`.
2. Vào Meta App → **Facebook Login for Business** → **Settings** → thêm đúng chuỗi redirect URI
   trên.

> **Đây là chỗ có thể vướng.** Meta có thể từ chối domain `*.up.railway.app` vì nó là domain dùng
> chung. Vướng thì mua một tên miền riêng (~12 USD/năm), trỏ về Railway ở **Settings → Networking
> → Custom Domain**, rồi khai lại `BETTER_AUTH_URL` + hai redirect URI theo tên miền đó. Google
> thì không kén — chỉ Facebook mới là câu hỏi mở.

## Bước 12 — Đưa `.exe` cầu nối lên máy chủ

Chưa làm cũng không sao: `/relay-download` nói rõ *"chưa có gói"* thay vì hỏng.

`.exe` dựng trên Windows còn ảnh chạy dựng trên Linux, nên nó **không thể nằm trong ảnh Docker**.
Ba đường, chưa chốt:

| Đường | Được | Mất |
|---|---|---|
| Gắn volume Railway rồi upload tay | mã đã hỗ trợ sẵn qua `RELAY_RELEASE_DIR`; file ở sau lớp đăng nhập | mỗi bản mới phải upload tay |
| Đẩy lên GitHub Releases, web chỉ giữ link | không tốn dung lượng máy chủ | link công khai — mất tính chất *"chỉ tải được sau khi đăng nhập"* của QĐ 11 |
| Build `.exe` trong CI Windows rồi bake vào ảnh | tự động hẳn | thêm một job CI Windows, và ảnh phồng thêm 87 MB mỗi bản |

---

## Việc còn nợ sau khi xong

- **Phép thử hai tiến trình dò chạy song song.** Chạy `npm run health` ở máy anh (trỏ vào
  `PRODUCTION_DATABASE_URL`) đúng lúc bấm *"Dò cả đàn"* trên web. Lượt thứ hai phải bị từ chối
  kèm câu nói rõ **máy nào**, tiến trình nào đang giữ và giữ bao lâu rồi. Đây là thứ chỉ chứng
  minh được khi khóa đã bắc qua hai máy thật.
- **Đưa cả team vào vai trò Tester của Meta App** (nếu dùng Facebook).
- **Deploy thử sang một hãng khác** (Render/Fly) bằng đúng `Dockerfile` này, không sửa code — tiêu
  chí của QĐ 9, để biết mình chưa bị khóa vào Railway.
