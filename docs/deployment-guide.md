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

> ✅ **Đã đi trọn một lượt thật ngày 06/08/2026.** Web chạy ở
> `https://mkttool-web-production.up.railway.app`, đăng nhập Google được, 10 proxy sang đủ, và bộ
> lịch bắn đúng 09:00 giờ team. Những chỗ đánh dấu *"đã vấp thật"* bên dưới là lỗi gặp trong
> chính lượt đó, không phải cảnh báo đề phòng.

---

## ⚠️ Đọc trước: `railway up` ghi đè lên BẤT KỲ service nào đang được chọn

Kể cả service database. Đã vấp thật 06/08/2026: một lượt `railway up` không kèm `--service` đã
deploy MKTTool **đè lên dịch vụ Postgres**, và service đó chạy Next.js nghe ở cổng 5432.

Thứ làm nó tốn thời gian không phải hậu quả mà là **triệu chứng**: app báo

```
prisma:error Connection terminated unexpectedly
```

Câu đó chỉ về phía mạng hoặc phía Prisma — không có chữ nào chỉ về việc database đã bị thay bằng
một máy chủ web. `DATABASE_URL` vẫn đúng, service vẫn `Online`, Railway vẫn báo *"Deployment
successful"*. Chỉ khi mở **log của chính dịch vụ Postgres** mới thấy `> next start`.

**Ba thói quen bắt buộc:**

1. **Luôn kèm `--service`**: `railway up --service mkttool-web`. Không bao giờ gõ `railway up` trần.
2. `railway status` một lượt trước khi đẩy, xem *Linked service* là cái nào.
3. Sau khi deploy, liếc log của service **database** — nó phải nói
   `database system is ready to accept connections`.

**Cách sửa nếu đã lỡ** (dữ liệu KHÔNG mất — ổ đĩa vẫn gắn nguyên, app chạy ở `/app` nên không
chạm vào thư mục dữ liệu của Postgres):

- Dịch vụ Postgres → tab **Deployments** → mục **HISTORY** → dòng có tên ảnh
  `ghcr.io/railwayapp-templates/postgres-ssl:18` → menu **⋮** → **Redeploy**.
- Rồi kiểm **Settings → Source** đã về `Docker Image` chưa. Chỉ Redeploy thì bản chạy đúng nhưng
  **nguồn** của service vẫn là gói code — lần Railway tự khởi động lại là nó đè lên tiếp.
- ❌ **Đừng** chạy `railway redeploy --service Postgres`: lệnh đó deploy lại bản *mới nhất*, tức
  dựng lại đúng cái sai.
- ❌ **Đừng** xóa dịch vụ Postgres để tạo lại. Xóa dịch vụ là xóa ổ đĩa — lúc đó mới mất thật.

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
3. Bấm vào dịch vụ Postgres → tab **Variables** → chép `DATABASE_URL`. Đây là địa chỉ **nội bộ**
   (`postgres.railway.internal`), và app sẽ dùng đúng cái này.
4. **Mở cổng công khai cho Postgres** — mặc định KHÔNG có, nên chưa làm bước này thì sẽ không
   thấy `DATABASE_PUBLIC_URL` ở đâu cả.

   Dịch vụ Postgres → **Settings** → **Networking** → **Public Networking** → bật **TCP Proxy**
   (proxy cổng `5432`). Quay lại tab **Variables**, ba biến mới xuất hiện:
   `RAILWAY_TCP_PROXY_DOMAIN`, `RAILWAY_TCP_PROXY_PORT`, và `DATABASE_PUBLIC_URL`.

   `DATABASE_PUBLIC_URL` vẫn không hiện thì tự ghép — nó chỉ là `DATABASE_URL` thay host/port:

   ```
   postgresql://postgres:<PGPASSWORD>@<RAILWAY_TCP_PROXY_DOMAIN>:<RAILWAY_TCP_PROXY_PORT>/railway?sslmode=require
   ```

