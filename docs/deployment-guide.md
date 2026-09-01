# Đưa MKTTool lên Railway — làm từng bước

**Cập nhật:** 01/09/2026 | The Vietnamese walkthrough below is retained historical context; the
current Lane A procedure is the English overlay immediately following this line.

## Consolidation release procedure — 1 September 2026

This is the current Lane A overlay; the older ceremony below is retained as historical context.
Railway deploys the MKTTool Web service from `master` through the GitHub integration
(`.github/workflows/ci.yml:235`). The Browser engine and five-artifact compatibility tuple are not
web-deployment prerequisites.

Required sequence:

1. Confirm the release branch has no uncommitted source. Keep the protected `AGENTS.md` files out
   of staging. Require the exact self-hosted CI jobs to be green.
2. Take a fresh production backup and verify it in a disposable database:

   ```powershell
   npm run db:backup:remote
   npm run db:restore:verify -- --dump data/backups/mkttool-prod-<timestamp>.sql --report $env:TEMP\restore.json
   ```

   Record dump/report hashes, aggregate row counts, mismatch count, and cleanup status. Never commit
   the SQL dump; it contains encrypted production values.

3. Record the rollback tuple before merging. Query the currently active deployment and its
   `meta.commitHash` with `railway status --json`; use those observed values as the rollback target,
   then record `npx prisma migrate deploy`, the candidate source SHA, Relay version, and schema state.
   Never copy a prior deployment ID from this document into a new release.
4. Merge the approved PR to `master`; do not use a bare `railway up`. Capture `railway status` before
   and after the GitHub/Railway deployment. The merge is the deployment.
5. Verify from outside the service: `/api/healthz` must be HTTP 200 with `ok:true`, `status:"ready"`,
   database/release checks, and Relay v16; an authorized full GET of
   `/api/relay/download/v16` must match the immutable published bytes by size and SHA. A HEAD request
   is insufficient.
6. Observe per-client rate limiting and the absence of the Better Auth shared-IP warning. Run the
   bounded Lane A smoke and label synthetic checks separately. The disposable rollback rehearsal is
   complete and retained in the evidence report; any production rollback is approved and executed
   by a human.
7. After the deployment passes the external health, full-GET, and log checks, configure the Railway
   service instance `healthcheckPath` to `/api/healthz` (and verify the setting). Keep
   `healthcheckTimeout` unset (`null`) unless a measured startup SLO requires a different value:
   Railway's documented inherited bound is 300 seconds at deploy time, so `null` is bounded rather
   than infinite. Do not treat a deployment-manifest `null` field as proof that the service-instance
   setting is absent.

Current evidence: branch run `33296599912` and post-merge master run `33297347911` are green for
the required MKTTool jobs. The current hardening deployment is `0a696033-b610-492c-b75a-3e918cca102a`
at commit `2734e2f0ba9c2a2f9c3731a44540c01d263b36e2`; its 24-hour health window is 947/947 HTTP
200 with zero server 5xx, and an authorized full `/v16` GET matches the immutable published SHA.
The service-instance `healthcheckPath` is `/api/healthz`; the earlier 404/401 probes are retained as
explicitly labelled pre-merge history in the plan report, not as current state. The bounded
credentialed/admin smoke is PASS; the owner signed CONDITIONAL GO on 1 September 2026 and accepted
residual risks 1–8.

The Browser five-artifact tuple is P4b only. Its missing Stable `.2` engine archive remains an OPEN
technical item; it does not block this web procedure. Lane C is CLOSED because no CloakBrowser channel
exists; do not send a request or promise a date.

### Executed 30 August receipt (example, not a reusable rollback target)

For the 30 August merge only, the observed pre-merge rollback target was deployment
`3621f603-1c51-4246-824c-55cc0e6b5764` at commit `c819e6a8dff5cac027d24b4a9d488ec241e2ccaa`.
The successor deployment was `8e1123a3-c7f6-49a8-bb97-68c35bd4807a` (later docs deployment
`c4ac6781-6c41-486f-9e24-eeaf67aed22b`), and the current service setting is
`healthcheckPath=/api/healthz`. This is immutable evidence for that release, not a template for a
future rollback tuple; always query `railway status` afresh.

