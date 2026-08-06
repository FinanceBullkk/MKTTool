# Nhật ký thay đổi

Ghi theo ngày, gom theo giai đoạn. Chỉ ghi thứ đổi hành vi của công cụ — không ghi việc dọn dẹp
nội bộ. Trạng thái hiện tại ở [development-roadmap.md](development-roadmap.md).

Dự án chưa phát hành phiên bản (`0.1.0`, dùng nội bộ). Mốc chia theo giai đoạn, không theo semver.

> **Phần từ 04/08/2026 trở về trước** đã chuyển sang
> [archive/project-changelog-den-04-08-2026.md](archive/project-changelog-den-04-08-2026.md)
> ngày 06/08/2026, khi file này chạm ngưỡng 800 dòng. Đó là giai đoạn công cụ còn chạy trên một
> máy bàn — từ lúc xoay hướng cho tới ngày nền dữ liệu sang Postgres. Nội dung giữ nguyên từng chữ.

---

## 06/08/2026 (tối) — GĐ5: web lên máy chủ thật, deploy tự động, và bản sao lưu tự rời khỏi Railway

Ba mảnh cuối của GĐ5, và cả ba đều đóng cùng một lỗ: **thứ cần một người nhớ thì sớm muộn cũng có
ngày không ai nhớ.**

- **Web chạy thật ở `mkttool-web-production.up.railway.app`.** Postgres `postgres-ssl:18` có ổ đĩa
  riêng, kho cũ nạp sang đủ (10 proxy + sổ migration đối chiếu khớp), đăng nhập Google vào được, và
  danh sách biến môi trường đã soi bằng mắt: đủ 12 biến cần, **không có `VAULT_KEY_OPERATOR`** —
  tức GĐ3 vẫn còn tác dụng trên máy chủ thật, không chỉ dưới máy dev.
- **Đẩy commit lên `master` là web tự cập nhật.** Nối bằng
  `railway service source connect --repo … --service mkttool-web`, tức **đổi nguồn của chính
  service cũ** chứ không dựng lại — giữ nguyên domain, biến môi trường và redirect URI đã khai.
  Vướng nửa buổi vì repo thuộc org mà tài khoản chỉ là `member`: cài GitHub App phải là OWNER, và
  đường CLI chỉ nối được một nửa. Trước đó mỗi lần deploy là một lượt `railway up` gõ tay — mà
  `railway up` thiếu `--service` thì deploy web **đè lên dịch vụ Postgres**, triệu chứng là một câu
  lỗi Prisma chỉ về phía mạng.
- **Máy chủ tự `pg_dump` rồi tải lên Cloudflare R2 mỗi đêm** (`BACKUP_DAILY_AT` + bốn biến `R2_*`).
  Đây là **đổi hướng so với hôm qua**: chốt cũ nói app không tự sao lưu vì `data/backups/` trong
  container là ổ tạm. Chốt đó đúng phần chẩn đoán, sai phần kết luận — vấn đề không phải "app
  không nên sao lưu" mà là "bản sao không được nằm cùng nhà với bản gốc". Ghi thẳng lên R2 thì
  chỗ chứa không còn là ổ tạm nữa, và không cần ai nhớ chạy lệnh gì.
  - **Bốn biến `R2_*` phải đủ cả bốn hoặc rỗng cả bốn.** Khai một nửa thì app **dừng**: "chạy một
    nửa" ở đây nghĩa là tin rằng mình có bản sao mà thật ra không.
  - **Tự ký S3 SigV4, không kéo AWS SDK về.** Ký sai thì R2 trả `403 SignatureDoesNotMatch` ngay
    lượt đầu, không có đường hỏng lặng lẽ; đổi lại là ~160 dòng thay cho một cây phụ thuộc.
  - **Dump rỗng thì KHÔNG được tải lên**, mà ghi là thất bại — vì một bản sao *trông như* thật
    nguy hiểm hơn không có bản sao nào.
  - **Trang Hôm nay kêu đỏ trong ba ca**: lượt gần nhất hỏng, bản mới nhất quá 2 ngày tuổi, hoặc
    bật rồi mà chưa chạy lần nào. Một lịch sao lưu tắt tiếng là một lịch sao lưu không tồn tại.
- **Đã đi trọn cả vòng, thật.** Object `mkttool/2026-08/mkttool-prod-20260806-125954.sql` (35 KB)
  nạp lại bằng `psql -f` với `ON_ERROR_STOP=1` vào một database rỗng: exit 0, **22 hàng trong 6
  bảng**, khớp từng con số với dòng log. Dump từ server 18 đổ vào Postgres 17 dưới máy dev vẫn nạp
  được. Hai chỗ vấp trong lượt đó: **giờ hẹn đã trôi qua trong ngày thì lịch bắn ngay lúc khởi
  động** (cơ chế bắt kịp lượt lỡ, cố ý — nên vừa khai đủ biến là có bản đầu tiên luôn), và **bản
  dump tải từ R2 về rơi vào gốc repo** chứ không vào `data/backups/`, phải thêm luật
  `mkttool*.sql` vào `.gitignore` trước khi nó lọt vào một commit.
- **`pg_dump` nay có trần 10 phút.** Trước đó `runPgDump` chỉ kết thúc khi tiến trình con đóng —
  tiến trình treo (mạng nội bộ đứt giữa chừng) thì Promise **không bao giờ giải quyết**, và lượt
  sao lưu đêm im lặng tuyệt đối: không log, không hàng nào ghi vào `ScheduledJobRun`, nhìn từ ngoài
  giống hệt "chưa tới giờ hẹn". Quá giờ thì `SIGTERM`, chờ 5 giây cho `pg_dump` kịp hủy truy vấn
  đang mở, rồi `SIGKILL`. 10 phút là trần rộng rãi chứ không phải ước lượng sát: bản dump thật hiện
  nay 35 KB, xong trong vài giây — trần này để phân biệt *chậm bất thường* với *không bao giờ xong*.
- **Cố ý KHÔNG tự xóa bản cũ trên R2.** Mỗi bản ~35 KB, tức 13 MB một năm, trong khi hạn miễn phí
  của R2 là 10 GB. Dọn dẹp không giải quyết vấn đề nào có thật, còn một lỗi trong logic dọn thì âm
  thầm xóa đúng thứ cả tính năng này sinh ra để giữ.
- **Hai chốt nhỏ, cùng một họ hỏng — cấu hình đúng dưới máy dev, sai trên máy chủ.**
  `prisma.config.ts` chưa được chép vào image nên bước pre-deploy không chạy được migration; và
  một lượt tick của bộ lịch từng **trộn giờ giả với giờ máy** — lỗi chỉ CI mới thấy, vì dưới máy
  dev hai đồng hồ đó tình cờ trùng nhau.