> ### Cửa công khai này là một đánh đổi, không phải bước thủ tục
>
> Phần Security của kế hoạch GĐ5 ghi *"`DATABASE_URL` dùng mạng nội bộ của Railway, không phơi
> Postgres ra internet"*. Bật TCP proxy đi ngược câu đó, nên phải nói rõ ranh giới:
>
> - **App vẫn đi mạng nội bộ.** Biến `${{Postgres.DATABASE_URL}}` ở bước 6 không đổi. Cửa công
>   khai **không** phải đường app dùng.
> - **Nó tồn tại cho đúng hai việc**: máy quản trị nạp dữ liệu (bước 4) và kéo bản sao lưu về
>   (bước 10).
> - **Vì sao vẫn đáng bật:** không có nó thì bản sao lưu duy nhất nằm trong chính Railway — mà
>   thứ nó phải chống lại chính là *mất cả dự án Railway*. Bản sao ở cùng nhà với bản gốc không
>   phải bản sao.
>
> Tắt proxy sau khi nạp xong và chỉ bật lại mỗi lần sao lưu thì an toàn hơn thật — nhưng ma sát
> đó thường dẫn tới "tháng sau sao lưu", và một nếp sao lưu không ai làm thì bằng không.
>
> ⚠️ `psql` báo *"server does not support SSL"* nghĩa là bản Postgres đó chưa bật SSL. Bỏ
> `?sslmode=require` ra là nối được — nhưng lúc đó **mật khẩu database đi qua internet dạng
> trần**, mà nó là chìa vào toàn bộ kho ciphertext. Gặp ca này thì dừng lại cân nhắc, đừng bỏ
> tham số cho xong.

> Gói **Hobby ($5/tháng)** là mức tối thiểu thực tế: ảnh chạy nặng 4.86 GB vì mang theo Chromium
> cho bộ dò shadowban, và gói miễn phí không đủ chỗ.

## Bước 4 — Nạp kho từ máy dev lên Railway

**Làm bây giờ, khi Postgres còn rỗng.** Làm sau khi app đã dựng bảng là đụng bảng trùng tên.

Ở máy anh, đảm bảo `pg_dump` và `psql` có trong PATH (`C:\Program Files\PostgreSQL\18\bin`), rồi:

```bash
npm run db:backup
```