Đây là **danh sách thao tác tay**, làm theo đúng thứ tự. Thứ tự không tùy tiện — có ba chỗ
phụ thuộc nhau và làm ngược là phải quay lại:

> **Historical walkthrough notice:** the detailed Vietnamese walkthrough from 6–29 August below is
> retained for incident context and exceptional fallback only. Its “remaining work”, dates, and
> status statements are not the current release ledger. For 30 August, follow the consolidation
> sequence at the top of this file: master merge → external checks → service-instance healthcheck.

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

## Historical/manual fallback — not the current Lane A deployment path

The detailed `railway up` walkthrough below is retained for the exceptional case where the GitHub
integration is unavailable. It is not the normal path for the current service: Railway deploys from
`master`, and a bare `railway up` is never acceptable. The post-deploy record in the consolidation
plan is authoritative for 30 August 2026.

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
cd E:\MKTWorkspace\MKTTool
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
> **Lối ra là xin quyền `admin` trên repo** — không phải quyền org, không phải cài lại App. Owner
> mở `https://github.com/<org>/<repo>/settings/access`, đổi role của mình từ Write thành Admin. Ngay
> sau đó ô Connect Repo hiện repo, ô **Branch** đọc được `master`, và dòng *"Auto deploys when pushed
> to GitHub"* mới xuất hiện.
>
> ⚠️ **Nối bằng CLI đi vòng được qua bộ lọc, nhưng chỉ nối được một nửa — đừng dùng.** Lệnh
> `railway service source connect` gọi thẳng API nên chạy được khi chưa có `admin`, và nó lừa rất
> khéo: source hiện đúng tên repo, `deploymentTriggers` có bản ghi đủ `provider/repository/branch`,
> deploy thủ công từ GitHub chạy ngon. Nhưng **webhook không bao giờ được đăng ký** — phần đó mới là
> phần đòi quyền quản trị repo. Hệ quả: merge vào `master` rồi ngồi đợi 20 phút không có lượt nào,
> mà không có thông báo nào nói vì sao. Đã vấp thật 06/08/2026.
>
> Railway còn **cache quyền của người dùng**: được cấp `admin` xong lệnh CLI vẫn báo
> `User does not have access to the repo`. Nối lại bằng **UI** thì Railway đọc lại quyền và thông
> ngay. Một lý do nữa để dùng UI.
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
giữ nguyên domain, biến môi trường và redirect URI đã khai. Làm **trong UI**:

> Service → **Settings → Source** → **Connect Repo** → chọn repo → **Branch** = `master`.
> Xong phải thấy dòng *"Auto deploys when pushed to GitHub"*. **Không thấy dòng đó là chưa nối
> xong**, dù tên repo đã hiện — đó đúng là trạng thái nửa vời mà đường CLI để lại.

Nối xong, kéo `master` về bằng lệnh này (khác `railway redeploy` trần, vốn dựng lại đúng commit cũ):

```powershell
railway redeploy --from-source --service mkttool-web --yes
```

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
| `/relay-download` | có gói, đúng dung lượng và mã băm của bản vừa `relay:publish` — xem bước 12. Chưa dựng ngăn R2 thì nó nói *"chưa có gói"* kèm chỗ đã tìm, và đó là câu đúng chứ không phải lỗi | – |

> **Bộ lịch đã tự chạy thật lúc 09:02 giờ team ngày 06/08/2026**, và log ghi đúng câu nó phải ghi:
> *"Bỏ qua: chưa có proxy quan sát viên nào đang bật"*. Câu đó chỉ ra được sau khi bộ lịch đã đọc
> bảng `ScheduledJobRun`, giành quyền chạy, kiểm khóa chống chạy chồng rồi đếm proxy — bốn truy
> vấn liên tiếp. Nên nó chứng minh một lượt cả bộ lịch, cả kết nối database, cả múi giờ.

## Step 10 - Back up and prove restoration

MKTTool needs nightly R2 dumps plus an administrator copy that survives provider-account loss.
Follow the [database backup and restore runbook](database-backup-and-restore.md).

