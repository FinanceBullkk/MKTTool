# Nhật ký thay đổi

Ghi theo ngày, gom theo giai đoạn. Chỉ ghi thứ đổi hành vi của công cụ — không ghi việc dọn dẹp
nội bộ. Trạng thái hiện tại ở [development-roadmap.md](development-roadmap.md).

Dự án chưa phát hành phiên bản (`0.1.0`, dùng nội bộ). Mốc chia theo giai đoạn, không theo semver.

---

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

---

## 04/08/2026 — Nền dữ liệu chuyển sang Postgres

Nửa sau của cùng một việc với mục dưới: một file SQLite trên một máy không phục vụ được 5-6
người ở 5-6 nơi. **Không có script chuyển dữ liệu** — kho hiện tại quá nhỏ (3 nick, 10 proxy,
4 job), nhập tay rẻ hơn và ít rủi ro hơn là chuyển ciphertext qua hai nền dữ liệu.

- **Adapter đổi `PrismaBetterSqlite3` → `PrismaPg`.** 9 migration SQLite gộp thành một baseline
  Postgres duy nhất.
- **Ràng buộc 1 nick = 1 proxy không bị nới.** Postgres cũng cho nhiều NULL nhưng chỉ một giá
  trị thật trên cột `@unique` nullable — đây là thứ phải kiểm trước khi đổi nền, vì nếu mất thì
  mất im lặng: không có gì đỏ, chỉ là ràng buộc thôi không chặn nữa.
- **Bộ test cần một Postgres THẬT**, và vì global setup `DROP SCHEMA` không hỏi lại nên có
  `assertIsTestDatabase()`: chỉ chạy trên database tên kết thúc bằng `_test`. Cố ý không có
  giá trị mặc định — một mặc định `localhost/mkttool_test` trên máy người khác sẽ âm thầm trỏ
  vào chỗ họ không ngờ, và thứ nó xóa là kho danh tính.
- **Vẫn áp từ file migration chứ không `db push`.** Giữ nguyên tính chất cũ: mỗi lượt test kiểm
  luôn chuỗi migration có áp sạch từ đầu không.
- **`db:backup` bỏ `VACUUM INTO`, dùng `pg_dump --format=plain`.** Giữ dạng chữ chứ không dạng
  nén dù nén nhỏ hơn: phép kiểm "không có credential dạng trần" quét chuỗi trên file nén thì
  luôn không thấy gì — một phép kiểm an toàn luôn xanh là kiểu hỏng tệ nhất của phép kiểm đó.
  Khôi phục đổi từ "chép đè file" sang `psql -f`.

> Bẫy gặp lúc nghiệm thu: `mkttool_dev` chưa từng được áp migration, nên lượt `db:backup` đầu
> ra file **1 KB rỗng mà vẫn báo thành công**. Backup của database rỗng trông y hệt backup
> thành công — nghiệm thu sao lưu phải soi nội dung file, không phải soi mã thoát.

## 04/08/2026 — Một múi giờ cho cả team

Chuẩn bị cho web dùng chung: từ nay ranh giới ngày đọc `TEAM_TIMEZONE`, không đọc giờ của máy
đang chạy nữa. Đây là **sửa lỗi đang có**, không phải chuẩn bị cho tương lai — chỉ là lỗi chưa
lộ ra vì mới có một người dùng.

- **`startOfLocalDay` cắt ngày theo giờ máy.** Hai người ngồi hai múi giờ mở cùng một job thì
  luật hạn mức ngày đếm sang ngày khác nhau, cold-start hết lệch vài tiếng — và không có gì báo.
- **Ô chọn giờ ở `/queue` cũng lệch, theo chiều khó thấy hơn.** Chuỗi `2026-08-16T21:30` không
  mang múi giờ, nên `z.coerce.date()` đọc nó theo giờ **máy chủ**: người dùng gõ 21:30 thì job
  rơi vào 21:30 của máy chủ. Với máy chủ đặt ở nước ngoài, lệch đó là vài tiếng.
- **Chuỗi ISO kèm `Z` thì để nguyên** — nó là mốc tuyệt đối, diễn giải lại theo giờ team là mỗi
  lần lưu nó trôi thêm 7 tiếng.
- **Dùng `Intl` để ĐỔI MÚI GIỜ, không để định dạng.** Lấy ra các phần số rồi tự ghép chuỗi, nên
  bản ICU này đổi dấu phân cách so với bản kia cũng không chạm tới kết quả — giữ đúng lý do
  file này vốn không dùng Intl.
- **Thiếu biến thì dừng app kèm thông báo rõ**, không lặng lẽ lùi về giờ máy: lùi về im lặng
  đúng là kiểu hỏng cả đợt này sinh ra để diệt.