> ⚠️ **`pg_dump` phải có major ≥ major của SERVER, không phải bằng bản database ở máy mình.**
> Railway cấp `postgres-ssl:18`, nên máy dev cài bản 17 là **không sao lưu được từ máy chủ** —
> `pg_dump` từ chối thẳng, không phải cảnh báo:
>
>     pg_dump: error: server version: 18.x; pg_dump version: 17.x
>
> Đã vấp thật 06/08/2026, và nó chỉ lộ ra ở bước 10 chứ không phải ở đây: lượt **nạp** chạy được
> vì `psql` không có ràng buộc đó — nó chỉ gửi SQL dạng chữ. `Dockerfile` cũng đã đổi sang
> `postgresql-client-18` cho cùng lý do.
>
> **Cách cài bản 18 mà không đụng vào bản 17 đang có** (không cần quyền admin, gỡ đi chỉ là xóa
> một thư mục): tải *PostgreSQL 18 Windows x86-64 binaries* — bản `.zip`, **không phải installer**
> — ở [enterprisedb.com/download-postgresql-binaries](https://www.enterprisedb.com/download-postgresql-binaries),
> giải nén riêng thư mục `pgsql\bin` (69 file, ~80 MB) ra `C:\Users\<tên>\pgsql18\bin`, rồi đặt nó
> **lên đầu** PATH của phiên làm việc:
>
> ```powershell
> $env:PATH = "C:\Users\anhha\pgsql18\bin;$env:PATH"
> ```
>
> Phải **lên đầu**, vì bản 17 vẫn còn trong PATH của máy và ai đứng trước thì thắng. Kiểm bằng
> `pg_dump --version` — phải ra `18.x`. Muốn khỏi gõ lại mỗi lần thì thêm đường dẫn đó vào PATH
> người dùng bằng hộp thoại *Environment Variables* của Windows; **đừng dùng `setx`**, nó cắt cụt
> PATH ở 1024 ký tự mà không báo gì.

Xem dòng kết quả — nó in **số hàng dữ liệu**. Phải thấy proxy trong đó, không phải số 0.

Rồi nạp lên Railway. Lấy chuỗi nối ở dịch vụ Postgres → nút **Connect** (góc trên phải) → mục
**Public Network**. Panel đó in chuỗi **đã ghép giá trị thật**, dạng
`postgresql://postgres:AbC123...@shortline.proxy.rlwy.net:41234/railway`.

> ⚠️ **Đừng copy `DATABASE_PUBLIC_URL` ở tab Variables.** Railway hiển thị nó ở **dạng bản mẫu** —
> `postgresql://${{PGUSER}}:${{PGPASSWORD}}@${{RAILWAY_TCP_PROXY_DOMAIN}}:…` — vì `${{…}}` là cách
> Railway trỏ sang biến khác của chính nó, và nó chỉ được thay thành giá trị thật lúc container
> chạy. Dán bản mẫu đó vào terminal thì PowerShell báo *"Invalid URI: The hostname could not be
> parsed"*. Nút **Connect** là chỗ chắc ăn; trong tab Variables thì phải bấm **biểu tượng con
> mắt** mới thấy giá trị đã ghép.
>
> Railway giấu kỹ quá thì đi đường CLI, chắc chắn ra giá trị thật:
> `npm i -g @railway/cli; railway login; railway link; railway variables --service Postgres --kv`

Chỉ cần dán **đúng một chuỗi**, khối dưới tự tách ra thành các biến libpq:

```powershell
cd E:\MKTTool
$env:PATH = "C:\Program Files\PostgreSQL\18\bin;$env:PATH"
$raw = 'DÁN_CHUỖI_NỐI_VÀO_ĐÂY'
if ($raw -match '\$\{\{') { throw "Đây là BẢN MẪU của Railway, chưa phải giá trị thật. Lấy ở nút Connect -> Public Network của dịch vụ Postgres." }
$u = [uri]$raw
$parts = $u.UserInfo -split ':', 2
$env:PGHOST     = $u.Host
$env:PGPORT     = $u.Port
$env:PGUSER     = $parts[0]
$env:PGPASSWORD = [uri]::UnescapeDataString($parts[1])
$env:PGDATABASE = $u.AbsolutePath.TrimStart('/')
$env:PGSSLMODE  = 'require'
"Sẽ nạp vào -> $env:PGUSER@$env:PGHOST port $env:PGPORT db $env:PGDATABASE"
```

Dòng cuối in ra chỗ nó sắp nạp vào — **đọc dòng đó trước khi chạy tiếp**. Host phải là
`*.proxy.rlwy.net`, port là số 5 chữ số, db là `railway`. Đúng rồi mới nạp:

```powershell
psql -v ON_ERROR_STOP=1 -f data\backups\mkttool-<ngày>-<giờ>.sql
```

Bản sao xuất kèm `--no-owner --no-privileges` nên nạp được vào Railway dù tên role khác máy anh.

> **`ON_ERROR_STOP=1` không phải tùy chọn làm màu.** Mặc định `psql -f` gặp lỗi vẫn **chạy tiếp
> hết file**, chỉ in `ERROR:` rồi đi. Với một bản khôi phục thì đó là kiểu hỏng tệ nhất: nhận về
> một database *có vài bảng*, trông như đã xong, và chỗ thiếu chỉ lộ ra nhiều ngày sau. Có cờ này
> thì hoặc vào đủ, hoặc dừng ngay ở chỗ hỏng đầu tiên — và câu lỗi nằm ở cuối màn hình thay vì
> trôi mất giữa hàng trăm dòng.

> **Ba cái bẫy ở khối trên, cả ba đều đã sập thật khi làm lần đầu:**
>
> - **`${{PGUSER}}` không phải thứ gõ vào terminal.** Đó là cú pháp tham chiếu **của riêng
>   Railway**, chỉ có nghĩa bên trong ô Variables trên trang của họ. PowerShell đọc `${...}` là
>   biến của nó và báo lỗi cú pháp.
> - **Nháy đơn quanh URL, không phải nháy kép.** PowerShell **nuốt `$`** trong nháy kép, nên mật
>   khẩu chứa `$` bị cắt mất một khúc — và lỗi báo ra là *"xác thực thất bại"*, không hề chỉ về
>   phía gõ nhầm.
> - **Đừng nhét URL thẳng vào tham số của `psql`.** Tham số dòng lệnh thì ai đăng nhập trên máy
>   cũng đọc được (Task Manager, `Get-CimInstance Win32_Process`), mà đó là chìa vào toàn bộ kho
>   ciphertext. Chính là lý do `src/lib/db/postgres-connection-env.ts` cũng đi đường biến môi
>   trường. Tiện thể khỏi phải mã hóa `@ / #` thành `%40 %2F %23`.
>
> `$env:` chỉ sống trong cửa sổ đó, đóng đi là mất. **Đừng dùng `setx`** — nó giới hạn 1024 ký tự
> và cắt cụt PATH một cách lặng lẽ.

Đối chiếu ngay, đừng tin dòng "thành công". Biến vẫn còn trong cửa sổ đó nên không phải khai lại:

```powershell
psql -c 'SELECT count(*) FROM \"Proxy\";'
```

```powershell
psql -c 'SELECT count(*) FROM _prisma_migrations;'
```

> Cặp `\"` là **bắt buộc**, không phải thừa. Tên bảng của Prisma viết hoa nên trong SQL phải có
> nháy kép, mà PowerShell **nuốt mất nháy kép** khi chuyển tham số sang một chương trình ngoài —
> viết `'... FROM "Proxy"'` thì Postgres nhận được `FROM Proxy`, tự hạ thành `proxy` viết thường
> và báo *relation "proxy" does not exist*. Câu lỗi đó trông y hệt "bảng chưa được tạo", nên rất
> dễ đi sửa nhầm phía khôi phục.

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

## Bước 5 — Tạo dịch vụ web

Hai đường. **5A là đích, và đã tới nơi ngày 06/08/2026.** 5B là đường tạm dùng trong lúc chờ owner
của org cấp quyền — giữ lại vì cùng cảnh sẽ gặp ở dự án khác, và vì nó là đường lùi khi GitHub App
gặp trục trặc.

### 5A — Nối GitHub (đích)

1. Trong cùng dự án Railway: **New** → **GitHub Repo** → chọn `Techieslab-app/MKTTool`.
2. Cho phép Railway truy cập kho nếu nó hỏi.
3. Vào dịch vụ vừa tạo → **Settings**:
   - **Source → Branch:** `master`
   - **Build:** Railway tự nhận `Dockerfile` ở gốc kho. Không cần đổi gì.
   - **Deploy → Pre-Deploy Command:** `npx prisma migrate deploy`
     — lệnh này chạy trong **image runner**, nên `prisma.config.ts` phải được chép vào đó. Prisma 7
     giữ `url` ở file config chứ không ở `schema.prisma`; thiếu file thì lệnh nạp được schema rồi mới
     chết với *"The datasource.url property is required"*, còn log build vẫn xanh và image vẫn push
     xong. Chỉ log **chạy** mới lộ. Đã vấp thật 06/08/2026, vá ở `Dockerfile`.

> ⚠️ **Repo thuộc org thì phải là OWNER của org mới cài được GitHub App.** Đã vấp thật: tài khoản
> chỉ là `member` (quyền `push`, không có `admin`), nên không tự cài được.
>
> Xin quyền ở https://github.com/apps/railway-app/installations/new — chọn org, GitHub sẽ hiện nút
> **Request** thay vì Install rồi báo cho owner. Nhắn thẳng cho một owner thì nhanh hơn.
>
> ⚠️ **Owner cài xong rồi repo VẪN không hiện trong danh sách Connect Repo — và đây là bẫy riêng,
> không phải cài thiếu.** Danh sách đó **lọc theo quyền `admin` trên từng repo**, mà `member` chỉ có
> `push`. Kiểm bằng `gh api repos/Techieslab-app/MKTTool --jq .permissions`: `admin: false` là sẽ
> không bao giờ thấy repo trong ô chọn, dù GitHub App đã cài đủ và badge `installed` đã hiện.
>
> Mất gần một tiếng ngày 06/08/2026 vì chỗ này. Thứ làm nó tốn thời gian là **thông báo lỗi trỏ sai
> hướng**: UI chỉ nói `GitHub Repo not found`, nghe như thiếu quyền truy cập, nên cả buổi đi xin
> owner cấp thêm quyền — trong khi quyền đã đủ từ lâu và chỗ hỏng là vai trò của mình trong org.
>
> **Đừng đi xin quyền `admin`. Nối bằng CLI** — lệnh ở khối dưới gọi thẳng API nên không đi qua cái
> lọc đó. Đây cũng đúng là cách lượt thành công đầu tiên đã nối.
>
> Đừng chẩn đoán bằng token CLI. Nhóm query `github*` của API Railway chỉ mở cho phiên trình duyệt;
> gọi bằng token CLI thì `githubRepos` trả `Not Authorized` còn `githubRepoBranches` trả
> `GitHub Repo not found` **bất kể trạng thái thật ra sao**. Đã tin nhầm hai lượt.
>
> **Đừng clone sang repo cá nhân để đi vòng.** Nó chỉ hơn 5B đúng một điểm (thử được vòng
> *push → tự deploy*, mảnh ít khả năng hỏng nhất), đổi lại nhận ba thứ: hai nguồn sự thật, một bản
> sao private của org nằm trên tài khoản cá nhân, và thứ nghiệm thu không phải thứ sẽ chạy. GitHub
> cũng không cho fork thẳng repo private của org, nên còn nhiều bước hơn 5B.

**Đã lỡ dựng service bằng 5B rồi thì KHÔNG phải dựng lại** — đổi nguồn của chính service đó, để
giữ nguyên domain, biến môi trường và redirect URI đã khai:

```powershell
railway service source connect --repo Techieslab-app/MKTTool --branch master --service mkttool-web
```

Railway dựng deployment trigger và **build ngay một lượt từ `master`**.

> ⚠️ **`source connect` reset Builder về Railpack.** Sau khi chạy, ô `builder` trong API ghi
> `RAILPACK` chứ không phải `DOCKERFILE`. Thực tế **không sao** — Railway tự nhận `Dockerfile` ở gốc
> kho lúc build và đè lên giá trị lưu, UI hiện `Dockerfile · Automatically Detected`. Kiểm ở
> `serviceManifest.build` của lượt deploy: `builder: DOCKERFILE, dockerfilePath: /Dockerfile` là
> đúng. Đừng hoảng vì con số trong Settings.

> ⚠️ **Vá `rootDirectory` TRƯỚC khi chạy lệnh này.** Lệnh build ngay lập tức, nên mọi cấu hình sai
> đều nổ trong lượt đó. Ngày 06/08/2026 một cú Disconnect đã dán tên repo vào ô **Root Directory**
> (`/Techieslab-app/MKTTool`) — ô nằm ngay dưới Source Repo, nhìn giống nhau, và nhận giá trị sai mà
> không cảnh báo gì. Trỏ vào thư mục con không tồn tại thì hỏng cả deploy từ GitHub lẫn `railway up`.

> ⚠️ **Trước khi bấm, kiểm `master` đã có đủ code chưa.** Từ giây đó Railway deploy `master`, không
> deploy thứ trên ổ đĩa nữa — còn commit nào chưa merge thì web **tụt về bản cũ mà không có gì
> báo**. Kiểm bằng `git log --oneline origin/master..HEAD`: trống là xong.

### 5B — Đẩy thẳng từ máy (đường tạm)

Không cần GitHub. Dùng đúng `Dockerfile` này. Mất phần tự deploy — mỗi lần cập nhật phải tự gõ lại.

> Chỉ dùng khi **chưa** nối được GitHub. Đã nối rồi mà vẫn `railway up` thì đang đẩy thứ trên ổ đĩa
> đè lên thứ `master` vừa deploy — hai nguồn cho một service, và không có gì báo cái nào đang chạy.

```powershell
npm i -g @railway/cli
```

```powershell
railway login
```

```powershell
railway link
```

`railway link` hỏi chọn project — chọn **đúng project đang có Postgres**, đừng tạo mới. Rồi tạo
service **rỗng** trước, để có chỗ khai biến:

```powershell
railway add --service mkttool-web
```

Làm tiếp bước 6 và 7 (khai biến, pre-deploy, domain) trên bảng điều khiển, **rồi mới** đẩy code —
`TEAM_TIMEZONE` được nhúng vào bundle lúc build, nên đẩy trước khi khai biến là phí một lượt build
mười phút:

```powershell
railway up --service mkttool-web
```

Ba thứ phải nhìn khi nó chạy:

| Nhìn | Đúng | Sai thì |
|---|---|---|
| Dung lượng đẩy lên | vài MB | vài trăm MB → `.railwayignore` không được đọc, **Ctrl+C ngay**, `.env` đang trên đường đi |
| Cách build | có chữ `Dockerfile` | thấy `Nixpacks` → nó không tìm ra Dockerfile, ảnh sẽ thiếu Chromium và `pg_dump` |
| Pre-deploy | `No pending migrations to apply` | báo đang áp 5 migration → nó nhìn nhầm database, **dừng lại** |

`railway up` đẩy **thứ đang nằm trên ổ đĩa**, không phải thứ đã commit — kể cả file sửa dở và
nhánh đang đứng. Tiện lúc chạy thử, nhưng nhớ: khi chuyển sang 5A thì thứ Railway deploy là
`master`, và chưa merge thì **web tụt về bản cũ mà không có gì báo**.

`.railwayignore` là thứ giữ `.env` không rời khỏi máy. `.dockerignore` không cứu được ở đây — nó
lọc lúc *build*, tức sau khi file đã nằm trên máy của hãng rồi.

### Chung cho cả hai đường

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
PORT=3000
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

1. Dịch vụ web → **Settings** → **Networking** → **Generate Domain**. Nó hỏi *"Enter the port your
   app is listening on"* và điền sẵn gợi ý `8080` — **gõ đè thành `3000`**.

   `Dockerfile` khai `ENV PORT=3000` + `EXPOSE 3000`, và `next start` đọc `process.env.PORT`. Ô
   này là cổng Railway chuyển tiếp **tới**, nên gõ sai là domain có nhưng vào ra 502 trong khi
   log ứng dụng **hoàn toàn sạch** — request chưa bao giờ tới được app, nên không có gì để log.
   Kiểu hỏng này rất tốn thời gian đoán.

   Khai luôn `PORT=3000` trong **Variables** cho chắc: Railway có thể tự bơm một `PORT` khác vào
   service, và nếu nó bơm `8080` trong khi domain trỏ `3000` thì hỏng đúng như trên. Khai thẳng
   thì hai đầu chắc chắn khớp, không phải tin vào hành vi mặc định của hãng.

2. Nhận được một địa chỉ dạng `mkttool-production-xxxx.up.railway.app`. Quay lại **Variables**,
   thêm:

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

| Kiểm | Đúng thì thấy gì | 06/08 |
|---|---|---|
| Đăng nhập bằng Google | vào được, và **email ngoài `ALLOWED_EMAILS` thì bị chặn** — thử luôn một email lạ | ✅ vào được |
| Khay cảnh báo trên đầu trang | **không có dòng nào về khóa.** Có dòng vàng *"máy chủ vẫn giữ VAULT_KEY_OPERATOR"* nghĩa là khai nhầm ở bước 6 | – |
| `/proxies` | đủ **10** proxy Webshare — chứng minh bản sao nạp đúng | ✅ đếm trên database |
| Bấm **"Kiểm"** một proxy | ra kết luận thật (Sống / Chết / …). Đây là phép thử `VAULT_KEY_SERVER` đúng khóa: sai khóa thì không giải mã được mật khẩu proxy | – |
| `/health` → khối *"Lịch dò hằng ngày"* | *"Tự chạy 09:00 mỗi ngày theo giờ team"* | – |
| Log của dịch vụ web lúc khởi động | dòng `[lịch dò] Bật: 09:00 mỗi ngày theo Asia/Ho_Chi_Minh.` | ✅ |
| `/relay-download` | nói *"chưa có gói"* kèm đường dẫn nó đã tìm. Đúng — `.exe` chưa lên máy chủ, xem bước 12 | – |

> **Bộ lịch đã tự chạy thật lúc 09:02 giờ team ngày 06/08/2026**, và log ghi đúng câu nó phải ghi:
> *"Bỏ qua: chưa có proxy quan sát viên nào đang bật"*. Câu đó chỉ ra được sau khi bộ lịch đã đọc
> bảng `ScheduledJobRun`, giành quyền chạy, kiểm khóa chống chạy chồng rồi đếm proxy — bốn truy
> vấn liên tiếp. Nên nó chứng minh một lượt cả bộ lịch, cả kết nối database, cả múi giờ.

## Bước 10 — Nếp sao lưu

**Hai nửa, và cần cả hai.**

> ⚠️ **Sao lưu ổ đĩa của Railway đòi gói Pro** ($20/tháng mỗi workspace), Hobby không có. Nhưng
> đó không phải lý do chính để không trông vào nó: bản sao của Railway **nằm cùng tài khoản với
> bản gốc**, nên nó không chống được ca tệ nhất — mất cả dự án, hoặc mất tài khoản. Thứ nó thêm
> vào chỉ là *chạy đều mà không cần ai nhớ*, và nửa thứ ba dưới đây làm đúng việc đó, miễn phí.

> ✅ **Nửa thứ hai đã chạy trọn vòng ngày 06/08/2026**, kể cả phần hay bị bỏ: hút bản sao về
> (`mkttool-prod-…sql`, 21 hàng trong 6 bảng), **rồi khôi phục nó vào một Postgres cục bộ rỗng và
> đối chiếu** — 10 `Proxy`, 1 hàng `ScheduledJobRun` với `outcome = SKIPPED` đúng như bộ lịch ghi
> trên máy chủ, và `passwordEnc` vẫn dài 59 ký tự tức vẫn là ciphertext.
>
> Bước khôi phục thử mới là bước chứng minh. Hút được một file `.sql` chỉ chứng minh `pg_dump`
> chạy xong.

1. **Railway tự sao lưu ổ đĩa.** Dịch vụ Postgres → **Settings** → **Backups** → bật lịch hằng
   ngày. Cái này chống lỡ tay xóa dữ liệu và migration hỏng.
2. **Kéo một bản về máy anh.** Thêm vào `.env` **của máy anh** (không phải của máy chủ):

```
PRODUCTION_DATABASE_URL="<DATABASE_PUBLIC_URL>?sslmode=require"
```

Nhớ **cài PostgreSQL 18 client trước** — máy dev đang ở bản 17 thì `pg_dump` từ chối dump từ
server 18, xem cách cài ở bước 4. Rồi:

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

### Nửa thứ ba: app tự đẩy bản sao lên R2 mỗi đêm

Hai nửa trên đều **cần một người nhớ**. Nửa này không: app tự `pg_dump` rồi tải lên Cloudflare R2
theo giờ hẹn, độc lập với máy của bất kỳ ai.

**1. Dựng bucket và token ở Cloudflare** (một lần, ~5 phút):

1. Cloudflare Dashboard → **R2** → **Create bucket**, đặt tên ví dụ `mkttool-backup`. **Để riêng
   tư** — đừng bật public access.
2. **R2** → **Manage API Tokens** → **Create API Token**:
   - Quyền: **Object Read & Write**
   - Phạm vi: **chỉ bucket vừa tạo**, không phải *Apply to all buckets*
3. Chép **Access Key ID**, **Secret Access Key**, và **Account ID** (góc phải trang R2).

> Phạm vi token là chỗ đáng chậm lại một phút. Token này nằm trong biến môi trường của app — cùng
> chỗ với `VAULT_KEY_SERVER`. Một token đọc-ghi-mọi-bucket ở đó **mở rộng** thiệt hại của một lần
> chiếm máy chủ chứ không thu hẹp nó.

**2. Khai năm biến** vào Variables của dịch vụ web:

```
BACKUP_DAILY_AT=03:00
R2_ACCOUNT_ID=<Account ID>
R2_BUCKET=mkttool-backup
R2_ACCESS_KEY_ID=<Access Key ID>
R2_SECRET_ACCESS_KEY=<Secret Access Key>
```

Đặt giờ đêm để không đụng lượt dò shadowban buổi sáng. **Bốn biến `R2_*` phải khai đủ hoặc bỏ
trống cả bốn** — khai một nửa thì app dừng kèm thông báo, vì "chạy một nửa" ở đây nghĩa là tin
rằng mình có bản sao mà thật ra không.

**3. Nghiệm thu**, và đây mới là phần quan trọng:

| Kiểm | Đúng thì thấy gì |
|---|---|
| Log máy chủ lúc khởi động | `[sao lưu] Bật: 03:00 mỗi ngày theo Asia/Ho_Chi_Minh, lên R2.` |
| Sáng hôm sau, log | `[sao lưu] Đã tải lên R2: mkttool/2026-08/… (35 KB, N hàng trong M bảng)` |
| Bucket R2 | có object đúng tên đó |
| Trang **Hôm nay** | **không** có dải cảnh báo nào về sao lưu |
| Tải object đó về rồi `psql -f` vào một database rỗng | ra đúng số hàng — **bản sao chưa thử khôi phục là bản sao chưa biết dùng được không** |

**Nó không hỏng lặng lẽ được.** Ký sai thì R2 trả `403 SignatureDoesNotMatch` ngay lượt đầu; dump
rỗng thì **không** được tải lên mà bị ghi là thất bại; và trang Hôm nay kêu **đỏ** trong cả ba ca:
lượt gần nhất hỏng, bản sao mới nhất quá 2 ngày tuổi, hoặc bật rồi mà chưa chạy lần nào.

> **Cố ý KHÔNG tự xóa bản cũ trên R2.** Mỗi bản ~35 KB, tức 13 MB một năm, trong khi hạn miễn phí
> của R2 là 10 GB — dọn dẹp không giải quyết vấn đề nào có thật, còn một lỗi trong logic dọn thì
> âm thầm xóa đúng thứ cả tính năng này sinh ra để giữ.

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

Xếp theo thứ tự nên làm.

1. **Xin quyền GitHub App cho org, rồi chuyển từ 5B sang 5A.** Chừng nào còn `railway up` thì
   tiêu chí *"đẩy một commit lên GitHub → web tự cập nhật"* chưa đạt, và mỗi lượt deploy vẫn là
   một cơ hội để đè nhầm service.
2. **Cài PostgreSQL 18 client ở máy quản trị**, rồi chạy thật `npm run db:backup:remote` một lượt.
   Chưa chạy được lần nào thì nếp sao lưu mới chỉ là chữ trên giấy.
3. **Bật sao lưu ổ đĩa của Railway** (bước 10, nửa thứ nhất).
4. **Khai một proxy quan sát viên**, để lượt dò 09:00 hôm sau chạy thật thay vì bỏ qua.
5. **Phép thử hai tiến trình dò chạy song song.** Chạy `npm run health` ở máy anh (trỏ vào
   `PRODUCTION_DATABASE_URL`) đúng lúc bấm *"Dò cả đàn"* trên web. Lượt thứ hai phải bị từ chối
   kèm câu nói rõ **máy nào**, tiến trình nào đang giữ và giữ bao lâu rồi. Đây là thứ chỉ chứng
   minh được khi khóa đã bắc qua hai máy thật.
6. **Facebook** (bước 11) và **`.exe` cầu nối** (bước 12) — cả hai đều hoãn được.
7. **Deploy thử sang một hãng khác** (Render/Fly) bằng đúng `Dockerfile` này, không sửa code — tiêu
   chí của QĐ 9, để biết mình chưa bị khóa vào Railway.