Before every schema-changing deployment, run `npm run db:backup:remote` and prove restoration;
`prisma migrate deploy` does not create a backup.

## Bước 11 — Facebook (làm khi cần đăng Fanpage)

Bỏ qua được, cả app vẫn chạy bình thường thiếu nó.

> ✅ **Đã đi trọn một lượt thật 06/08/2026.** Nick `Anh Hao`, Page `BaeJiyeon TFT`, đích đăng tự
> tạo, kiểm token 16:08 báo *"Token không có hạn (sinh từ user token dài hạn)"*.
>
> **Meta CHẤP NHẬN domain `*.up.railway.app`** — rủi ro để mở từ lúc lập kế hoạch, nay đóng, và
> **không phải mua tên miền riêng**. Chỗ vấp thật không nằm ở domain mà ở 11.3 (a) bên dưới.

> **KHÔNG tạo Meta App mới.** App hiện có đã đăng thật lên Fanpage ngày 03/08/2026 — nó đúng loại
> (Business + Facebook Login for Business) và đã có configuration với ba quyền. Việc ở đây là
> **trỏ app đó sang domain Railway**, tức thêm một redirect URI thứ hai. Tạo app mới là làm lại
> từ đầu phần khó nhất (chọn sai use case lúc tạo là **không sửa được**, phải bỏ app đi).

### 11.1 — Chép ba giá trị từ `.env` máy anh

`FACEBOOK_APP_ID` · `FACEBOOK_APP_SECRET` · `FACEBOOK_LOGIN_CONFIG_ID`

Chép **nguyên văn**, đừng gõ lại tay.

### 11.2 — Khai bốn biến vào Variables của dịch vụ web

Ba biến trên, cộng thêm:

```
FACEBOOK_REDIRECT_URI=https://mkttool-web-production.up.railway.app/api/facebook/oauth/callback
```

**Không có dấu `/` ở cuối.** Facebook so chuỗi thô từng ký tự.

> **Khai thiếu biến này thì hỏng theo kiểu khó đoán:** mặc định trong code là
> `http://localhost:3000/api/facebook/oauth/callback` — máy chủ sẽ tự tin gửi người dùng tới một
> địa chỉ localhost không tồn tại. Xem `DEFAULT_REDIRECT_URI` trong
> [facebook-app-config.ts](../src/lib/facebook/facebook-app-config.ts).

### 11.3 — Khai domain ở Meta App, **hai chỗ khác nhau**

Đây là chỗ vấp thật ngày 06/08/2026. Meta có **hai** ô khai domain, nằm ở hai trang khác nhau, và
thiếu ô nào cũng chặn — nhưng bằng hai câu lỗi khác nhau nên rất dễ tưởng đã làm xong.

**(a) App Domains — `Settings` → `Basic`.** Làm cái này **trước**.

1. Kéo xuống đáy trang → **`+ Add Platform`** → chọn **`Website`** → *Site URL*:
   `https://mkttool-web-production.up.railway.app/`
2. Kéo lên ô **App Domains** → thêm `mkttool-web-production.up.railway.app`
   — **chỉ domain**, không `https://`, không đường dẫn.
3. **Save Changes**.

> **Thứ tự không tùy tiện.** Meta đối chiếu ô App Domains với các URL nền tảng đã khai; chưa thêm
> platform Website thì nó từ chối domain. Làm ngược là quay lại làm từ đầu.

**(b) Valid OAuth Redirect URIs — `Facebook Login for Business` → `Settings`.**

Dán đúng chuỗi đầy đủ ở 11.2 → **Save Changes**.

> **Giữ nguyên chuỗi `localhost` đang có, đừng thay.** Meta cho khai nhiều URI, và máy dev vẫn cần
> chuỗi cũ để chạy. Thay thì lần sau chạy `npm run dev` là luồng kết nối hỏng.

### 11.4 — Thêm cả team vào vai trò Tester

**Bước này hay bị bỏ, và nó chặn cả team chứ không chặn anh.**