- **Một test quét mã nguồn cấm hẳn họ hàm `getHours` / `setHours` / `toLocaleDateString` trong
  `src/`.** Kiểu hỏng này không làm test nào đỏ — `new Date().getHours()` chạy ngon trên mọi
  máy, chỉ trả lời sai với người ngồi múi giờ khác. Không có gì để bắt ngoài việc cấm thẳng.
  Phép quét tự kiểm luôn chính nó còn bắt được, vì regex hỏng thì mãi mãi xanh.

**Kiểm chứng:** chạy cả bộ test ở ba múi giờ hệ điều hành khác nhau (`UTC`,
`America/New_York`, `Asia/Ho_Chi_Minh`) — **473/473 giống hệt nhau ở cả ba**. Đó là tiêu chí
nghiệm thu của phase, không phải "test xanh" chung chung. Sửa luôn hai test cũ vốn dựng mốc
bằng `new Date(2026, 7, 10, 9, 0)`: đúng khi code còn cắt theo giờ máy, sai từ lúc không còn.

**Chưa làm:** nửa còn lại của phase — đổi nền dữ liệu sang Postgres.

---

## 04/08/2026 — Đo băng thông proxy

Câu hỏi mở đầu: *"có check được bandwidth của proxy không?"* — được, nhưng phép đo này khác hẳn
phép kiểm proxy còn sống ở chỗ **nó tiêu tiền**.

- **Nút "Đo tốc độ (1 MB)" từng proxy** ở `/proxies`: tải file thử qua đúng proxy đó, tính
  megabit/giây, ghi lại thành cột riêng. `< 1 Mbps` rất chậm, `< 5 Mbps` chậm.
- **Cố ý không có bản "đo cả kho".** Mỗi lượt tiêu 1 MB quota trả tiền của proxy; nhân cả đàn là
  vài chục MB mỗi lần bấm. Cái giá ghi thẳng lên nhãn nút, không giấu trong chú thích.
- **Loại 128 KB đầu ra khỏi phép tính** — TCP khởi động chậm, mấy vòng RTT đầu cửa sổ còn nhỏ nên
  đo cả phần đó thì proxy xa (RTT 200 ms) nào cũng ra chậm.
- **Chọn nguồn file thử theo một điều kiện cứng**: phục vụ qua HTTP thường, không chuyển hướng
  sang HTTPS. Bộ đo đi socket trần nên `301 → https://` chỉ tải về 162 byte trang chuyển hướng
  rồi báo "0,3 Mbps" — sai mà trông vẫn như số đo thật. Đo thật hôm nay: `proof.ovh.net` 301
  (loại), `thinkbroadband.com` đóng kết nối (loại), còn `speed.cloudflare.com` (chọn được đúng số
  byte cần lấy) và `speedtest.tele2.net`.
- **"Không đo được" không bao giờ hiện thành số 0.** Sai mật khẩu / proxy không ra được internet
  thì quy về proxy; máy chủ thử trả 403/429 thì nói rõ *chưa phải lỗi proxy* — cùng nguyên tắc
  với bộ dò shadowban.
- **Cách mở đường (thẳng / proxy HTTP / SOCKS5) tách ra `proxy-http-transport.ts`**, dùng chung
  với phép hỏi IP ra. Hai bản chép tay là hai cơ hội để cùng một proxy cho hai kết luận khác nhau
  tùy đường vào.

**Kiểm chứng thật:** 3 proxy Webshare, đo được 7,2–9,5 Mbps, độ trễ byte đầu 246–504 ms. Hai
đường hỏng (sai mật khẩu → `407`, địa chỉ không tồn tại → hết giờ nối) đều ra "không tải được",
không ra số nào. Kho hiện chỉ có proxy HTTP nên đường SOCKS5 chưa chạy qua proxy thật.

**Giới hạn đã biết:** đo tải xuống, không đo tải lên — mà đăng bài kèm ảnh/video thì tải lên mới
là thứ quyết định.

---

## 04/08/2026 — Bộ dò tự gán link, hết phải chép tay

Câu hỏi mở đầu: *"tool đã đồng bộ giữa những gì đã đăng trên Reddit và kho chưa?"* — trước đợt
này thì **đối chiếu có, đồng bộ chưa**. Bộ dò chỉ ra được chỗ lệch ("Có bài chưa ghi") rồi bảo
người dùng vào `/queue` ghi tay. Nhưng dữ liệu để ghi đã nằm sẵn trong đúng trang vừa đọc.

**Tính năng**

- **Parser giữ lại thứ nó vốn đang vứt đi.** Mỗi `.thing` của old.reddit mang `data-permalink`
  — trong đó có cả **tên sub**, **id bài** và **slug tiêu đề** — cộng `data-timestamp` là giờ
  đăng thật. Parser cũ rút xong khóa rồi bỏ hết phần còn lại. Đọc thêm chúng **không tốn thêm
  request nào**, và đó là toàn bộ thứ cần để ghép một bài với một job.
