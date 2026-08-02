# MKTTool

Bảng điều khiển nhiều tài khoản cho team marketing — đăng content lên Reddit và Facebook Pages
mà không bị shadowban hay bóp tương tác.

**Trạng thái:** Phase 01 (Kho danh tính) và Phase 02 (Hàng đợi content + Bộ luật an toàn) đã xong.
Phase 04 (Facebook Pages) xong phần khung — cắm Meta App vào là đăng được.
Xem [kế hoạch triển khai](plans/260801-2030-multi-account-posting-console/plan.md).

## Đây là gì

Không phải bot farm. Là "tủ hồ sơ + bảng điều khiển" cho **một** bạn MKT vận hành 5-8 nick Reddit
và 1-3 Fanpage. Team tự viết content, công cụ lo phần danh tính và an toàn.

Nguyên tắc bất di bất dịch: **1 nick = 1 proxy tĩnh = 1 vân tay = 1 nhân vật.**
Ràng buộc này do database ép, không lách được.

## Yêu cầu

- Node.js 22+ (dự án đang chạy trên 24)
- Một antidetect browser: [MultiZen](https://getmultizen.com/) (miễn phí) hoặc AdsPower
- Proxy tĩnh (static ISP), mỗi nick một IP

## Cài đặt

```bash
npm install
cp .env.example .env
npm run vault:keygen        # dán VAULT_KEY vào .env
npm run db:migrate
npm run dev                 # http://localhost:3000
```

> **VAULT_KEY phải được sao lưu vào password manager.** Mất khóa là mất toàn bộ mật khẩu và
> TOTP secret của mọi nick, không khôi phục được bằng bất kỳ cách nào.

## Lệnh

| Lệnh | Việc |
|---|---|
| `npm run dev` | Chạy app ở localhost:3000 |
| `npm test` | Chạy unit test |
| `npm run lint` | Chạy ESLint |
| `npm run typecheck` | Kiểm tra TypeScript |
| `npm run build` | Build production |
| `npm run db:migrate` | Áp migration |
| `npm run db:backup` | Sao lưu database ra `data/backups/` |
| `npm run proxies:import <file>` | Nhập hàng loạt proxy từ file `host:port:user:pass` của nhà cung cấp |
| `npm run db:studio` | Mở Prisma Studio xem database |
| `npm run vault:keygen` | Sinh khóa mã hóa mới |
| `npm run vault:rekey` | Xoay `VAULT_KEY` — mã hóa lại toàn bộ credential |
| `npm run vault:smoke` | Kiểm chứng nghiệm thu Phase 01 trên DB thật |
| `npm run vault:testotp` | Sinh TOTP secret dùng thử để kiểm chứng tính năng OTP |
| `npm run rules:smoke` | Kiểm chứng nghiệm thu Phase 02 (bộ luật) trên DB thật |
| `npm run facebook:smoke` | Kiểm chứng nghiệm thu Phase 04 (Facebook Pages) — không cần Meta App |

## Cách test

Nguyên tắc: **tách "test công cụ" khỏi "test với nick thật"**. Chặng A và B không cần
proxy, không cần tài khoản nào, và kiểm tra được phần lớn chức năng.

| Chặng | Cần gì | Kiểm chứng điều gì |
|---|---|---|
| **A** | không gì cả | `npm run vault:smoke` + `npm run rules:smoke` + `npm run facebook:smoke` + nhập dữ liệu giả qua UI: mã hóa, ràng buộc 1:1, copy mật khẩu, OTP (dùng `npm run vault:testotp` đối chiếu với Google Authenticator), bộ luật an toàn, và đường đi Facebook trong máy |
| **B** | MultiZen (miễn phí) | Profile trống, không đăng nhập gì. Bấm "Mở profile" → công cụ có mở được profile không. ✅ **Đạt 02/08/2026** — đây từng là câu hỏi chặn đường của Phase 00 |
| **C** | 1 proxy bất kỳ | Nhập proxy vào `/proxies`, gắn cho nick, bấm "Mở profile" → vào `ipinfo.io` → IP phải khớp proxy. Không cần chạm vào cài đặt MultiZen. ✅ **Đạt 02/08/2026** — [báo cáo](plans/reports/chang-c-260802-1443-proxy-push-verification.md) |
| **D** | nick thật + proxy đúng loại | Chỉ làm sau khi A/B/C xong. Xem quy trình cold-start ở [Phase 00](plans/260801-2030-multi-account-posting-console/phase-00-preparation-and-feasibility-check.md) |

> Đừng gộp proxy test với proxy dùng thật. Proxy datacenter giá rẻ dùng để kiểm tra
> "profile có ăn đúng IP không" thì được, nhưng đưa tài khoản thật vào đó là giết tài khoản.

## Thứ tự nhập liệu

1. **Nhân vật** (`/personas`) — mỗi nick một giọng, một mảng nội dung
2. **Proxy** (`/proxies`) — mua proxy TRƯỚC khi mua nick
3. **Tài khoản** (`/accounts`) — gắn nhân vật + proxy, đặt cold-start 14 ngày
4. **Đích đăng** (`/targets`) — subreddit kèm luật thật của sub đó
5. **Content** (`/content`) — bài team viết; phải nằm ở đây thì bộ luật mới so trùng được
6. **Hàng đợi** (`/queue`) — xếp lịch đăng, bộ luật chấm trước khi cho lưu

Riêng Fanpage không phải nhập tay ở bước 4: kết nối ở `/facebook` là công cụ tự tạo đích đăng.

### Sửa và xóa

Bấm vào tên bất kỳ dòng nào trong bảng là vào trang chi tiết, ở đó sửa được mọi thứ và có nút
xóa. Ba điều cần biết trước khi dùng:

**Ô mật khẩu để trống là giữ nguyên.** Mật khẩu không bao giờ được đổ ngược ra màn hình nên form
sửa không thể hiện giá trị cũ. Chỉ gõ vào khi thật sự muốn thay.

**Sửa nick, đích hoặc content là bộ luật tự chấm lại.** Karma, trạng thái, `minKarma`, tỷ lệ promo,
thân bài — tất cả đều là đầu vào của luật. Sửa xong, mọi job đang chờ liên quan được chấm lại ngay
và thông báo nói rõ đã chấm mấy job, mấy job vừa chuyển sang **BỊ CHẶN**. Job đã đăng thì không đụng
tới: trạng thái cuối là cuối.

**Xóa bị chặn khi còn thứ trỏ tới**, kèm câu nói rõ vướng gì ("còn 12 job, 30 tương tác đã ghi").
Đó không phải phiền hà mà là chủ ý: job và tương tác cũ chính là thứ luật hạn mức, luật tỷ lệ promo
và luật đụng độ thread đếm — xóa đi thì bộ luật cho qua những bài lẽ ra phải chặn, mà không có gì
báo rằng nó vừa mù đi.

> Nghỉ một nick thì đổi trạng thái sang **Đã chết**, nghỉ một đích thì bỏ tick **Đang dùng**.
> Cả hai giữ nguyên lịch sử. Nút xóa chỉ để dọn thứ vừa nhập sai vài phút trước.

Nền tảng của nick và của đích **không sửa được** sau khi tạo: đổi nó là biến mọi job cũ thành
nick-nền-tảng-này đăng vào đích-nền-tảng-kia, đúng thứ bị chặn ngay từ lúc tạo.

## Bộ luật an toàn

Mỗi lần xếp lịch, các phép kiểm tra chạy trước và trả về `ALLOW | WARN | BLOCK` kèm lý do
tiếng Việt. Đèn hiện ngay lúc chọn nick/đích, không đợi tới lúc bấm lưu.

Cột **Áp cho** cho biết luật chạy ở đâu. `Cộng đồng` = Reddit và Facebook Group — nơi mình là
khách trong nhà người khác, có mod và có hàng xóm để ý. Fanpage là kênh của chính mình nên
bốn luật giữ nhịp không áp: đăng 5 bài một ngày hay đăng toàn nội dung bán hàng đều bình thường.

| # | Luật | Chặn khi | Áp cho |
|---|---|---|---|
| 1 | Sức khỏe nick | trạng thái khác `ALIVE` | mọi nền tảng |
| 2 | Cold start | giờ đăng còn nằm trong cold-start | mọi nền tảng |
| 3 | Điều kiện đích | thiếu karma hoặc nick chưa đủ tuổi theo luật sub | mọi nền tảng |
| 4 | Hạn mức ngày | nick đã có 2 bài trong ngày đó | **cộng đồng** |
| 5 | Nghỉ giữa 2 bài | hai bài cùng sub cách nhau dưới 24 tiếng | **cộng đồng** |
| 6 | Tỷ lệ promo | chưa đủ 9 bài hữu ích cho bài quảng cáo tiếp theo | **cộng đồng** |
| 7 | Trùng nội dung | giống ≥ 70% một bài cùng nền tảng trong 30 ngày | mọi nền tảng |
| 8 | Đụng độ thread | nick khác của mình đã chạm đúng thread đó | **cộng đồng** |
| 9 | Chính sách link | sub cấm link mà bài có link | mọi nền tảng |

Luật 6 và 8 là hai luật không cộng đồng nào tha thứ. **Luật 8 không cho ghi đè** — hai nick cùng
chủ đụng một thread là tín hiệu phối hợp rõ nhất mà nền tảng bắt được. Các luật còn lại ghi đè
được nhưng bắt buộc nhập lý do và luôn để lại `AuditLog`.

Luật 8 chạy ở hai chỗ với hai mức khác nhau, và checklist ghi rõ đang là mức nào:

- **Lúc xếp lịch** bài chưa tồn tại nên chưa có thread để so — luật chỉ cảnh báo "nick khác vừa
  hoạt động cùng đích". Checklist hiện đúng tên đó, không ghi trống "Đụng độ thread ✓" để khỏi
  ai tưởng đã kiểm thứ chưa kiểm được.
- **Lúc ghi tương tác** (`/queue` → "Ghi tương tác thủ công") mới có link thread thật, và đó là
  nơi nhánh CHẶN chạy.

Luật bị bỏ qua **không im lặng**: checklist ghi rõ "Không áp dụng cho nền tảng này: …" để không ai
tưởng công cụ đã kiểm mà thật ra không.

Ngưỡng chung nằm ở bảng `RuleConfig`, sửa bằng `npm run db:studio` — không cần sửa code, không
cần build lại. Thiếu key nào thì dùng mặc định trong `src/lib/rules/rule-thresholds.ts`.
Ngưỡng riêng của từng sub (karma, tuổi nick, tỷ lệ promo, cho link hay không) thì sửa thẳng ở
trang chi tiết của đích đó.

> Đăng xong nhớ bấm **"Đã đăng"** và ghi lại các lần comment/upvote. Bộ luật chỉ biết những gì
> được ghi lại — không ghi thì luật chặn đụng độ thread không có gì để so.

## Kiến trúc

```
src/
├── app/                     Next.js App Router — trang và API
│   ├── accounts/            danh sách + chi tiết nick (sửa, xóa, copy credential)
│   ├── content/             kho content team viết
│   ├── queue/               hàng đợi + trang xếp lịch có chấm luật realtime
│   ├── facebook/            kết nối Fanpage, trạng thái token
│   ├── personas/ proxies/ targets/  danh sách + trang chi tiết để sửa/xóa
│   └── api/
│       ├── accounts/[id]/launch/   mở profile antidetect
│       ├── facebook/oauth/         start + callback của luồng OAuth
│       └── rules/preview/          chạy thử bộ luật, trả verdict
├── components/              khối UI dùng chung (ui/, vault/, queue/, content/, facebook/)
└── lib/
    ├── accounts/            server actions (thêm/sửa/xóa) + schema form + trạng thái nick
    ├── antidetect/          adapter MultiZen / AdsPower (đổi bằng 1 dòng .env)
    ├── content/             từ vựng content + server action kho content
    ├── crypto/              AES-256-GCM cho credential
    ├── db/                  Prisma client
    ├── facebook/            Graph API: OAuth, token, đăng Fanpage, nhắc việc group
    ├── format/ platforms/   định dạng ngày, gộp họ nền tảng
    ├── queue/               server action cho job + tương tác
    ├── rules/               bộ luật an toàn — mỗi luật một file
    └── totp/                sinh mã OTP 2FA
```

Mỗi luật là một hàm thuần `(ctx: RuleContext) => RuleVerdict`. Toàn bộ việc hỏi database nằm ở
`rule-context-builder.ts`, nên thêm luật mới chỉ là thêm một file và một dòng trong `rules-engine.ts`.

Stack: Next.js 16 + TypeScript + Prisma 7 + SQLite + MCP client tới MultiZen. Một process, chạy
trên máy bạn MKT. Chưa cần VPS, Docker, Postgres hay Redis.

*(`playwright` còn trong dependencies nhưng chưa file nào dùng — để dành cho bộ dò shadowban ở
Phase 03, chạy trực tiếp qua proxy quan sát viên chứ không qua antidetect browser.)*

## Antidetect browser

Sửa `ANTIDETECT_PROVIDER` trong `.env` thành `multizen` hoặc `adspower`. Không đụng code.

MultiZen đòi **bearer token**: lấy trong app ở `MCP → Connect an agent`, dán vào
`MULTIZEN_MCP_TOKEN`. Thiếu token là mọi lời gọi ăn HTTP 401.

### Proxy được đẩy tự động

Bấm "Mở profile" là MKTTool **ghi proxy của nick vào profile trước, rồi mới mở** — không phải
nhập tay hai nơi nữa. Đẩy hỏng thì **không mở profile**, vì profile thiếu proxy sẽ chạy thẳng
bằng IP nhà mà không ai nhận ra.

Trường **Giao thức** (`http` / `socks5`) ở `/proxies` phải khớp cổng nhà cung cấp cấp — nhiều nơi
dùng cổng khác nhau cho hai giao thức (Webshare thì cùng cổng phục vụ cả hai).

Chọn giao thức nào cũng được: **DNS phân giải từ xa trong cả hai chế độ** (đo 02/08/2026 — resolver
thấy được là chính IP proxy), vì trình duyệt luôn nói chuyện với cầu SOCKS5 nội bộ của MultiZen,
giao thức upstream chỉ là chặng sau đó.

> ⚠️ **MultiZen căn múi giờ theo IP proxy, nhưng KHÔNG căn ngôn ngữ.** Đo được 02/08/2026:
> profile cấu hình `Europe/Stockholm` + `Svenska`, chạy qua proxy GB thì `timezone` thành
> `Europe/London` (tự ghi đè lúc chạy, đúng) còn `navigator.language` vẫn là `sv-SE` — tiếng
> Thụy Điển trên IP Anh, tín hiệu bất thường rõ ràng.
>
> **Quy trình tạo profile:** gắn proxy → tab Fingerprint → bấm **"Match proxy"** → *rồi mới*
> đăng nhập lần đầu. Đừng đổi ngôn ngữ của profile đang nuôi: nick dùng `sv-SE` suốt 3 tháng rồi
> đột ngột sang `en-GB` còn đáng ngờ hơn là cứ để lệch.

> ⚠️ Đẩy thành công **không** có nghĩa proxy còn sống. Vẫn mở `ipinfo.io` kiểm IP sau mỗi lần
> mở profile mới — proxy hết hạn hoặc bị chặn vẫn ăn cấu hình bình thường.

MultiZen không phơi endpoint CDP ra ngoài (Playwright không gắn vào được) — đó là **bình thường,
không phải lỗi**. Nó lái trình duyệt bằng chính tool MCP của nó (`navigate`, `click`, `type`,
`extract`, `screenshot`), và Phase 05 sẽ đi đường đó. AdsPower thì có trả về endpoint CDP.

## Facebook

Fanpage đăng bằng **Graph API chính thức** — miễn phí, hợp lệ, không bao giờ bị khóa vì vi phạm
chính sách tự động hóa. Không cần antidetect browser, không cần proxy.

**Bốn bước cấu hình** (làm một lần, khi nào cần thì làm — thiếu nó cả app vẫn chạy bình thường):

1. Tạo app loại Business ở [developers.facebook.com](https://developers.facebook.com/)
2. Thêm Facebook Login, bật `pages_manage_posts` + `pages_read_engagement` + `pages_show_list`
3. Khai redirect URI đúng bằng `http://localhost:3000/api/facebook/oauth/callback` — Facebook so
   từng ký tự, lệch dấu `/` cuối là hỏng
4. Điền `FACEBOOK_APP_ID` và `FACEBOOK_APP_SECRET` vào `.env`, khởi động lại dev server

Không cần App Review: chế độ Development đủ để đăng lên Page do chính mình quản trị.

> ⚠️ **Kết nối Facebook phải mở app bằng đúng `http://localhost:3000`**, không phải
> `http://127.0.0.1:3000`. Trình duyệt coi hai địa chỉ này là hai host khác nhau khi lưu cookie,
> nên cookie chống CSRF đặt ở một bên không tới được bên kia và luồng kết nối hỏng. Mở nhầm địa
> chỉ thì công cụ chặn ngay từ lúc bấm nút và nói rõ phải sửa gì — không để lỗi nổ ở bước cuối.
> (Meta cũng chỉ chấp nhận `http://` cho `localhost`, nên `localhost` là chuẩn của cả dự án.)

Vào `/facebook` bấm **Kết nối nick Facebook**, đăng nhập bằng nick cá nhân đang quản trị Page.
Công cụ tự đổi token 2 giờ → token 60 ngày → lấy Page token, và **tự tạo đích đăng** cho từng
Page nên xếp lịch được ngay. Job có đích Fanpage sẽ có nút **"Đăng lên Page"** ngay trong hàng đợi.

> Ở màn hình cấp quyền nhớ **tick chọn từng Page**. Bỏ sót Page nào là Page đó không hiện ra.

> Trên Facebook nên đặt **2 nick làm quản trị viên Page**. Mất nick admin duy nhất là mất Page,
> và token đang dùng chết theo ngay lập tức.

**Token chết không báo trước** — nick admin đổi mật khẩu, gỡ app, hoặc bị Meta khóa là token
thành rác ngay, và điều đó chỉ lộ ra ở lần đăng tiếp theo. Bấm "Kiểm tra token tất cả Page"
ở `/facebook` theo thói quen, đừng đợi tới lúc cần đăng gấp.

### Group phải đăng tay — không phải thiếu tính năng

Meta gỡ quyền `publish_to_groups` tháng 04/2024. Không công cụ nào tự đăng group được nữa,
Buffer/Hootsuite/Make đều đã bỏ. Thứ tự nhận làm được chỉ có thể là lái trình duyệt giả người
dùng — đúng hành vi khiến nick bị khóa.

Bài group vẫn xếp lịch ở `/queue` với đích loại Facebook Group và **vẫn bị chấm đủ 9 luật** như
Reddit. Đến hạn, trang tổng quan nhắc việc kèm nút **mở profile** + **copy nội dung**; dán và
bấm đăng là việc của người. Đăng xong quay lại hàng đợi bấm "Đã đăng".

## Bảo mật

- Mật khẩu, mật khẩu email, TOTP secret, **token Facebook**: mã hóa AES-256-GCM trước khi chạm database
- `FACEBOOK_APP_SECRET` chỉ nằm ở server, không có component client nào import tới nó
- Thông báo lỗi Graph API đi qua bộ che token trước khi hiện ra hoặc ghi `AuditLog` — Graph hay
  vọng lại nguyên tham số đã gửi
- Khóa nằm ở biến môi trường, không nằm trong DB
- Mật khẩu không bao giờ render ra màn hình — bấm copy là chép thẳng vào clipboard
- Mọi lần lộ credential / mở profile đều ghi `AuditLog`
- App chỉ nghe `127.0.0.1` — ép bằng cờ `-H` trong `package.json`, không phải mặc định
- Route `POST` trong `api/` đối chiếu `Origin` với `Host` — Next tự làm việc này cho server
  action nhưng không làm cho route handler, mà route handler chính là chỗ có nút mở profile
- `.env` và `*.db` đã nằm trong `.gitignore`

### Không có đăng nhập — nên chỗ app lắng nghe là toàn bộ hàng rào

Công cụ không có màn hình đăng nhập: ai mở được trang là làm được mọi thứ, gồm copy mật khẩu
nick và sinh mã OTP. Mã hóa AES không đỡ được tình huống đó — chính app giữ khóa và giải mã
cho bất kỳ ai hỏi.

Vì vậy `npm run dev` và `npm start` đều gắn cứng `-H 127.0.0.1`. Mặc định của Next.js là nghe
mọi card mạng, tức là cả người ngồi cùng wifi cũng mở được `http://<ip-máy-bạn>:3000`.

> ⚠️ **Đừng bỏ cờ `-H`, và đừng chạy `next dev` trực tiếp** để "cho nhanh". Cũng đừng đưa app
> ra sau reverse proxy hay ngrok khi chưa có lớp xác thực — lúc đó kho danh tính thành trang web
> công khai.

### Sao lưu — hai nửa, cất hai nơi

```bash
npm run db:backup     # → data/backups/mkttool-<ngày>-<giờ>.db
```

Chạy được khi app đang mở. Dùng `VACUUM INTO` chứ không copy file, vì SQLite chạy chế độ WAL:
copy mỗi file `.db` là ra một bản sao thiếu dữ liệu mới nhất, và cái thiếu đó chỉ lộ ra đúng
lúc cần khôi phục.

Khôi phục: chép file sao lưu đè lên `dev.db` (tắt app trước).

> Bản sao lưu và `VAULT_KEY` là **hai nửa của một thứ**. Có bản sao mà mất khóa thì mở ra chỉ
> thấy chuỗi vô nghĩa; có khóa mà mất bản sao thì chẳng còn gì để mở. Cất hai nơi khác nhau —
> để chung là đưa cả ổ lẫn chìa cho người nhặt được.

### Khóa bị lộ thì xoay, không phải nhập lại từ đầu

Lỡ commit `.env`, lỡ dán khóa vào chat, máy nghi bị xâm nhập:

```bash
npm run vault:keygen                            # sinh khóa mới
npm run vault:rekey -- --new-key=<hex>          # THỬ: giải mã hết, không ghi gì
npm run vault:rekey -- --new-key=<hex> --apply  # tự sao lưu rồi ghi đè
```

Lượt `--apply` giải mã sạch toàn bộ **trước khi** ghi bất cứ thứ gì, tự sao lưu, rồi ghi trong
một transaction. Một bản ghi hỏng là dừng cả mẻ — database xoay khóa được một nửa thì không
khóa nào mở nổi nữa.

Xong lệnh **chưa phải là xong**: phải tự sửa `VAULT_KEY` trong `.env`, khởi động lại app, rồi
mở một nick bấm copy mật khẩu để kiểm. Giữ khóa cũ tới khi kiểm xong — bản sao lưu vừa tạo
vẫn mã hóa bằng khóa cũ.

### WebRTC — cần luật firewall, đừng bỏ

MultiZen che IP trong ICE candidate ở tầng JS (thay bằng chuỗi `auto`), nhưng **gói UDP vẫn rời
máy bằng IP nhà**: cầu SOCKS5 của nó không chuyển tiếp UDP. Site tự chạy STUN/TURN server riêng
thì thấy IP thật — đủ để nối mọi nick về một hộ gia đình. Không chỉnh được từ MultiZen (không có
trong MCP, file cấu hình, lẫn GUI).

Đã bịt 02/08/2026 bằng luật Windows Firewall chặn UDP ra ngoài cho `chrome.exe` của cloakbrowser.
Đo lại: candidate `srflx` bằng 0, duyệt web không chậm đi (Chrome không dùng QUIC khi có proxy).

> ⚠️ Đường dẫn trong luật có **số phiên bản chromium**. Nâng cấp MultiZen là đường dẫn đổi và luật
> **lặng lẽ hết tác dụng**. Sau mỗi lần nâng cấp: tạo lại luật rồi đo lại.
> Luật cũng chỉ chạy khi firewall bật cho profile mạng đang dùng.
> Câu lệnh + cách đo: [báo cáo Chặng C](plans/reports/chang-c-260802-1443-proxy-push-verification.md).

## Việc chưa làm

- Dò shadowban + theo dõi karma → Phase 03
- Tự động đăng Reddit → Phase 05
- **Chưa đăng thử lên Fanpage thật lần nào.** Toàn bộ đường đi trong máy đã nghiệm thu bằng
  `npm run facebook:smoke` (11/11 đạt), nhưng chính lời gọi Graph API thì phải có Meta App mới
  chạy được — bước cuối của [Phase 04](plans/260801-2030-multi-account-posting-console/phase-04-facebook-pages-publisher.md).