App đang ở chế độ **Development**. Ở chế độ đó, **chỉ người có vai trò trong app** mới cấp quyền
được — người ngoài bấm kết nối sẽ gặp màn hình báo app chưa hoạt động, không phải màn hình cấp
quyền. Anh là admin nên anh không gặp, và vì thế dễ tưởng mọi thứ ổn.

Meta App → **App Roles** → **Roles** → **Add People** → chọn **Tester** → thêm nick Facebook cá
nhân của từng người sẽ nối Fanpage.

> Mỗi người phải **tự vào thông báo Facebook của mình và bấm chấp nhận** lời mời. Chưa chấp nhận
> thì vai trò chưa có hiệu lực, mà lời mời nằm lẫn trong thông báo nên rất dễ trôi. Nhắc bằng lời
> lúc đào tạo, đừng chỉ gửi lời mời rồi thôi.

### 11.5 — Nối Fanpage và kiểm

Mở `https://mkttool-web-production.up.railway.app/facebook` → **Kết nối nick Facebook** → đăng
nhập bằng nick đang quản trị Page → **tick chọn TỪNG Page** ở màn hình cấp quyền (bỏ sót Page nào
là Page đó không hiện ra).

Xong thì bấm **Kiểm tra token tất cả Page** ngay, đừng đợi tới lúc cần đăng gấp.

### Bốn câu lỗi hay gặp, và nghĩa thật của chúng

| Thấy gì | Nguyên nhân thật |
|---|---|
| **"Can't load URL — The domain of this URL isn't included in the app's domains"** | Thiếu **11.3 (a)**: domain chưa có trong *App Domains* ở `Settings → Basic`. Meta chặn ngay tại dialog, **trước** cả bước xét redirect URI — nên khai đủ (b) mà thiếu (a) vẫn hỏng. *(Đã vấp thật 06/08/2026.)* Kèm một tin tốt: câu này nhắc tới "domain" nghĩa là `FACEBOOK_REDIRECT_URI` trên Railway đã khai đúng — chưa khai thì nó rơi về `localhost`, mà Meta miễn trừ `localhost` nên lỗi sẽ khác hẳn |
| Facebook báo **"URL Blocked"** / redirect URI không hợp lệ | Chuỗi ở 11.2 và 11.3 (b) lệch nhau — thường là dấu `/` cuối, `http` vs `https`, hoặc quên bấm **Save Changes** |
| App báo *"Đang mở app bằng X nhưng `FACEBOOK_REDIRECT_URI` khai Y"* | Biến ở 11.2 chưa khai hoặc khai sai. Đây là lớp chặn cố ý dừng sớm, không phải lỗi |
| Người trong team thấy màn hình *"app chưa hoạt động"* | Chưa thêm vào Tester (11.4), hoặc đã thêm mà họ **chưa bấm chấp nhận** |
| Đăng được hôm nay, mai hỏng | Token chết không báo trước — nick admin Page đổi mật khẩu, gỡ app, hoặc bị Meta khóa |

> ⚠️ **Câu lỗi ở dòng thứ hai đang chỉ sai giao thức.**
> [facebook-redirect-host-guard.ts:46](../src/lib/facebook/facebook-redirect-host-guard.ts) ghép
> cứng `http://` khi khuyên "mở lại app bằng…" — sót lại từ thời chỉ chạy localhost. Trên máy chủ
> thật nó sẽ bảo anh mở `http://mkttool-web-production…`, tức chỉ sai đúng thứ nó sinh ra để chỉ
> đúng. Đọc câu đó thì tự đổi thành `https`.

> **Đây là chỗ có thể vướng.** Meta có thể từ chối domain `*.up.railway.app` vì nó là domain dùng
> chung. Vướng thì mua một tên miền riêng (~12 USD/năm), trỏ về Railway ở **Settings → Networking
> → Custom Domain**, rồi khai lại `BETTER_AUTH_URL` + hai redirect URI theo tên miền đó. Google
> thì không kén — chỉ Facebook mới là câu hỏi mở.

## Bước 12 — Đưa `.exe` cầu nối lên máy chủ