- **Tự gán link khi chắc, báo khi mơ hồ.** Ba cửa phải qua hết: cùng sub, giờ đăng cách giờ dự
  kiến không quá 24 tiếng, và slug tiêu đề khớp content. Còn lại **đúng một** ứng viên mới ghi.
  Hai bài cùng đòi một job, hoặc hai job cùng khớp một bài → không bài nào được gán.
  Vì hai kiểu sai ở đây không cân nhau: bỏ sót thì bấm tay mất vài giây, còn gán nhầm là **tự
  tay tạo lại đúng ca dán nhầm link** vừa phải sửa sáng nay — im lặng và làm bộ luật đếm sai.
- **Ghi qua đúng đường của nút "Đã đăng"** (`post-job-mark-posted.ts`, vừa tách khỏi lớp
  `"use server"` để tiến trình dò gọi được). Một bài đăng để lại đúng một bộ dấu vết dù ai ghi;
  hai đường ghi là hai cơ hội để một đường quên tạo Interaction và luật 8 mù đúng chỗ đó.
  Ai ghi thì đọc ở AuditLog `HEALTH_AUTO_LINKED_POST`.
- **Gán trước, kết luận sau.** Bài vừa gán không còn là "bài chưa ghi" và nó nâng mẫu số lên
  một job, nên bản ghi HealthCheck phải mang con số SAU khi gán — nếu không, bảng sẽ vĩnh viễn
  báo lỗi về đúng những bài vừa được sửa xong.
- **Nút "Quét & gán link" ngay ở dòng job** (Reddit, job còn mở). Đăng tay xong bấm một cái,
  ~30-60 giây sau link tự vào kho. Dùng lại `/api/health/run` sẵn có, không thêm đường mạng nào.
- **Cảnh báo link đã gán trỏ về bài khác content.** Bổ cho phép kiểm trùng link: cái đó cần
  HAI job trùng MỘT link mới lên tiếng, nên dán nhầm link của một bài không có job nào thì nằm
  im. Slug nằm sẵn trong link đã lưu → không cần mạng, không cần bộ dò chạy.
- **Gỡ cách ly thì lý do cách ly đi theo.** Nick `IllBlueberry5395` bị lượt dò đầu tiên cách ly
  nhầm; sửa trạng thái về ALIVE xong, lý do cũ nằm lại và trang chi tiết hiện đồng thời nhãn
  **"Khỏe — hoạt động bình thường"** và hộp đỏ **"Dừng đăng bằng nick này ngay"**. Màn hình tự
  cãi nhau tệ hơn màn hình thiếu thông tin: người đọc phải đoán tin dòng nào, và lần sau bỏ qua
  cả hai — kể cả lần cảnh báo thật. Giờ đường sửa nick tự xóa lý do khi trạng thái không còn là
  cách ly, và trang chi tiết chỉ hiện hộp đỏ khi nick THẬT SỰ đang bị cách ly.
- **Đếm riêng bài lạ KHÔNG gán được vì HTML thiếu link/tên sub.** Nếu Reddit bỏ `data-permalink`
  thì mọi bài lạ lặng lẽ rơi khỏi đường tự gán, và triệu chứng duy nhất người dùng thấy là "bấm
  nút mà không có gì xảy ra". Giờ con số đó hiện thẳng trong câu trả lời của nút và trong log
  lượt dò.

**Về quyết định "cố ý không đối chiếu tiêu đề" ghi ở mục dưới:** vẫn giữ. Tiêu đề sửa được sau
khi đăng nên slug lệch KHÔNG chứng minh được bài sai — vì vậy ở đây nó chỉ làm **cổng tin cậy
trước khi tự ghi** và **cảnh báo để người mở link xem**, không bao giờ thành kết luận sức khỏe
nick. Hai ngưỡng cũng cố ý lệch nhau: khớp ≥ 0.6 mới được ghi, nhưng phải lệch < 0.2 mới báo —
khoảng giữa là vùng "đặt tiêu đề khác một chút", nơi im lặng đúng hơn là hỏi.

**Không làm, có chủ ý:** bảng lưu "bài chờ xác nhận" để bấm gán một cú. Ca mơ hồ hiện vẫn là
cảnh báo chữ như cũ. Thêm một model nữa chỉ để chứa thứ chưa biết có xảy ra thường không thì
sớm quá — đo vài tuần rồi tính.

**Kiểm chứng:** `typecheck` + `lint` + `436 test` (27 test mới). Chạy thử trên dữ liệu thật:
cảnh báo slug không kêu nhầm bài nào (bài thật khớp 1.0), và bộ ghép **từ chối** gán link
`1veg99o` cho job "Looking for a game similar to trove" — đúng cái bẫy nó sinh ra để tránh.

---

## 04/08/2026 — Bộ dò chuyển từ ĐẾM sang ĐỐI CHIẾU