**Kiểm chứng:** `typecheck` + `lint` + **874 test xanh** (87 file) trên CI của `master`, và lượt
sao lưu R2 đã đi trọn cả năm dòng nghiệm thu ở
[deployment-guide.md](deployment-guide.md#lớp-tự-động-app-tự-đẩy-bản-sao-lên-r2-mỗi-đêm).

**Sao lưu ổ đĩa của Railway: đã quyết bỏ**, không phải để đó chờ làm. Nó đòi gói Pro $20/tháng mỗi
workspace, trong khi thứ nó thêm vào chỉ là ca *lỡ tay xóa / migration hỏng giữa hai lượt sao lưu
đêm* — bản sao của Railway nằm **cùng tài khoản với bản gốc**, tức không chống được ca tệ nhất, đúng
ca mà R2 đã phủ. Bù bằng nếp tay: **chạy `db:backup:remote` ngay trước mỗi lần deploy có đổi cấu
trúc database**, vì `prisma migrate deploy` không tự sao lưu.

Còn lại của GĐ5: thử domain với Facebook, và một lượt dò shadowban thật — lượt 09:00 ngày 06/08 ghi
đúng câu *"bỏ qua vì chưa có proxy quan sát viên"*, hành vi đúng nhưng chưa phải một lượt dò thật.

> **Cập nhật cuối ngày 06/08:** proxy quan sát viên **đã khai và đã kiểm sống** — `Observer1` (US),
> nút *Kiểm* lúc 15:31 trả về *"proxy sống, IP ra khác IP máy này"*. Vế thứ hai mới là vế đáng
> giá: proxy sống mà **không** đổi IP thì bộ dò đang nhìn Reddit bằng chính IP nhà, và kết luận
> trông vẫn hợp lý mà thật ra vô nghĩa — hỏng theo kiểu không ai phát hiện.
>
> **Chặn của "một lượt dò thật" vì thế đã đổi người:** không còn là proxy, mà là **nick Reddit
> trong kho trên máy chủ**. Không có nick thì lượt dò chạy xong và không kết luận được gì. Việc
> nhập nick nằm ở GĐ6 — tức todo cuối của GĐ5 không tự đóng được trong GĐ5.

---

## 06/08/2026 (chiều) — GĐ5: bộ dò tự chạy hằng ngày, và bản sao lưu kéo được về máy

Hai việc của GĐ5 mà không cần chờ tài khoản Railway. Cả hai đi **khác chốt ban đầu**, và cả hai
đổi vì cùng một lý do: chốt cũ dựng ra một cơ chế hỏng lặng lẽ.

- **Lịch dò shadowban nằm TRONG app, không dùng cron của hãng.** Khai
  `HEALTH_CHECK_DAILY_AT="09:00"` là máy chủ tự dò một lượt mỗi ngày; vắng biến đó là lịch tắt,
  và tắt là mặc định vì máy dev nào cũng trỏ vào một database thật. Cron của Railway bị loại vì
  nó chỉ nhận giờ **UTC**: giờ hẹn khi đó nằm ở hai nơi — `TEAM_TIMEZONE` trong app và một chuỗi
  `0 2 * * *` trong bảng điều khiển — nên đổi múi giờ team mà quên sửa chuỗi kia là dò sai giờ
  **mà không có gì báo**. Đúng họ hỏng với `pg_dump` lệch major và luật firewall WebRTC. Thêm hai
  lẽ: cron là cấu hình riêng của hãng, trong khi cả `Dockerfile` dựng ra để chạy được ở nhiều
  hãng bằng một file; và cron của Railway đòi một dịch vụ thứ hai, tức deploy thêm một bản ảnh
  4.86 GB để chạy mười phút mỗi ngày.
- **Hai thứ cron cho sẵn thì phải tự lo, và cả hai đều rẻ.** Chạy đúng một lần dù có nhiều bản
  app: một hàng `ScheduledJobRun` đòi quyền bằng `updateMany` có điều kiện `lastRunAt < mốc hẹn`
  — quyết trong một lệnh, không có khe giữa "kiểm" và "ghi", đúng nguyên tắc của `HealthCheckLock`.
  Không mất lượt khi khởi động lại: mốc nằm trong database chứ không trong bộ nhớ, nên deploy lúc
  09:05 **không** bắn lại lượt 09:00, còn app tắt cả buổi sáng thì bật lên chạy bù **đúng một**
  lượt dù lỡ mấy ngày.
- **Bỏ qua thì nói ra lý do, và không thử lại mỗi phút.** Hai cửa kiểm trước khi sinh tiến trình:
  đang có lượt bấm tay chạy dở, hoặc chưa có proxy quan sát viên nào bật. Phải kiểm *trước*, vì
  `stdio: "ignore"` nuốt sạch câu lỗi của một tiến trình chết ngay dòng đầu — sổ sẽ ghi "đã bắn"
  cho thứ chưa từng chạy. Bỏ qua rồi thì tới mai mới thử lại: thứ đang chặn cần một người sửa,
  còn lặp lại chỉ đẻ ra mười lăm tiếng log rác che mất dòng đáng đọc.
- **Lịch tắt không được phép im lặng.** Trang `/health` có khối *"Lịch dò hằng ngày"* nói giờ hẹn,
  lượt gần nhất lúc nào và lượt đó đã bắn hay bị bỏ qua vì gì. Khay cảnh báo vận hành thêm một
  mục: máy chủ production chưa khai biến thì nhắc ADMIN, khai sai dạng thì kêu **đỏ** — chứ không
  lặng lẽ coi như tắt, vì người gõ `9h00` vào đó đang tin là lịch đã bật.
- **`npm run db:backup:remote` hút bản sao từ máy chủ thật về máy quản trị**, đọc
  `PRODUCTION_DATABASE_URL` khai ở `.env` của máy mình. Ba chốt, cả ba chống cùng một kiểu hỏng —
  bản sao lưu *trông như* thật: tên file mang nguồn (`mkttool-prod-…`) để bản của máy dev không
  bị khôi phục nhầm lên máy chủ; thiếu biến thì **dừng**, không bao giờ lùi về `DATABASE_URL`; và
  mỗi lượt in ra **số hàng dữ liệu**, nói thẳng khi là 0 — `pg_dump` chạy trên database rỗng vẫn
  cho file `.sql` hợp lệ đủ cấu trúc bảng, mà bản sao lưu là thứ chỉ được kiểm chứng vào ngày
  muộn nhất có thể.
- **Máy chủ cố ý KHÔNG tự chạy `db:backup` hằng đêm**, dù bộ lịch đã có sẵn ngay trên. Trong
  container `data/backups/` là ổ **tạm**, mất sau mỗi lần deploy — một bản sao chết cùng lúc với
  thứ nó bảo vệ thì tệ hơn không có, vì nó trông như có. Nửa tự động là nút bật sao lưu ổ đĩa của
  Railway; nửa này kéo bản sao về nơi không mất theo máy chủ.

Còn lại của GĐ5 đều cần tài khoản: dựng dự án Railway, khai biến môi trường (và **xác nhận bằng
mắt là không có `VAULT_KEY_OPERATOR`**), thử domain với Facebook, và phép thử hai tiến trình thật
chạy song song.

---

## 06/08/2026 — GĐ4: cầu nối thành một chương trình chạy trên máy operator

GĐ3 để lại một trạng thái đã hẹn trước: máy chủ không còn mở được mật khẩu nick nào, và **cũng
chưa ai mở được** — ba việc (lấy mật khẩu/OTP, mở profile, tạo/sửa nick có bí mật mới) chờ một
chương trình chưa tồn tại. Hôm nay chương trình đó có mặt, và tải về được.

- **`relay/` — một chương trình riêng, không phải một phần của web app.** Nghe `127.0.0.1:47821`,
  CORS đúng một nguồn, mọi phản hồi mang số phiên bản. Nó **không có đường vào database**: tất cả
  những gì nó biết là thứ tấm vé mang xuống. Có test hình dạng mã nguồn chặn `relay/` import
  `prisma`, `next`, React, alias `@/` và cả lớp phân quyền — kiểu hỏng đó không làm test nào đỏ,
  chỉ làm `.exe` phồng lên và mọc một client database trên đúng chiếc máy mà cả kiến trúc dựng ra
  để không có nó.
- **Ba lối vào chạy thật.** Mật khẩu và OTP hiện ở tab do chính cầu nối phục vụ (chỗ **duy nhất**
  trong cả hệ mở được mật khẩu nick), vé nằm ở fragment nên không lên máy chủ nào; trang xóa vé
  khỏi thanh địa chỉ ngay khi mở và tự đóng sau 60 giây kèm nút *"Giữ mở"*. Mở profile đi qua
  MultiZen trên máy đó, giữ nguyên quy tắc đẩy proxy hỏng thì không mở. Form tạo/sửa nick bọc bí
  mật bằng khóa vùng operator **trước khi** gửi lên — đường này cố ý không cần vé: thứ đi vào là
  bí mật người dùng vừa tự gõ, bắt xin phép máy chủ để mã hóa chuỗi của chính mình chỉ thêm một
  vòng gọi mà không thêm lớp bảo vệ nào.
- **`.exe` 87.4 MB dựng bằng Node SEA, không phải bun** — đảo với kế hoạch. Phần khó của cầu nối
  là mật mã lạ (X25519 sealed box, Ed25519), và bộ test chứng minh nó đúng *trên Node 24*; SEA thì
  `.exe` chính là `node.exe` đã chạy bộ test đó. `npm run relay:verify` đo trên **chính file
  `.exe`**, 16/16: tiến trình test phát vé thật, `.exe` mở ra, so mật khẩu với chuỗi đã gửi. Phép
  kiểm rẻ hơn ("gọi `/health` thấy 200") vẫn xanh khi mật mã hỏng sau lúc gói, và triệu chứng đầu
  tiên sẽ là một operator đứng trước câu *"không mở được ruột vé"* vào ngày bàn giao.
- **Tải ở `/relay-download`, sau lớp đăng nhập.** Gói `.zip` 32.6 MB gồm `.exe` + bộ cài — đưa
  mỗi `.exe` là đưa một bộ cài chắc chắn hỏng vì `setup.bat` tìm hai file kia cạnh chính nó. Route
  stream chứ không đọc cả file vào bộ nhớ: 87 MB mỗi lượt tải đồng thời trên gói Railway nhỏ là
  tiến trình chết vì hết bộ nhớ, và triệu chứng sẽ là "web tự khởi động lại". Chạy `setup.bat` lần
  hai là **nâng cấp**: tắt bản cũ, chép bản mới, giữ nguyên `relay-config.json` — ghi đè file đó là
  xóa khóa vùng operator của máy, thứ không lấy lại được ở đâu.
- **Mã băm SHA-256 thay cho chữ ký số.** Chứng chỉ ký mã tốn vài trăm USD/năm, đòi pháp nhân và
  token phần cứng, để đổi lấy việc bỏ một màn hình SmartScreen mà mỗi người chỉ gặp một lần. Mã
  băm miễn phí và trả lời được câu *"file tôi đang cầm có đúng bản của team không"* — trang nói
  rõ luôn phần nó **không** làm được: mã nằm cùng máy chủ với file nên không chứng minh nguồn gốc.
- **Mã máy hiện ở `/relay-devices`, và dải "cầu nối bản cũ" ở chỗ có nút bấm.** Luồng cài đi hai
  chiều — khóa công khai đi lên, mã máy đi xuống — và chiều xuống trước nay không có đường nào.
  Dải cảnh báo kêu **cả khi cầu nối bị từ chối vé**: máy cũ tới mức vé bị chặn chính là máy cần
  nhắc nhất. Không có bộ tự cập nhật (QĐ 11), nên dải này là đường duy nhất nhắc được trước khi
  một tấm vé hỏng.
- **Ba lỗi Windows chỉ lộ ra khi chạy thật**, cả ba đã vá và ghi lại tại chỗ: `noopener` trong
  chuỗi features làm `window.open()` trả `null` — đúng giá trị của "popup bị chặn" — nên **mọi**
  cú bấm mật khẩu đều rơi vào nhánh báo chặn popup (qua được typecheck, lint và 770 test);
  cmd.exe dò file `.bat` theo vị trí **byte** nên tiếng Việt có dấu làm nó chạy nhầm nửa dòng
  lệnh; `WScript.Shell` ép mọi chuỗi về bảng mã ANSI nên shortcut tên tiếng Việt không lưu nổi.
- **Bỏ `relay/dist` khỏi ESLint.** ESLint không đọc `.gitignore`, nên từ lúc có thư mục build thì
  `npm run lint` chết ngay ở bước dựng cấu hình — cả lệnh hỏng chỉ vì có người vừa build.

**Kiểm chứng:** `typecheck` + `lint` + **787 test xanh**, `npm run relay:verify` 16/16 trên `.exe`,
bộ cài chạy trọn vòng từ `.zip` giải nén ra (kể cả đường nâng cấp).

> ✅ **Đã nghiệm thu trên máy Windows thứ hai.** Tiêu chí chính của GĐ4 đã hoàn thành. `.exe` chạy trơn tru trên một chiếc máy Windows sạch chưa cài Node, chứng minh runtime đã được đóng gói thành công. GĐ4 chính thức khép lại.

## 06/08/2026 — GĐ3 đóng: máy chủ không còn mở được một mật khẩu nick nào

Bốn việc cuối của GĐ3. Trước hôm nay, bộ phát vé đã chạy và có test hai đầu nhưng **chưa lối vào
nào gọi nó** — tức là toàn bộ việc chia hai vùng khóa chưa có tác dụng gì. Hôm nay ba lối vào
được nối vào, và lỗ mở từ GĐ2 (*"một phiên bị trộm vẫn đọc được mật khẩu nick"*) đóng lại.

- **Hai server action lấy bí mật nay phát vé, không giải mã.** `revealCredential` /
  `requestOtpCode` thành `requestCredentialTicket` / `requestOtpTicket` — đổi tên vì tên cũ nói
  dối về việc hàm làm. Máy chủ lấy **nguyên văn ciphertext trong database**, bọc lại cho đúng
  chiếc máy đang ngồi, ký tên, rồi đưa trình duyệt mang đi. Nó không đọc được thứ nó vừa phát.
  - **Bí mật đi qua tab của cầu nối, không qua trang web** (QĐ 3). Tab đó cùng nguồn với cầu nối
    nên không dính luật Local Network Access — lấy được mật khẩu kể cả trên máy chưa bấm "Cho
    phép". Vé nằm ở **fragment** của URL: fragment không được gửi lên máy chủ nào, không vào
    `Referer`, không nằm trong dòng log nào.
  - **`AuditLog` ghi lúc phát vé**, kèm tên máy nhận. Đó là mốc máy chủ tự biết; mốc "người dùng
    đã nhìn thấy mật khẩu" thì nó chỉ biết nếu tin lời trình duyệt khai.
  - **Hạn nhịp 10 vé bí mật mỗi phút cho mỗi người.** Không chặn người ngoài — hai lớp gác đã
    làm việc đó. Nó chặn **một phiên bị trộm**: không có hạn thì "rút sạch kho" là chuyện của vài
    giây, có hạn thì thành chuyện của nhiều phút, và nhiều phút là đủ để một người nhận ra tab
    của mình đang tự bấm nút.
- **Nút mở profile phát vé kèm cấu hình proxy dựng sẵn.** Máy chủ vẫn kiểm proxy còn sống trước
  (mật khẩu proxy thuộc vùng khóa của nó), rồi bỏ cấu hình đã dựng vào **ruột vé đã mã hóa** —
  mở devtools ra chỉ thấy chuỗi mã hóa, không thấy mật khẩu proxy. Việc đẩy proxy và mở trình
  duyệt chuyển sang cầu nối, vì MultiZen chỉ nghe `127.0.0.1` và từ GĐ5 thì `127.0.0.1` của máy
  chủ là một máy khác hẳn.
  - Nhật ký đổi từ `PROFILE_LAUNCHED` sang `PROFILE_LAUNCH_TICKET_ISSUED`: máy chủ không biết
    profile có mở được không, và ghi thứ nghe kể là làm hỏng chính cuốn nhật ký.
- **Form tạo/sửa nick mã hóa ba ô bí mật ở máy người dùng.** Mật khẩu đi từ ô nhập xuống
  `127.0.0.1` rồi dừng ở đó; thứ gửi lên máy chủ là ciphertext. Máy chủ mất phép kiểm "TOTP
  secret có phải base32 không" (nó không đọc nổi nữa) — phép kiểm đó chuyển sang cầu nối. Thứ
  máy chủ **còn** kiểm được là hình dạng ciphertext, và nó kiểm: một form hỏng gửi mật khẩu trần
  lên bị từ chối ngay, thay vì ghi vào database rồi chỉ lộ ra vào ngày ai đó mở bản sao lưu.
  - Ba ô bí mật **bị khóa cho tới khi JavaScript sẵn sàng**. Không có nó thì người gõ nhanh rồi
    Enter trước lúc trang hydrate xong sẽ để trình duyệt gửi form theo cách mặc định — mật khẩu
    dạng trần bay thẳng lên máy chủ, im lặng.
- **Câu từ chối quyền nay tới được người dùng.** `guardedAction` bọc cả **thân hàm**, nên
  `AuthorizationError` mà `requireNickOwner` ném ra thành `ActionResult` ở mọi lối vào cùng lúc.
  Trước đó OPERATOR bấm nhầm nick của đồng nghiệp chỉ thấy một nút chết lặng: chặn vẫn đúng, chỉ
  có lời giải thích là mất.
- **`encryptCredential` / `decryptCredential` bỏ khóa mặc định.** Quên tham số khóa ở một cột
  vùng operator thì trước đây **không có gì hỏng** — chuỗi vẫn mã hóa, hàng vẫn ghi, không test
  nào đỏ — và chỉ lộ ra vào ngày chạy `vault:rekey --domain=operator`, lúc cột ghi nhầm đã thành
  rác. Nay khai rõ ở cả 20 chỗ gọi, và vùng khóa của một cột hiện ngay tại chỗ đọc mã.
- **Lượt grep nghiệm thu thành một bài test thường trực.** Kế hoạch ghi việc cuối là *"kiểm bằng
  grep"*; grep chứng minh được hôm nay và chỉ hôm nay. Ngày mai ai đó thêm một tính năng "xuất
  danh sách nick kèm mật khẩu" là ranh giới mất, mọi test khác vẫn xanh. Cùng lối với phép cấm
  giờ máy và phép kiểm gác lối vào: kiểu hỏng nào không làm test nào đỏ thì phải có một phép kiểm
  hình dạng mã nguồn nhắm thẳng vào nó.

> ⚠️ **Tới khi GĐ4 xong, ba việc cần cầu nối mới làm được**: lấy mật khẩu/OTP, mở profile, và
> tạo/sửa nick *có nhập bí mật mới*. Đây là trạng thái đã hẹn trước của QĐ 8 (làm hết rồi bàn
> giao một lần), không phải hồi quy ngoài ý muốn — chưa ai ngoài tác giả dùng công cụ. Sửa karma,
> trạng thái hay proxy của nick vẫn chạy bình thường: ba ô bí mật để trống nghĩa là giữ nguyên,
> và form không gọi xuống `127.0.0.1` khi không có gì để bọc.

### Khay cảnh báo vận hành — "kho có thật sự đang tách hai vùng khóa không?"

Việc cuối của GĐ3, và là thứ làm cho mọi việc phía trên **kiểm chứng được từ trong app** thay vì
phải đi đọc file `.env` của máy chủ.

- **Một vùng cố định dưới thanh đầu trang, có mặt ở mọi trang, mỗi vấn đề một dòng với việc phải
  làm riêng.** Không nằm ở trang Hôm nay như bảy dải cảnh báo cũ: những dải đó nói về **dữ liệu**
  (proxy chết, token sắp hết hạn) và xử lý xong thì tắt, còn khay này nói về **cấu hình hệ thống
  đang sai** — thứ khiến cả một tính năng mất tác dụng trong khi mọi màn hình vẫn trông bình
  thường. Người dùng không có lý do gì phải ghé trang Hôm nay trước khi làm việc.
- **Hai mục, không phải một.** *Hai vùng chung một khóa* là **đỏ**: một phiên bị trộm vẫn đọc
  được mật khẩu nick, tức toàn bộ GĐ3 đang không có tác dụng gì — mà cấu hình thì nhìn y hệt lúc
  đã tách xong. *Máy chủ vẫn giữ `VAULT_KEY_OPERATOR`* là **vàng**: khóa đã tách thật, nhưng bản
  sao vẫn nằm trên máy chủ, và trạng thái này trước nay **không có tiếng nói nào** — kể cả
  `console.warn` cũng không nói.
- **Thiếu `VAULT_KEY_SERVER` cố ý không vào khay.** Chỗ đó đã hỏng ồn ào bằng lỗi ngay lần mã hóa
  đầu tiên. Vẽ thêm một dòng cho thứ đã kêu to là dạy người ta lướt qua khay.
- **Lọc theo ai sửa được, không theo ai quan tâm.** OPERATOR không đổi được biến môi trường của
  máy chủ, nên đưa họ một dòng đỏ vĩnh viễn chỉ dạy họ phớt lờ — và thói quen đó dính sang cả
  những mục họ sửa được. Cảnh báo *"cầu nối bản cũ"* của GĐ4 đi hướng ngược lại (người ngồi máy
  đó tự tải lại `.exe`) nên nó sẽ hiện cho tất cả.
- **Dòng `console.warn` cũ giữ lại**, nhưng nay cả hai đọc chung một hàm: nó phục vụ lúc chạy
  dưới máy mình, còn đường tới người dùng thật là khay. Trên Railway (GĐ5) `console.warn` in một
  lần lúc khởi động rồi trôi — không ai đọc.

**Kiểm chứng:** `typecheck` + `lint` + **678 test xanh** (thêm 10 test cho khay, gồm ca "cùng một
khóa dán hai chỗ viết hoa/thường khác nhau" — bỏ sót ca đó là bỏ sót đúng lúc cảnh báo cần kêu
nhất).

## 05/08/2026 (tối) — Chỗ chạy thật: Dockerfile, khóa vào database, ba lỗi chỉ Docker mới thấy

Việc của GĐ5, chạy song song với GĐ3. Ba thay đổi dưới đây có chung một chủ đề: **thứ đúng khi
app chạy trên đúng một máy thì sai khi nó chạy ở nhiều nơi.**

- **Khóa chống hai lượt dò sức khỏe chạy chồng chuyển từ file vào database.** File
  `data/health-check.lock` chặn được đúng hai tiến trình trên **cùng một máy**. Từ GĐ5 điều kiện
  đó không còn: cron trên Railway, nút "Dò cả đàn" trong web app, và dev gõ `npm run health` ở máy
  mình — ba nơi, ba hệ thống tệp, không nơi nào thấy file của nơi kia. Khóa im lặng mất tác dụng
  đúng lúc bắt đầu cần tới nó.
  - **Đi khác chốt ban đầu của plan** (advisory lock Postgres), vì advisory lock **hỏng mở**: nó
    gắn theo session, Prisma dùng connection pool, và giữ một connection riêng suốt mười phút trên
    Railway thì lớp proxy cắt lúc nào không biết. Connection chết là Postgres tự nhả khóa cho lượt
    thứ hai chen vào — đúng thứ khóa sinh ra để chặn, mà lại hỏng lặng lẽ. Một hàng trong bảng thì
    hỏng ngược lại: tiến trình chết thì hàng ở lại và ai đó chờ tối đa 30 phút.
  - Advisory lock cũng **không mang được dữ liệu**, mà giao diện cần biết "ai đang giữ, giữ bao lâu
    rồi" — nên vẫn phải có một hàng ở đâu đó. Hai cơ chế cho một khái niệm thì sớm muộn cũng lệch.
  - `release()` xóa theo token nên chỉ xóa khóa của chính mình, và quyết trong một lệnh. Bản khóa
    file phải đọc rồi so rồi mới xóa — ba bước, có khe cho người khác giành khóa rồi bị ta xóa mất.
  - Thông báo "đang chạy" nay kèm **tên máy**: khóa bắc qua nhiều nơi rồi thì "tiến trình 4821" một
    mình không nói được gì. Cron máy chủ, người khác bấm nút, hay chính terminal của mình là ba
    việc phải xử lý khác nhau.
- **`Dockerfile` thay cho cấu hình riêng của Railway** (QĐ 9) — cùng file này chạy được ở Render,
  Fly hay một VPS. Khóa vào một hãng là thứ chỉ phát hiện ra vào đúng ngày muốn rời hãng đó.
  - Kèm **một lỗi có thật, không liên quan gì tới Docker**: `playwright`, `tsx` và `prisma` chuyển
    từ `devDependencies` sang `dependencies`. Chúng cần lúc **chạy**, không phải chỉ lúc build —
    lượt dò sinh tiến trình bằng `tsx scripts/run-health-check.ts`, và tiến trình đó gọi
    `chromium.launch()`. Ai cài bằng `npm ci --omit=dev`, tức cách cài production tiêu chuẩn, đều
    nhận một app mà nút "Dò cả đàn" sinh ra tiến trình chết ngay dòng đầu — và `stdio: "ignore"`
    nuốt sạch câu lỗi, nên nhìn như *"đã bấm rồi mà không có gì xảy ra"*.
  - Dựng trên ảnh Playwright chính chủ, ghim theo `package.json`. Tự cài trên ảnh trần thì lệ thuộc
    một danh sách gói apt đổi theo từng bản Debian — hỏng vào ngày nâng cấp, không hỏng lúc viết.
  - **Không** dùng `output: "standalone"`: nó chỉ gói những gì Next truy vết được từ đồ thị import,
    mà tiến trình dò sinh bằng `spawn` nên không nằm trong đồ thị đó. Ảnh phải mang theo `src/`,
    `scripts/` và `tsx`. Ảnh to hơn là cái giá đã biết của quyết định "lượt dò chạy ở tiến trình riêng".
  - `TEAM_TIMEZONE` là `ARG` lúc build chứ không phải biến lúc chạy, vì `next.config.ts` nhúng nó
    thẳng vào bundle cho ô chọn giờ phía client. **Đổi múi giờ team thì phải build lại.**
- **Prisma client dựng trễ — và ba lỗi mà 601 test, `typecheck` lẫn `lint` đều không thấy**, vì cả
  ba đều chạy trong môi trường **có `.env`, trên Windows**. Lần build ảnh đầu tiên làm lộ hết.
  1. **App không build được nếu thiếu `DATABASE_URL`.** `prisma-client.ts` dựng client ngay ở thân
     module, nên chỉ cần *import* là đã đòi biến. `next build` phải nạp mọi route để đọc cấu hình
     đoạn, mà `layout.tsx` → `SessionBadge` → `require-actor` → file đó, nên build dừng ở
     `/_not-found`. Máy dev không thấy vì `next build` tự nạp `.env`; ảnh Docker **cố ý không có**
     file đó — khóa kho danh tính không đi vào ảnh. Sửa theo đúng lối `getAuth()` đã đặt sẵn cho
     Better Auth, dùng `Proxy` nên không phải sửa hơn trăm chỗ gọi và không sinh ra hai cách lấy
     client cùng tồn tại. Gỡ kèm một tác dụng phụ âm thầm: trước đây chỉ nạp module là mở sẵn một
     connection pool, kể cả trong test không hỏi database câu nào.
  2. **`RUN chown -R pwuser /app` một mình nó nặng 998 MB.** `chown` đụng metadata mọi file nên
     Docker coi cả cây là đã đổi và chép lại nguyên `/app` thành một tầng nữa. Thay bằng
     `COPY --chown` và đổi user trước khi chép: **6.6 GB → 4.86 GB**.
  3. **`pg_dump` của Ubuntu Noble là bản 16, mà server là 17.** `pg_dump` **từ chối** dump từ server
     có major cao hơn nó — bản mặc định trông như cài xong nhưng hỏng đúng ngày cần sao lưu, và
     nặng hơn thế: `vault:rekey` tự sao lưu trước khi ghi, nó sẽ dừng ngay ở bước đó. Chuyển sang
     kho PGDG lấy `postgresql-client-17`. *Nâng Postgres lên 18 thì phải sửa `ARG PG_CLIENT_MAJOR`
     trước, nếu không mọi bản sao lưu im lặng ngừng chạy.*

> **Ảnh đã nghiệm thu chạy thật trong container**, không chỉ kiểm file có tồn tại: chạy bằng
> `pwuser`, có `tsx`, Prisma CLI, `pg_dump` 17.10, `scripts/` và `src/` đủ, và Chromium mở được thật.

---

## 05/08/2026 — Kho tách làm hai vùng khóa, và máy chủ có chữ ký

GĐ3 đang chạy (7/11 việc). Đích của cả giai đoạn: **chiếm được máy chủ không mở được một mật
khẩu nick nào**. Đợt này đặt xong phần nền, chưa tới đích — máy chủ vẫn còn giữ khóa vùng
operator, xem ghi chú cuối mục.

- **`VAULT_KEY` tách thành `VAULT_KEY_SERVER` và `VAULT_KEY_OPERATOR`** — **đổi vỡ tương thích,
  phải sửa `.env` trước khi chạy.** Vùng server giữ mật khẩu proxy và token Facebook (máy chủ cần
  chúng để kiểm proxy sống và gọi Graph API); vùng operator giữ mật khẩu, email, TOTP của nick.
  `loadVaultKey` bắt buộc nói rõ vùng và **không đọc lùi** về `VAULT_KEY` cũ: im lặng chạy tiếp
  bằng khóa cũ là kiểu hỏng chỉ lộ ra đúng lúc cần mở mật khẩu. Đang nâng cấp từ bản một khóa thì
  đặt cả hai biến bằng giá trị cũ, và bộ nạp khóa **cảnh báo khi hai vùng còn trùng nhau** —
  trạng thái đúng lúc chuyển đổi nhưng nhìn y hệt lúc đã tách xong, nên phải nói ra.
- **Vùng của từng cột khai ngay cạnh cột trong `schema.prisma`** (`vault:server` / `vault:operator`),
  và test đọc thẳng schema nên khai lệch hoặc **khai thiếu** đều đỏ. Đặt dấu cạnh cột chứ không
  chỉ trong registry vì người thêm cột mới nhìn thấy nó lúc đang gõ.
- **`vault:rekey` nay bắt buộc `--domain=server|operator`** và xoay đúng một vùng. Chính lệnh này
  là đường tách hai vùng lần đầu. Nguyên tắc cũ giữ nguyên: giải mã sạch toàn bộ trước khi ghi.
- **`vault:smoke` thêm phép thử "khóa vùng server KHÔNG mở được mật khẩu nick"**, và **báo FAIL
  khi hai khóa còn trùng** thay vì báo PASS cho thứ chưa kiểm được. Đã xanh trên DB thật.
- **Cặp khóa ký vé Ed25519 của máy chủ** (`TICKET_SIGNING_KEY`). Chỉ một biến — hạt giống khóa
  riêng; khóa công khai suy ra từ nó chứ không khai riêng, vì hai biến rời nhau là mở đường cho
  một cặp lệch, mà cặp lệch thì mọi vé bị từ chối và không nhìn vào đâu để biết vì sao. Test đối
  chiếu **vector chuẩn RFC 8032 mục 7.1**, không phải ký-rồi-tự-kiểm: tự kiểm chỉ chứng minh
  module nhất quán với chính nó, còn cầu nối ở GĐ4 sẽ được viết độc lập.
- **`npm run keys:server-pubkey`** in lại khóa công khai của khóa đang dùng. `keys:server-keygen`
  sinh cặp *mới* mỗi lần chạy, nên trước đó không có đường nào tra khóa công khai hiện hành —
  trong khi mỗi lần cài cầu nối lên một máy mới lại cần đúng thứ đó.
- **Sổ đăng ký máy chạy cầu nối** — model `RelayDevice` + màn hình `/relay-devices`. Mỗi máy khai
  một khóa công khai **X25519** (không phải Ed25519: máy chủ *ký*, máy *nhận đồ mã hóa gửi tới* —
  hai việc ngược chiều, hai họ khóa). Máy chủ bọc nội dung vé bằng khóa của đúng máy nhận, nên
  trình duyệt chỉ là người đưa thư. ADMIN đăng ký / thu hồi; cả team đọc được sổ, đúng nguyên tắc
  đã theo từ đợt trước: chia **quyền làm**, không chia **tầm nhìn**.
  - Đúng 64 ký tự hex **chưa đủ** để nhận một khóa: có một nhóm điểm bậc thấp cho ra bí mật chung
    toàn số 0 với *mọi* khóa đối diện — tức ai nhặt được vé cũng mở ra được. Màn hình đăng ký thử
    trao khóa một lần với cặp tạm để chặn cả nhóm, thay vì chép bảng điểm xấu vào mã rồi mong nó
    đủ. Test đối chiếu **vector chuẩn RFC 7748 mục 6.1**, cùng lý lẽ với vector RFC 8032 ở trên.
  - Khóa chuẩn hóa về hex chữ thường trước khi ghi. Không chuẩn hóa thì cùng một chiếc máy dán
    lại bằng chữ hoa sẽ lọt qua `@unique` thành hàng thứ hai, và người thu hồi hàng thứ nhất tưởng
    đã chặn xong.
  - **Thu hồi là một chiều và giữ nguyên hàng trong sổ.** Khóa của máy đã mất coi như đã lộ; cho
    đăng ký lại đúng khóa đó là xóa sạch ý nghĩa của lần thu hồi. Giữ hàng lại thì `@unique` còn
    chặn được, và câu *"bị chặn từ lúc nào"* còn chỗ trả lời.
  - **Ranh giới phải nhớ:** thu hồi chặn **vé mới**, không với tới ciphertext chiếc máy đó đã lấy
    về từ trước. Mất máy thì vẫn phải xoay `VAULT_KEY_OPERATOR` — câu thông báo sau khi bấm nút
    nói thẳng điều đó, và có test canh.
- **`npm run keys:relay-keygen`** sinh cặp khóa X25519 cho một máy. Chạy **trên chính máy đó**:
  khóa riêng ở lại, chỉ khóa công khai đi ra. Tới GĐ4 cầu nối tự sinh khóa lúc cài và lệnh này
  thành đường dự phòng.
- **Bộ phát và xác minh vé** (`src/lib/tickets/`). Máy chủ bọc ruột vé cho riêng máy nhận — cặp
  khóa **dùng một lần cho mỗi tấm vé**, X25519 → HKDF → AES-256-GCM — rồi ký Ed25519 phủ lên cả
  bao ngoài lẫn ruột đã bọc. Vé sống 30 giây, tiêu được đúng một lần.
  - **Bọc trước, ký sau**, nên cầu nối xác minh chữ ký *trước khi* giải mã bất cứ thứ gì. Làm
    ngược lại thì chữ ký nằm trong lớp mã hóa, và cách duy nhất để biết vé có thật hay không là
    cứ giải mã đã.
  - **Ký lên chuỗi, không ký lên object.** Cầu nối GĐ4 là chương trình viết độc lập, và
    `JSON.stringify` của hai chương trình có thể xếp khóa khác thứ tự. Cả hai đầu ký/xác minh
    trên đúng chuỗi base64url truyền đi, không bên nào tuần tự hóa lại — cùng lý do JWS làm vậy.
  - **Cặp khóa dùng một lần**, không phải cặp cố định của máy chủ: cặp cố định thì mọi vé gửi
    tới cùng một máy dùng chung một khóa AES, lộ một lần là lộ cả lịch sử. Bí mật chung đi qua
    HKDF chứ không dùng thẳng — đầu ra X25519 là tọa độ một điểm, không phải khóa phân bố đều.
  - **Chống dùng lại nằm ở cầu nối**, là hệ quả của QĐ 5 chứ không phải lựa chọn: cầu nối không
    nối mạng nên không hỏi máy chủ được, và máy chủ cũng không biết vì nó phát vé rồi thôi.
  - Thứ tự kiểm là một phần của thiết kế: chữ ký → **hai số phiên bản** → hạn → đúng máy → chưa
    tiêu → mới giải mã. Đặt phiên bản ngay sau chữ ký để cầu nối cũ luôn nhận được *"bản quá cũ,
    tải lại"* (QĐ 11) thay vì một lỗi giải mã mơ hồ.
  - **Chưa lối vào nào gọi module này** — nối vào nút bấm là ba việc còn lại của GĐ3.
- **Ghi đè bí mật nick nay phải là chủ nick** — đối xứng với `revealCredential`, vốn đã gác từ
  GĐ2. Không gác thì trạng thái là *"tôi không đọc được mật khẩu nick của bạn, nhưng tôi ghi đè
  được nó"*. Chỉ gác khi form **thật sự mang bí mật lên**: sửa karma / trạng thái / proxy cho nick
  của đồng nghiệp vẫn mở, vì đó là việc chung hằng ngày và một phép kiểm cản việc thật thì sẽ bị
  gỡ chứ không được sửa.
  - Chuyện `status` bị kéo từ `SHADOWBANNED` về `HEALTHY` **cố ý không giải bằng phân quyền**:
    chủ nick cũng ép được, nên phép kiểm chủ sở hữu không nhắm đúng chỗ. Thay vào đó
    `ACCOUNT_UPDATED` nay ghi cả chiều đổi, khớp với `HEALTH_STATUS_FORCED` mà đường còn lại đã
    ghi từ lâu — hai đường tới cùng một hậu quả thì nhật ký phải đọc được như nhau.
- **`AuditLog.action` gom về `lib/audit/audit-log-actions.ts`.** 15 chuỗi literal rải 9 file; gõ
  sai một chữ thì hàng vẫn ghi và không test nào đỏ, chỉ có câu truy vấn đi tìm nó sau này là
  hụt mất hàng — im lặng, và đúng vào ngày cần nhật ký nhất.

> **Chưa đóng ở đợt này:** máy chủ vẫn giữ `VAULT_KEY_OPERATOR`, vì bốn chỗ còn cần nó — tạo nick,
> sửa nick, xem mật khẩu, sinh OTP. Chỉ gỡ được sau khi bốn chỗ đó chuyển sang phát vé. Nghiệm thu
> cuối GĐ3 là gỡ hẳn biến đó khỏi máy chủ mà app vẫn chạy đủ mọi chức năng.

---

## 05/08/2026 — Đăng nhập Google, phân quyền, và bỏ cờ `-H`

Hàng rào chuyển từ **chỗ app lắng nghe** sang **đăng nhập**. Hai thứ này phải đổi trong cùng một
đợt: bỏ cờ `-H` trước khi gác xong là biến kho danh tính thành trang web công khai.

- **Route `/api/auth/[...all]` + màn hình `/login`.** Một nút Google, không có ô nhập, không có
  tự đăng ký — Google chỉ chứng minh *"người này sở hữu email đó"*, không chứng minh *"người này
  thuộc team"*. Thanh trạng thái ở đầu trang hiện email + vai trò và có nút đăng xuất.
- **`GOOGLE_CLIENT_SECRET` sai giờ có câu tiếng Việt.** Đó là thứ duy nhất `npm run auth:check`
  không kiểm được (lệnh đó không bao giờ gửi secret đi đâu), và nó chỉ lộ ra ở nhịp đổi code lấy
  token. Better Auth trả về mã `invalid_code`; `sign-in-error-messages.ts` dịch mã đó thành
  đúng câu "vào Credentials lấy lại Client secret".
- **Email ngoài danh sách trắng bị từ chối tử tế**, và thông báo nêu đúng email vừa bị từ chối
  (ca gặp nhiều nhất: gõ nhầm một chữ, hoặc trình duyệt tự chọn tài khoản Google khác). Hai
  ràng buộc, cả hai đều phải sai một lần mới tìm ra, và cả hai chỉ lộ khi bấm thử chứ không lộ
  khi đọc code:
  1. Phải ném `APIError` chứ không phải `Error` thường — `handleOAuthUserInfo` nuốt lỗi thường
     và trả về đúng chuỗi `"unable to create user"`.
  2. Thông điệp của `APIError` **không đi vào chỗ hiển thị mà đi vào chỗ mã lỗi**: `callback.mjs`
     làm `result.error.split(" ").join("_")` rồi gắn vào `?error=`. Viết cả câu tiếng Việt vào
     đó thì người dùng nhận nguyên câu với mọi dấu cách thành gạch dưới, cụt đuôi ở rìa màn
     hình. Nên tầng dưới chỉ gửi mã `EMAIL_NOT_ALLOWED:<email>` (không dấu cách nên đi qua
     nguyên vẹn), còn câu tiếng Việt nằm ở `sign-in-error-messages.ts`.
- **Gác nốt 18 lối vào còn lại — `NOT_YET_GUARDED` về rỗng.** 30 server action và 5 route
  handler. Gác nằm ở chữ ký định nghĩa (`export const x = guardedAction(...)`) chứ không phải
  một dòng trong thân hàm: dòng đó quên được và lách được (nằm trong nhánh `if`), và không phép
  kiểm tự động nào phân biệt nổi "gọi luôn" với "gọi khi biến X đúng".
- **Phép kiểm hàng đợi đổi nghĩa.** Trước đây nó kiểm từng dòng trong `NOT_YET_GUARDED` có
  trung thực không; giờ nó đòi danh sách **rỗng**. Từ lúc bỏ cờ `-H`, mỗi dòng ở đó là một
  endpoint công khai — không còn tồn tại thứ gọi là "tạm thời chưa gác", và khai tên vào danh
  sách không còn là đường thoát khi test báo đỏ.
- **`AuditLog` ghi được ai làm.** `actorId` đính ở mọi đường: mở profile, lộ credential, ghi đè
  luật, đăng Fanpage, sửa nick, phân công nick.
- **Phân công nick (chỉ ADMIN).** Chủ nick quyết định đúng một thứ: ai lấy được mật khẩu và OTP
  của nick đó. Danh sách người nhận chỉ gồm người **đã đăng nhập ít nhất một lần** — khai email
  vào `ALLOWED_EMAILS` thôi thì chưa đủ, và màn hình nói thẳng điều đó thay vì hiện ô rỗng.
- **Truy vấn bộ luật vẫn quét toàn bộ đàn nick** — có test riêng canh
  ([rule-queries-ignore-owner.database.test.ts](../src/lib/rules/rule-queries-ignore-owner.database.test.ts)),
  seed hai chủ khác nhau rồi hỏi ba truy vấn nhạy cảm với quyền sở hữu. Lọc theo chủ sở hữu là
  làm luật 8 mù đúng ca nó sinh ra để bắt: hai nick cùng nhà đụng một thread, mà hai nick cùng
  nhà thì thường do hai người khác nhau cầm. Kiểu hỏng đó không đỏ ở màn hình nào.
- **Gác cả trang, không chỉ hành động** (`src/proxy.ts`). Bắt được lúc nghiệm thu: đăng xuất
  xong vẫn duyệt app bình thường. `guardedAction`/`guardedRoute` gác đường **làm**, nhưng trang
  trong `app/` là server component tự gọi thẳng Prisma rồi trả HTML — không đi qua wrapper nào.
  Gác đủ 35 lối vào mà quên trang, lại vừa bỏ cờ `-H`, thành ra cả lớp mạng đọc được username
  nick, email gốc và host/port/username của proxy. Tên file phải là `proxy.ts` — Next 16 bỏ
  `middleware.ts`, và cùng với đổi tên là đổi mặc định: proxy **luôn** chạy Node runtime, nên
  không phải khai `runtime: "nodejs"` nữa (khai lại là lỗi build). Đó là điều kiện sống của lớp
  này: ở edge, Prisma không nạp được, và vì nó chết ở tầng chặn nên **mọi trang thành 500**.
- **Bỏ `-H 127.0.0.1` khỏi `dev` và `start`** — bước cuối cùng, chỉ làm sau khi danh sách chưa
  gác về rỗng.
- **Tắt `agentRules`** trong `next.config.ts`. Next 16 tự sinh `AGENTS.md` và `CLAUDE.md` ở gốc
  kho mỗi lần chạy dev; dự án đã có `README.md` và `docs/` nên hai file đó chỉ là nguồn sự thật
  thứ hai, không ai viết và tự ghi đè sau mỗi lần nâng cấp Next. Tắt ở nguồn chứ không
  `.gitignore` — bỏ qua trong git thì chúng vẫn mọc lại trong thư mục làm việc.
- **CI sống lại sau 10 lượt đỏ liên tiếp.** Nó đứt từ PR #2 — đúng PR chuyển nền dữ liệu sang
  Postgres — vì workflow vẫn cấp `DATABASE_URL: file:./ci.db` trong khi bộ test đã đòi một
  Postgres thật. Master cũng đỏ suốt từ đó. Sửa bằng service container `postgres:17` kèm health
  check, **không** bằng cách bỏ qua các test chạm database: chúng là thứ duy nhất chứng minh
  truy vấn *lọc đúng*, mà lọc sai là kiểu hỏng nguy hiểm nhất ở đây. Thêm `prisma migrate deploy`
  — đúng lệnh sẽ chạy lúc phát hành ở GĐ5, và là đường khác với cách global setup áp SQL bằng
  tay, nên nó bắt được migration mà Prisma CLI từ chối.
- **Bài học đắt hơn cả bản vá:** vì `npm test` đứng trước và đỏ, bước `npm run build` **10 lượt
  liền chưa hề chạy tới**. Nó vừa chạy lại là bắt ngay một lỗi thật đã đi lọt qua cả buổi nghiệm
  thu tay (`runtime` thừa trong `proxy.ts`) — `next dev` không kiểm phần đó. Một CI đỏ triền miên
  không phải phiền toái nhỏ: nó **giấu** những gì các bước sau lẽ ra đã bắt.

Chưa đóng ở đợt này: một phiên bị trộm vẫn đọc được mật khẩu nick (hai vùng khóa tách ở GĐ3).