**Xong 06/08/2026** theo [QĐ 12](../plans/260804-1752-web-chung-cho-team-phan-tan/plan.md#qđ-12--gói-cầu-nối-cất-trên-r2-app-lấy-hộ):
ngăn riêng trên R2, app lấy hộ. Ba đường kia đã cân và loại; lý do từng đường nằm trong QĐ 12,
đừng phân tích lại từ đầu.

`.exe` dựng trên Windows còn ảnh chạy dựng trên Linux, nên nó **không thể nằm trong ảnh Docker** —
đó là lý do phải có một chỗ thứ ba để đặt file.

Đường đi trọn vẹn: máy Windows `relay:build` → `relay:publish` → **R2** → người trong team bấm nút
→ app kiểm phiên đăng nhập → app lấy file từ R2 rồi stream về. Không có URL công khai, không cần
volume, không phồng ảnh.

### Dựng ngăn (một lần, ~5 phút)

Cùng tài khoản Cloudflare đã dựng ở bước 10 — chỉ thêm một bucket và **hai** token.

**1. Tạo bucket riêng**

Cloudflare Dashboard → **R2** → **Create bucket**, đặt tên `mkttool-relay-release`. **Để riêng
tư**, đừng bật public access — QĐ 11 nói gói chỉ tải được sau lớp đăng nhập, mà một bucket public
là một URL ai cầm cũng tải được, tức mở lại đúng thứ vừa đóng.

**2. Tạo hai token, mỗi token một quyền khác nhau**

**R2** → **Manage API Tokens** → **Create API Token**, làm **hai lần**:

| Token | Permissions | Phạm vi | Dán vào đâu |
|---|---|---|---|
| **Đọc** — cho máy chủ | `Object Read only` | chỉ bucket `mkttool-relay-release` | Variables của dịch vụ web trên Railway |
| **Ghi** — cho máy build | `Object Read & Write` | chỉ bucket `mkttool-relay-release` | `.env` trên máy Windows của anh |

Phạm vi phải là **Apply to specific buckets** → chọn đúng bucket vừa tạo, **không** phải *Apply to
all buckets*. Chọn nhầm là token này mở luôn được bucket sao lưu.

**3. Chép ba giá trị mỗi token**

Mỗi lần tạo xong, Cloudflare hiện **Access Key ID** và **Secret Access Key** — *Secret chỉ hiện
đúng một lần*, đóng trang là phải tạo token mới. **Account ID** lấy ở góc phải trang R2, và nó
**giống hệt** `R2_ACCOUNT_ID` của bước 10 vì cùng một tài khoản.

**4. Khai bốn biến, ở hai nơi khác nhau**

Trên **Railway** (Variables của dịch vụ web) — token **đọc**:

```
RELAY_RELEASE_R2_ACCOUNT_ID=<Account ID>
RELAY_RELEASE_R2_BUCKET=mkttool-relay-release
RELAY_RELEASE_R2_ACCESS_KEY_ID=<Access Key ID của token ĐỌC>
RELAY_RELEASE_R2_SECRET_ACCESS_KEY=<Secret của token ĐỌC>
```

Trong **`.env` máy Windows** — token **ghi**, cùng tên biến, khác giá trị:

```
RELAY_RELEASE_R2_ACCOUNT_ID=<Account ID>
RELAY_RELEASE_R2_BUCKET=mkttool-relay-release
RELAY_RELEASE_R2_ACCESS_KEY_ID=<Access Key ID của token GHI>
RELAY_RELEASE_R2_SECRET_ACCESS_KEY=<Secret của token GHI>
```

> ⚠️ **Đừng dán token ghi lên Railway.** Máy chủ không có việc gì phải ghi vào ngăn này — file đi
> lên từ máy đã build. Để chìa ghi ở đó nghĩa là chiếm được máy chủ thì **thay được gói cài mà cả
> team sắp tải về**, tức đổi một ngăn "mất cũng không sao" thành một đường phát tán mã.

> ⚠️ **Đừng nới token sao lưu hiện có cho dùng chung.** Cùng lý do đã ghi ở bước 10: token nằm cạnh
> `VAULT_KEY_SERVER`, nên một chìa mở được mọi ngăn làm nặng thêm hậu quả của một lần chiếm máy chủ.
> Ngăn gói cài chứa thứ công khai được, mất nó không mất gì; ngăn sao lưu thì không.

**5. Bốn biến phải đủ cả bốn hoặc rỗng cả bốn.** Khai một nửa thì app dừng kèm thông báo — cùng
quy tắc với `R2_*`, và cùng lý do: một tính năng không chạy mà nhìn như đang chạy tệ hơn một tính
năng tắt hẳn.

**6. Chìa cho máy dựng installer.** Bộ dựng file cài của MKT Browser phải **tải** gói Relay đã ghim
qua `/api/relay/download/vN`, mà tuyến đó nằm sau lớp đăng nhập Google — máy dựng thì không có
trình duyệt.

Sinh một chìa rồi đặt **hai nơi, cùng giá trị**:

```bash
node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
```

| Nơi đặt | Tên biến |
|---|---|
| Railway (máy chủ) | `RELAY_RELEASE_DOWNLOAD_TOKEN` |
| Máy Windows dựng installer | `MKTTOOL_RELEASE_TOKEN` |

Nó mở **đúng một việc**: tải một bản đã phát hành theo số phiên bản. Không dựng ra người dùng nào,
không đụng được gì khác. Bỏ trống thì tuyến vẫn phục vụ người đã đăng nhập như cũ, chỉ là máy dựng
hết đường tự tải.

Tối thiểu 32 ký tự — ngắn hơn thì máy chủ **dừng hẳn** chứ không lặng lẽ nhận. Một chìa yếu nguy
hiểm hơn không có chìa: không khai gì thì tuyến vẫn đóng, còn khai `"test"` thì nó mở cho người
đoán ra mà không có gì kêu lên.

> ⚠️ **Đừng quay lại dùng cookie phiên.** Cách cũ là dán cookie của một người thật vào biến môi
> trường máy dựng. Cookie đó mở cả kho danh tính cho một việc cần đúng một file zip, lại còn hết
> hạn giữa chừng (build gãy với lỗi 401 trông y hệt lỗi deploy) và chết theo người rời team.

Xoay vòng: đổi giá trị trên Railway, deploy lại, rồi đổi ở máy dựng. Không cần dựng lại gói nào.

### Mỗi lần phát hành

```bash
npm run relay:build      # trên máy Windows
npm run relay:publish    # đẩy lên R2, đính kèm mã băm SHA-256
```

`relay:publish` **đọc lại từ R2 để đối chiếu** sau khi đẩy: một lượt `PUT` trả 200 chứng minh R2
nhận request, không chứng minh thứ nằm trên đó là thứ mình định gửi. Ca hỏng đáng sợ là metadata
mã băm không bám vào object — lúc đó trang tải lặng lẽ bỏ cột SHA-256 mà không ai để ý.

Hai lệnh tách rời có chủ ý: build là việc làm nhiều lần kể cả để thử, còn phát hành là việc **cả
team nhìn thấy** — nó đổi thứ mọi người tải về và bật dải *"cầu nối bản cũ"* trên máy người khác.

> Máy chủ **không khai** bốn biến đó thì nó tìm gói trên đĩa ở `relay/dist` — đường của máy dev vừa
> build xong, để mở thử trang tải mà không phải dựng ngăn R2 trước. Đổi chỗ tìm bằng
> `RELAY_RELEASE_DIR`.

### Nghiệm thu lượt phát hành đầu tiên

| Kiểm ở đâu | Phải thấy |
|---|---|
| Cuối `npm run relay:publish` | `✅ Đã phát hành` — nó chỉ in dòng đó sau khi đã đọc lại từ R2 và đối chiếu khớp cả dung lượng lẫn mã băm |
| Bucket trên Cloudflare | object `MKTTool-Relay.zip`, đúng dung lượng |
| `/relay-download` trên Railway | dung lượng + mốc đóng gói + **chuỗi SHA-256** hiện đủ |
| Bấm nút tải trên Railway | file về đủ; `Get-FileHash <file> -Algorithm SHA256` khớp chuỗi trên trang |

**Ba kiểu hỏng và câu nó nói ra:**

| Triệu chứng | Nguyên nhân thường gặp |
|---|---|
| `403 SignatureDoesNotMatch` lúc publish | Access Key / Secret dán lệch, hoặc lẫn giữa hai token |
| `403 AccessDenied` lúc publish | Token đọc bị dán nhầm vào máy build — nó không có quyền ghi |
| Trang tải nói *"chưa có gói"* dù đã publish | Máy chủ khai nhầm tên bucket, hoặc bốn biến chưa được Railway nạp lại sau khi thêm |
| Trang tải có gói nhưng **thiếu dòng SHA-256** | Metadata không bám vào object — publish lại; `relay:publish` lẽ ra đã chặn ca này ở bước đối chiếu |

> Ký sai **không hỏng lặng lẽ được**: R2 từ chối ngay lượt đầu, và thông báo mang nguyên mã lỗi của
> Cloudflare chứ không rút gọn thành "HTTP 403" — vì `AccessDenied` với `SignatureDoesNotMatch` dẫn
> tới hai việc phải làm khác hẳn nhau.

---

## Historical 06 August walkthrough — remaining work at that time

> The checklist below belongs to the 06 August deployment, not the 30 August consolidation. It is
> retained for incident context and fallback history. The current ledger has P4-08, the disposable
> P4-09 rehearsal, and the owner-signed Lane A CONDITIONAL GO complete; the second U5 owner
> observation and P4b Browser tuple remain open. Lane C is CLOSED because no CloakBrowser channel exists.
> Do not read “đã xong” below as a current no-debt release claim.

## Việc còn nợ sau khi xong (historical)

Xếp theo thứ tự nên làm.

1. ~~**Khai một proxy quan sát viên**~~ **xong 06/08/2026** — `Observer1` (US), kiểm lúc 15:31:
   proxy sống, IP ra khác IP máy vận hành. Lượt dò 09:00 hôm sau sẽ chạy thật thay vì bỏ qua.
   **Chặn kế tiếp đã đổi người:** phải có **nick Reddit trong kho trên máy chủ** thì lượt dò mới
   kết luận được gì — không có nick thì nó chạy xong và không nói được câu nào. Việc nhập nick
   nằm ở GĐ6.
2. **Phép thử hai tiến trình dò chạy song song.** Chạy `npm run health` ở máy anh (trỏ vào
   `PRODUCTION_DATABASE_URL`) đúng lúc bấm *"Dò cả đàn"* trên web. Lượt thứ hai phải bị từ chối
   kèm câu nói rõ **máy nào**, tiến trình nào đang giữ và giữ bao lâu rồi. Đây là thứ chỉ chứng
   minh được khi khóa đã bắc qua hai máy thật.
3. ~~**Facebook** (bước 11)~~ **xong 06/08/2026** — đã nối Fanpage thật, token không hạn, Meta
   chấp nhận domain Railway. Còn nợ nửa sau của bước 11.4: **cả team vào vai trò Tester**, làm
   ở GĐ6 khi team đã có tài khoản.
4. ~~**Sửa lỗi chuyển hướng của callback Facebook**~~ **xong 06/08/2026** — đã rút phần dựng địa
   chỉ ra [request-base-url.ts](../src/lib/http/request-base-url.ts), cả hai route OAuth dùng
   chung. Lần deploy tới là hết `ERR_SSL_PROTOCOL_ERROR` sau khi nối Fanpage.

Đã xong, không còn nợ: nối GitHub (đẩy commit lên `master` là web tự cập nhật),
`npm run db:backup:remote` đã chạy và đã khôi phục thử, sao lưu tự động lên R2, và `.exe` cầu nối.
**Sao lưu ổ đĩa của Railway đã quyết bỏ**, không nằm trong danh sách này nữa — xem bước 10.
7. **Deploy thử sang một hãng khác** (Render/Fly) bằng đúng `Dockerfile` này, không sửa code — tiêu
   chí của QĐ 9, để biết mình chưa bị khóa vào Railway.