Câu hỏi mở đầu: *"observer có kiểm chứng được không?"* — trước đợt này thì **không**. Parser chỉ
moi `data-type` và `data-timestamp`, nên bộ dò biết "có 1 bài trong 7 ngày" mà không biết **bài
nào**. Mọi so sánh đều là số lượng với số lượng: lệch thì biết, nhưng không chỉ được vào đâu.

**Tính năng**

- **Parser đọc khóa bài.** Thẻ `.thing` của old.reddit vốn mang sẵn `data-permalink` và
  `data-fullname` — id bài nằm ngay trong thuộc tính parser đang bỏ qua. Cho permalink đi qua
  đúng `normalizeThreadUrl()` của luật 8 để hai bên sinh khóa bằng cùng một hàm; hai cách rút
  gọn riêng là hai cách sai khác nhau. Không thêm request nào.
- **Kết luận thứ bảy: "Có bài chưa ghi"** (`thấy > đã ghi`). Đây là chiều so sánh bộ dò từng mù
  hoàn toàn, và nó nguy hiểm hơn chiều đang kiểm: bài bị ẩn thì mất reach, còn bài không được
  ghi làm **bốn luật giữ nhịp đếm thiếu** — hạn mức ngày, giãn cách cùng đích, tỷ lệ promo và
  chặn đụng độ thread đều dễ dãi hơn thực tế. Tức lỗi sổ sách âm thầm biến bộ luật thành thứ
  tạo ra chính cái nó phải ngăn.
  Kết luận này **không** đổi trạng thái nick: nick khỏe, hỏng là sổ sách của mình.
- **Nhánh "chưa đối chiếu được" hết nói sai.** Nick có 0 job trong kho mà 3 bài trên profile
  từng trả *"chưa bài nào được đánh dấu nên không có gì để đối chiếu"* — đúng lúc đang có rất
  nhiều thứ để đối chiếu. Giờ ra "Có bài chưa ghi".
- **Cảnh báo hai job khác nội dung dán trùng một link.** Không phải việc của bộ dò: không cần
  mạng, không cần proxy, không phụ thuộc Reddit đổi HTML — chỉ là một câu hỏi đặt cho chính kho.
  Cần nó vì phép gộp job theo link (đúng về mẫu số) đã **xóa mất manh mối** của lỗi này khỏi
  màn hình, nên manh mối phải được đọc ở chỗ khác.
- **Trả job đã chốt về "Chờ đăng".** Cảnh báo trên chỉ ra được lỗi nhưng không sửa được nó: job
  `POSTED` chỉ hiện dấu `—` ở cột thao tác, muốn gỡ phải mở Prisma Studio. Nút mới gỡ đúng những
  gì lượt "Đã đăng" đã ghi — trạng thái, link, **và Interaction dùng cho luật 8**; bỏ sót vế cuối
  là để lại một lần chạm thread chưa từng xảy ra, không màn hình nào đỏ vì nó. Hai job dán trùng
  một link thì xóa **đúng một** dấu vết (`findFirst` + xóa theo id, không `deleteMany`) — nếu
  không, gỡ job dán nhầm sẽ cuốn theo dấu vết của bài đăng thật. Gỡ xong chấm lại luật ngay, vì
  chính job đó vừa thôi được đếm. Hỏi lại bằng hai lần bấm: trả về một bài đã lên thật là mời
  chính mình đăng nó lần thứ hai.
- **Cắt khoảng trắng trong username.** Kiểm dữ liệu thật thấy một nick lưu là `" IllBlueberry5395"`.
  Username là khóa tra cứu của bộ dò, và khoảng trắng thừa thành `%20` trong URL — cùng lớp lỗi
  với gõ sai username, mà lớp đó dẫn thẳng tới 404 → tự cách ly một nick đang khỏe.

**Vì sao vẫn giữ nhánh đếm bên cạnh nhánh khóa:** nick nào bộ dò không đọc được `data-permalink`
sẽ im lặng trở lại nếu chỉ dựa vào khóa. Có khóa thì chỉ đích danh, không có thì vẫn kết luận
được bằng số lượng.

**Không làm, có chủ ý:** đối chiếu theo TIÊU ĐỀ. Nó bắt được ca "link đúng nhưng nội dung khác"
— nhưng tiêu đề sửa được sau khi đăng và người dùng có thể gõ khác lúc dán, nên mong manh. Đúng
ca đó đã có cảnh báo trùng link bắt, rẻ hơn nhiều và không phụ thuộc Reddit.

**Kiểm chứng:** `typecheck` + `lint` + `408 test`; đo trên dữ liệu thật — cảnh báo trùng link chỉ
đúng vào cặp job có thật, `loadRecordedPostKeys` trả đúng `reddit:1veg99o`. Job dán nhầm link đã
được trả về chờ đăng bằng chính đường mới: kho còn đúng một dấu vết trên thread đó, và không còn
cặp job nào dùng chung link.
Xem [plan](../plans/260804-0353-dua-bo-do-shadowban-vao-chay-that/plan.md).

---

## 04/08/2026 — Đưa bộ dò shadowban vào chạy thật

Đo trạng thái kho: **0 proxy quan sát viên, 0 lượt dò đã chạy**. Cả Phase 03 — parser
`old.reddit.com`, khóa chống chạy chồng, biểu đồ karma, luật số 10 — chưa từng chạy một lần nào
vì thiếu đúng một thứ, và không có màn hình nào nói ra điều đó.

**Tính năng**

- **Kiểm được proxy quan sát viên**, bằng đúng bộ kiểm của proxy thường. Ở bảng này kết quả
  quan trọng hơn: proxy của nick chết là mất một nick, proxy quan sát viên chết là **mù cả đàn**
  — mọi kết luận shadowban đều nhìn qua đúng một IP đó. Nếu nó rơi vào nhánh *Không đổi IP* thì
  bộ dò đang nhìn Reddit bằng chính IP nhà: kết luận trông vẫn hợp lý mà thật ra vô nghĩa.
- **Nút "Dò cả đàn" ngay trong app.** Trước đây `api/health/run` cố ý chỉ nhận một nick vì lượt
  đầy đủ mất gần mười phút, dài hơn mọi giới hạn chờ của một request. Giờ nút sinh **đúng tiến
  trình mà `npm run health` vẫn chạy** ở chế độ tách rời rồi trả lời ngay — không có bản sao thứ
  hai của luồng dò, đóng tab hay nạp lại dev server đều không ảnh hưởng. Trạng thái lượt đang
  chạy đọc từ chính file khóa vốn đã được thiết kế cho tình huống hai tiến trình.
- **Dải cảnh báo nói đúng nguyên nhân.** Câu cũ — *"N nick chưa được dò gần đây"* — đúng về hiện
  tượng nhưng sai về nguyên nhân: sự thật là *chưa từng chạy và không thể chạy*. Giờ tách ba
  tình huống, mỗi cái một câu và **một việc phải làm tiếp**: chưa có proxy quan sát viên → về
  `/proxies`; có rồi mà chưa dò → về `/health` bấm nút; đã dò nhưng lâu rồi → giữ câu cũ.

**Vì sao đáng sửa câu chữ:** dải cảnh báo cũ sẽ hiện **vĩnh viễn**, không tự tắt được dù người
dùng làm gì trên màn hình đó. Dải nào không bao giờ tắt thì trong một tuần sẽ được học cách phớt
lờ — và tới lúc nó nói chuyện thật thì cũng không ai còn nhìn.

**Dọn nội bộ:** tách phần **đo** khỏi phần **ghi** trong bộ kiểm proxy, vì giờ có hai bảng
(`Proxy` và `ObserverProxy`) dùng chung một phép đo. Ô "lần kiểm gần nhất" cũng gom về một
component dùng chung cho cả hai bảng.

**Kiểm chứng:** `typecheck` + `lint` + `382 test`; chạy đúng dòng lệnh launcher sinh ra → báo
đúng "chưa có proxy quan sát viên" và thoát mã 1; hồi quy kiểm một proxy thật sau khi tách hàm.
Xem [plan](../plans/260804-0353-dua-bo-do-shadowban-vao-chay-that/plan.md).

**Nghiệm thu bằng thực tế cùng ngày:** khai một proxy quan sát viên IPRoyal ISP dedicated (US) →
kiểm → **Dò cả đàn**. Hai bản ghi `HealthCheck` đầu tiên của dự án. Không nick nào ra "Không dò
được", tức IPRoyal đọc được `old.reddit.com` bình thường.

**Hai lỗi lộ ra ngay ở lượt dò thật đầu tiên** — cả hai đều thuộc kiểu *đếm sai rồi kết luận
chắc nịch*, và 390 test không bắt được cái nào vì chúng chỉ hiện ra khi gặp dữ liệu thật:

- **404 bị khẳng định là "shadowban toàn cục"** trong khi Reddit trả về cùng một trang cho bốn
  nguyên nhân — kể cả **username khai sai trong kho**. Nó đã tự cách ly nhầm một nick đang khỏe.
  Sửa: câu chữ nói đúng thứ đo được, và dùng lịch sử dò làm bằng chứng — *đã từng đọc được*
  profile này rồi mà giờ mất thì mới loại trừ được khả năng gõ sai và mới nói chắc.
  Hành động **không đổi**: vẫn cách ly ở cả hai nhánh. Cách ly nhầm một nick khỏe thì ồn ào và
  sửa được bằng tay; để một nick đã bị ẩn đăng tiếp thì im lặng và tốn content mỗi ngày.
- **Mẫu số đếm số job thay vì số bài khác nhau.** Một nick có hai job `POSTED` dán trùng đúng
  một link → bảng hiện "1/2" trong khi ngoài đời là 1/1. Vừa đúng sát ngưỡng cảnh báo (thấy dưới
  một nửa); thêm một job trùng nữa là nick sạch bị báo **Nghi ngờ**. Sửa: đếm URL khác nhau sau
  khi chuẩn hóa, dùng lại đúng `normalizeThreadUrl()` của luật 8 thay vì tự rút gọn kiểu riêng.

Đo lại sau khi sửa: mẫu số của nick đó về **1**, đúng với thực tế.

---

## 04/08/2026 — Công cụ tự phát hiện hỏng hóc

**Tính năng**

- **Kiểm proxy còn sống, ngay trong công cụ.** Nút "Kiểm" từng dòng và "Kiểm tất cả" ở `/proxies`;
  mỗi lượt đi qua đúng proxy đó hỏi dịch vụ tra cứu xem người ngoài nhìn thấy IP nào. Trước đợt
  này việc đó hoàn toàn nằm ngoài công cụ — `launch/route.ts` chỉ in ra câu "vẫn nên mở ipinfo.io
  kiểm tra IP" rồi để người dùng tự làm, nên proxy chết chỉ lộ ra trên giao diện antidetect.
- **Năm kết luận, và "không đo được" không nằm chung với "khỏe":** Sống · Chết · **Không đổi IP** ·
  Lệch nước · Không kiểm được. Nhánh *Không đổi IP* là nhánh đáng tiền nhất — proxy trả lời bình
  thường nhưng lưu lượng vẫn ra bằng IP nhà, đúng kiểu hỏng mà `launch/route.ts` sợ nhất và trước
  đây không ai phát hiện được.
- **Lớp chặn thứ tư trước khi mở profile.** Proxy kết luận *Chết* hoặc *Không đổi IP* thì **không
  mở**, ghi `PROFILE_LAUNCH_BLOCKED_PROXY` vào `AuditLog`. Lệch nước và không kiểm được thì vẫn mở
  nhưng nói rõ — chặn ở hai nhánh đó là biến công cụ thành thứ không mở nổi profile mỗi khi mạng
  chập chờn.
- **Trang Hôm nay hiện proxy hỏng và token Facebook hỏng.** Hai dải cảnh báo mới, đọc thẳng từ
  database nên không thêm lời gọi mạng nào vào trang mở nhiều nhất. Token dùng lại
  `evaluateTokenHealth()` của luồng đăng bài — hai nơi tự đánh giá "token còn dùng được không" là
  hai nơi chắc chắn sẽ lệch.

**Không thêm dependency:** `undici.ProxyAgent` không resolve được trong dự án, nên phần đi qua
proxy tự viết trên `node:net` — proxy HTTP dùng request dạng tuyệt đối, proxy SOCKS5 bắt tay tay
theo RFC 1928/1929. Xin `HTTP/1.0` để phần thân không bao giờ bị chia khối.

**Sửa theo đo thật:** lượt đo đầu trên 10 proxy Webshare, ipinfo.io trả 429 cho hai IP và 403 cho
một IP, lặp lại y hệt ở lượt sau — tức chặn theo IP chứ không phải giới hạn tần suất. Một nhà cung
cấp duy nhất nghĩa là 3/10 proxy vĩnh viễn "không kiểm được", nên thêm chuỗi dự phòng
(`ipinfo.io` → `ip-api.com` → `icanhazip.com`). Sau khi thêm: **10/10**.

**Kiểm chứng:** `typecheck` + `lint` + `375 test` xanh; đo thật 10 proxy Webshare (10/10 đúng IP
và đúng quốc gia); nhánh SOCKS5 đối chiếu với nhánh HTTP trên cùng một proxy, hai đường ra cùng
một IP. Xem [plan](../plans/260804-0321-cong-cu-tu-phat-hien-hong-hoc/plan.md).

**Đã cân nhắc và quyết định KHÔNG làm:** hẹn giờ đăng Fanpage bằng `scheduled_publish_time`.
Giao bài cho Facebook giữ là bộ luật mất quyền chặn trong khoảng từ lúc hẹn tới lúc lên — nặng
nhất là job bị chấm lại thành **BỊ CHẶN** trong khi Facebook vẫn đăng đúng giờ, tức giao diện
nói một đằng thực tế một nẻo. Fanpage tiếp tục bấm tay đúng giờ. Lý do đầy đủ giữ ở
[phase-03](../plans/260804-0321-cong-cu-tu-phat-hien-hong-hoc/phase-03-hen-gio-dang-fanpage-bang-facebook.md)
để lần sau không phải cân nhắc lại từ đầu.

---

## 03/08/2026 — Băng chuyền vòng đăng bài

**Tính năng**

- **Băng chuyền ở trang xếp lịch** — `Content → Nick → Đích → Giờ → 10 luật`, mỗi chặng đổi màu
  theo trạng thái thật, bấm chặng nào thì con trỏ nhảy vào ô nhập đó. Đèn chặng cuối lấy thẳng
  từ verdict nên không thể lệch với bảng luật bên dưới.
- **Băng chuyền vòng đăng bài ở trang Hôm nay** — `Chờ đăng → Quá giờ → Đã đăng hôm nay →
  Tương tác 30 ngày`. Chặng **Quá giờ** là thứ chưa từng hiện ở đâu: job tới giờ mà vẫn `PENDING`
  nghĩa là hoặc chưa đăng, hoặc đã đăng mà quên bấm "Đã đăng" — vế sau làm bộ luật coi như bài
  đó chưa từng tồn tại.
- **Sơ đồ vòng đời một bài đăng** trong [system-architecture.md](system-architecture.md) — ba
  đường ngược từ `Interaction`/`ContentItem` về bộ luật vẽ rõ vì sao quên một nút lại làm cả bộ
  luật dại đi.

**Chưa làm, có chủ ý:** không biến đèn luật thành đồng hồ đo (hiện "7/9 bài hữu ích" thay cho
dấu ✓), vì việc đó phải sửa cả 10 file luật để giữ `reason` khi verdict là ALLOW. Đợi băng chuyền
được dùng thật đã rồi mới đụng vào lõi. Không dựng canvas kéo-thả — form bốn ô nhanh hơn kéo dây
cho việc đăng từng bài. Xem [plan](../plans/260803-2257-bang-chuyen-vong-dang-bai/plan.md).

---

## 03/08/2026 — Rút gọn luồng người dùng: mỗi bài từ 4 trang xuống 2

**Tính năng**

- **Nav 9 mục gom còn 4, chia theo tần suất dùng.** `Hôm nay · Hàng đợi · Sức khỏe` nằm ngang,
  sáu trang kho (Nick, Nhân vật, Proxy, Đích đăng, Content, Facebook) vào dropdown "Kho" — mở
  được bằng bàn phím, đóng bằng Escape hoặc bấm ra ngoài. Không route nào bị xóa hay đổi tên.
- **Bấm "Đã đăng" kèm link ngay ở thẻ nhắc việc trang Hôm nay**, không phải sang hàng đợi. Cùng
  một component với hàng đợi (`mark-posted-control.tsx`) nên hai đường ghi không thể lệch nhau.
- **Viết content mới thẳng ở trang xếp lịch** — tab `Viết mới | Chọn từ kho`. Đèn luật chạy
  realtime cho cả hai tab (bộ luật đã hỗ trợ nhánh nháp sẵn, chặn nằm ở hai schema tầng trên).
  Kho content trống không còn chặn trang xếp lịch.

**Ràng buộc giữ nguyên:** nháp được LƯU thành `ContentItem` khi bấm xếp lịch — chấm luật trước,
lưu sau, để bài không tự so trùng với chính nó. Job không bao giờ trỏ vào content ảo, nên luật 7
(trùng nội dung 30 ngày) vẫn đủ dữ liệu để so.

**Kiểm chứng:** `typecheck` + `lint` + `358 test` + `rules:smoke` (6/6) + `next build` đều xanh.
Thêm `post-job-actions.database.test.ts` khóa đúng ràng buộc trên.

---

## 03/08/2026 — Phase 03 + Phase 04 nghiệm thu bằng thực tế

**Tính năng**

- **Dò shadowban Reddit + theo dõi karma** từ góc nhìn người ngoài: phiên trình duyệt sạch qua
  proxy quan sát viên, parser HTML `old.reddit.com`, biểu đồ karma 30 ngày, lịch sử từng lượt dò
  (`npm run health`, nút "Dò lại ngay").
- **Luật 10** — chặn job khi lần dò gần nhất kết luận nick đang bị ẩn.
- **Tự dọn ảnh chụp màn hình cũ hơn 30 ngày** ở cuối mỗi lượt dò; chỉ giữ ảnh khi kết luận khác
  "khỏe". Bản ghi kết luận giữ vĩnh viễn.
- **Facebook Login for Business** qua `config_id` — nick doanh nghiệp kết nối được.
- **Nick Facebook không còn bắt buộc proxy và profile antidetect.** Fanpage đăng bằng Graph API
  nên không mở trình duyệt. Ràng buộc "hai nick không dùng chung một proxy thật" vẫn nguyên.
- **Nhắc việc đăng tay dùng chung cho Reddit và Facebook Group** — trước chỉ có Group. Đích nào
  chưa có bộ đăng tự động thì mặc định rơi vào nhắc việc, không im lặng biến mất.
- **`npm run db:upgrade`** — nhận bản mới an toàn: kiểm tra có thay đổi cấu trúc database không,
  có thì sao lưu trước rồi mới áp, hỏng thì chỉ luôn tên file sao lưu để chép đè về.

**Sửa lỗi**

- Bộ dò không còn kết luận "khỏe" khi không có bài nào để đối chiếu — trường hợp này giờ là cảnh báo.
- Hai lượt dò không chạy chồng nhau nữa (file khóa `data/health-check.lock`, tự nhả sau 30 phút
  nếu tiến trình chết ngang).
- Chặn OAuth khi địa chỉ mở app lệch redirect URI đã đăng ký.
- Sửa số hiệu luật ghi sai trong code (nhãn hiển thị lệch so với tài liệu).
- Dọn ba cảnh báo set-state-in-effect và cảnh báo hydrate do extension trình duyệt chèn attribute.

**Kiểm chứng thật:** đăng bài lên Fanpage nháp qua Graph API — job chuyển `POSTED` kèm URL thật,
`Interaction` tự ghi, `AuditLog` ghi `FACEBOOK_PAGE_PUBLISHED`. Bộ dò đọc Reddit thật bắt được
2 lỗi parser (`npm run health:smoke` 17/17).

**Tài liệu:** báo cáo [code review toàn codebase](../plans/reports/code-review-260803-0303-toan-bo-codebase.md),
[security review](../plans/reports/security-review-260803-0443-phase-03-va-toan-he-thong.md),
[audit bàn giao team](../plans/reports/audit-260803-0627-ban-giao-team-dung-thu.md).

---

## 02/08/2026 — Phase 04 + vá bảo mật + sửa/xóa dữ liệu

**Tính năng**

- **Đăng Fanpage qua Graph API**: OAuth → token 60 ngày → Page token, tự tạo đích đăng, nút "Đăng
  lên Page" trong hàng đợi, chấm sức khỏe token trước khi gọi mạng.
- **Sửa và xóa được** nhân vật, proxy, nick, đích đăng, content. Xóa bị chặn khi còn job/tương tác
  trỏ tới; sửa xong là bộ luật tự chấm lại mọi job đang chờ.
- **Đẩy proxy vào profile antidetect trước khi mở** — đẩy hỏng thì không mở, tránh chạy bằng IP nhà.
- **Nhập hàng loạt proxy** từ file nhà cung cấp (`npm run proxies:import`).
- **Bộ luật áp theo nền tảng** — luật nào vô nghĩa với nền tảng nào thì không chạy, thay vì chạy
  rồi cho qua.

**Bảo mật**

- App chỉ nghe `127.0.0.1`, không ra LAN (`next dev -H 127.0.0.1`).
- Đối chiếu `Origin` cho mọi route handler trong `api/`.
- Vá lỗ cho phép ghi đè luật đụng độ thread — luật 8 không bao giờ được ghi đè.
- Lỗi giải mã credential không còn im lặng.

**Sửa lỗi**

- Job đã lên tường Facebook không còn bị đẩy về `FAILED` vì lỗi ở bước sau.
- Phân biệt hai thread Facebook có cùng path.
- Không lật được trạng thái job đã chốt; lịch gom theo ngày có năm.
- Bắt tay lại với MultiZen khi app antidetect khởi động lại giữa chừng.

**Kiểm chứng thật:** Chặng B (mở profile) và Chặng C (đẩy proxy, IP khớp) — kèm phát hiện **rò
WebRTC** cần luật firewall, ghi ở [báo cáo Chặng C](../plans/reports/chang-c-260802-1443-proxy-push-verification.md).

---

## 01-02/08/2026 — Phase 01 + Phase 02: nền móng

- **Kho danh tính**: nick + proxy + vân tay + nhân vật, ép 1:1 bằng ràng buộc database, credential
  mã hóa AES-256-GCM, sinh mã TOTP, mở profile antidetect bằng 1 click.
- **Hàng đợi content + bộ luật an toàn**: 10 luật, mỗi luật một file hàm thuần; chấm realtime
  ngay lúc xếp lịch; ghi đè phải nhập lý do và để lại `AuditLog`.
- **Từ điển thuật ngữ + bản đồ mã nguồn**; hai tài liệu bản trước khi xoay hướng đưa vào
  [archive/](archive/README.md).
- **MCP client tới MultiZen** dùng bearer token, bỏ yêu cầu endpoint CDP (MultiZen không phơi CDP —
  đó là bình thường, Phase 05 sẽ lái bằng chính tool MCP).

---

## Trước 01/08/2026 — xoay hướng

Bản đầu (tháng 7/2026) nhắm 50+ nick Twitter/X trên VPS + Docker + microservices, proxy dân cư
tính theo GB. Bản phản biện rủi ro tính ra riêng tiền proxy ~5,4 triệu/tháng và chỉ ra 5 rủi ro
chưa có lời giải. Kết quả: hạ quy mô xuống 5-8 nick Reddit + 1-3 Fanpage, chạy trên máy bàn, proxy
tĩnh tính theo IP. Chi tiết ở [archive/README.md](archive/README.md).
