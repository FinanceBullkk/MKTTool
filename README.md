# MKTTool

Bảng điều khiển nhiều tài khoản cho team marketing — đăng content lên Reddit và Facebook Pages
mà không bị shadowban hay bóp tương tác.

**Trạng thái:** Phase 01 (Kho danh tính), Phase 02 (Hàng đợi content + Bộ luật an toàn),
Phase 03 (Dò shadowban + theo dõi karma) và Phase 04 (Facebook Pages) đã xong —
Phase 04 đã đăng thật lên Fanpage qua Graph API ngày 03/08/2026.
Chi tiết ở [lộ trình phát triển](docs/development-roadmap.md).

File này là **cẩm nang vận hành** — cài, chạy, dùng từng màn hình. Tài liệu dự án (vì sao làm,
kiến trúc, bản đồ code, quy ước, nhật ký thay đổi) nằm ở [docs/](docs/README.md).

## Đây là gì

Không phải bot farm. Là "tủ hồ sơ + bảng điều khiển" cho **một** bạn MKT vận hành 5-8 nick Reddit
và 1-3 Fanpage. Team tự viết content, công cụ lo phần danh tính và an toàn.

Nguyên tắc bất di bất dịch: **1 nick = 1 proxy tĩnh = 1 vân tay = 1 nhân vật.**
Ràng buộc này do database ép, không lách được.

> Nguyên tắc trên là **cho nick Reddit**. Nick Facebook quản trị Fanpage thì bỏ trống proxy và
> profile antidetect được, vì Fanpage đăng bằng Graph API có token chính thức — không mở trình
> duyệt, không giả vân tay, không đi qua proxy. Database vẫn chặn hai nick dùng chung một proxy
> thật; chỉ là không bắt phải có.

## Yêu cầu

- Node.js 22+ (dự án đang chạy trên 24)
- **PostgreSQL 17** — bản cài native, không cần Docker
- Một antidetect browser: [MultiZen](https://getmultizen.com/) (miễn phí) hoặc AdsPower
- Proxy tĩnh (static ISP), mỗi nick một IP

## Cài đặt

Dựng hai database trước — một cho vận hành, một **riêng** cho bộ test:

```bash
createdb -U postgres mkttool_dev
createdb -U postgres mkttool_test
```

> Thư mục `bin` của Postgres phải nằm trong PATH (mặc định trên Windows:
> `C:\Program Files\PostgreSQL\17\bin`). Thiếu nó thì `npm run db:backup` không chạy được vì
> không tìm thấy `pg_dump` — và công cụ sẽ nói đúng câu đó chứ không báo lỗi mơ hồ.

```bash
npm install
cp .env.example .env
npm run vault:keygen        # chạy HAI lần: một khóa cho VAULT_KEY_SERVER,
                            # một khóa cho VAULT_KEY_OPERATOR trong .env
                            # rồi điền DATABASE_URL + TEST_DATABASE_URL
npm run db:upgrade
npm run dev                 # http://localhost:3000
```

> **`TEST_DATABASE_URL` phải trỏ vào một database riêng có tên kết thúc bằng `_test`.** Bộ test
> `DROP SCHEMA` không hỏi lại trước mỗi lượt chạy, nên nó từ chối chạy trên database không đúng
> quy ước đặt tên. Trỏ nhầm vào database vận hành là mất sạch kho danh tính, mất theo kiểu không
> kịp hối hận — quy ước tên rẻ hơn nhiều so với hậu quả.

> **Cả hai khóa phải được sao lưu vào password manager.** Mất khóa là mất vĩnh viễn phần dữ
> liệu thuộc vùng đó, không khôi phục được bằng bất kỳ cách nào.
>
> Kho chia làm **hai vùng khóa**: `VAULT_KEY_SERVER` giữ mật khẩu proxy và token Facebook —
> máy chủ cần chúng để làm việc; `VAULT_KEY_OPERATOR` giữ mật khẩu, email và TOTP của nick.
> Đích đến là khóa operator **không nằm trên máy chủ**, để chiếm được máy chủ cũng không mở
> nổi một mật khẩu nick nào. Vùng của từng cột khai ở
> `src/lib/crypto/encrypted-field-registry.ts`.
>
> Đang nâng cấp từ bản một khóa? Đặt **cả hai** biến bằng đúng giá trị `VAULT_KEY` cũ, rồi tách
> thật bằng `npm run vault:rekey -- --domain=operator --new-key=<hex>`.

> **`TEAM_TIMEZONE` là biến bắt buộc.** Thiếu nó app dừng ngay kèm thông báo, không tự lùi về
> giờ máy. `.env.example` đã điền sẵn `Asia/Ho_Chi_Minh` — xem [Múi giờ](#múi-giờ) bên dưới.

## Múi giờ

**Một múi giờ cho cả team, không phải giờ của máy đang chạy.** `TEAM_TIMEZONE` quyết định
"hôm nay" bắt đầu và kết thúc lúc nào, và mọi thứ dưới đây đọc nó:

| Chỗ | Vì sao quan trọng |
|---|---|
| Luật hạn mức ngày (luật 4) | "2 bài một ngày" phải cùng nghĩa với mọi người |
| Cold start (luật 2) | hết cold-start lúc nào |
| Giãn cách hai bài cùng sub (luật 5) | mốc 24 tiếng |
| Ô chọn giờ ở `/queue` | gõ 21:30 thì job rơi đúng 21:30 giờ team |
| Mọi ngày giờ hiển thị | ai mở cũng thấy một con số |

Vì sao phải cứng nhắc thế: `setHours(0,0,0,0)` cắt ngày theo giờ **của máy đang chạy**. Một
người dùng thì không ai thấy gì. Hai người ngồi hai múi giờ là **cùng một job cho hai kết quả
khác nhau** — luật hạn mức đếm sang ngày khác, cold-start hết sớm hoặc muộn vài tiếng — và
không có gì báo rằng nó vừa lệch. Đó là lý do có một test quét mã nguồn cấm hẳn họ hàm
`getHours` / `setHours` / `toLocaleDateString` trong `src/`
([machine-clock-ban.test.ts](src/lib/format/machine-clock-ban.test.ts)): kiểu hỏng này không
làm test nào đỏ, nên phải cấm thẳng.

> ⚠️ **Đổi `TEAM_TIMEZONE` thì phải build lại**, không phải chỉ khởi động lại. Ô chọn giờ chạy
> ở trình duyệt cũng đọc biến này, và giá trị được nhúng vào bundle lúc build (xem
> `next.config.ts`).

### Nhận bản mới

```bash
npm install
npm run db:upgrade
```

`db:upgrade` xem bản mới có thay đổi cấu trúc database không. Không có thì nó nói vậy rồi dừng.
Có thì nó **sao lưu trước**, áp xong mới báo — và nếu áp hỏng thì chỉ luôn tên file sao lưu kèm
đúng lệnh `psql` để nạp lại. Chạy lại nhiều lần không sao: đã mới nhất thì nó không làm gì.

> ⚠️ **Có thay đổi cấu trúc thì phải khởi động lại `npm run dev`.** Dev server nạp bản mô tả
> database một lần lúc khởi động và giữ nguyên trong bộ nhớ, nên nó vẫn tin là cột mới không tồn
> tại — biểu hiện là lỗi đỏ `Unknown argument` ngay giữa màn hình dù code và database đều đúng.
> Khởi động lại vẫn báo y hệt thì xóa thư mục `.next` rồi chạy lại.

> Đừng dùng `npm run db:migrate` cho việc này. Đó là lệnh của người phát triển: nó có thể hỏi
> lại, có thể tạo migration mới, và trong vài tình huống còn đề nghị dựng lại database từ đầu —
> tức xóa sạch kho danh tính.

## Lệnh

| Lệnh | Việc |
|---|---|
| `npm run dev` | Chạy app ở localhost:3000 |
| `npm test` | Chạy unit test |
| `npm run lint` | Chạy ESLint |
| `npm run typecheck` | Kiểm tra TypeScript |
| `npm run build` | Build production |
| `npm run db:upgrade` | **Nhận bản mới thì chạy lệnh này** — sao lưu rồi áp thay đổi cấu trúc |
| `npm run db:migrate` | Tạo migration mới (chỉ dùng khi phát triển) |
| `npm run db:backup` | Sao lưu database ra `data/backups/` |
| `npm run proxies:import <file>` | Nhập hàng loạt proxy từ file `host:port:user:pass` của nhà cung cấp |
| `npm run db:studio` | Mở Prisma Studio xem database |
| `npm run vault:keygen` | Sinh khóa mã hóa mới (dùng cho cả hai vùng khóa) |
| `npm run keys:server-keygen` | Sinh cặp khóa ký vé của máy chủ — in khóa riêng để dán vào `.env` và khóa công khai để chép sang từng cầu nối |
| `npm run vault:rekey` | Xoay khóa một vùng (`--domain=server\|operator`) — mã hóa lại credential của vùng đó |
| `npm run vault:smoke` | Kiểm chứng nghiệm thu Phase 01 trên DB thật |
| `npm run vault:testotp` | Sinh TOTP secret dùng thử để kiểm chứng tính năng OTP |
| `npm run rules:smoke` | Kiểm chứng nghiệm thu Phase 02 (bộ luật) trên DB thật |
| `npm run facebook:smoke` | Kiểm chứng nghiệm thu Phase 04 (Facebook Pages) — không cần Meta App |
| `npm run health` | Dò shadowban + đọc karma cho mọi nick Reddit (đặt lịch chạy hằng ngày) |
| `npm run health:smoke` | Kiểm chứng nghiệm thu Phase 03 — không cần nick, không cần proxy |

## Cách test

Nguyên tắc: **tách "test công cụ" khỏi "test với nick thật"**. Chặng A và B không cần
proxy, không cần tài khoản nào, và kiểm tra được phần lớn chức năng.

| Chặng | Cần gì | Kiểm chứng điều gì |
|---|---|---|
| **A** | không gì cả | `npm run vault:smoke` + `npm run rules:smoke` + `npm run facebook:smoke` + `npm run health:smoke` + nhập dữ liệu giả qua UI: mã hóa, ràng buộc 1:1, copy mật khẩu, OTP (dùng `npm run vault:testotp` đối chiếu với Google Authenticator), bộ luật an toàn, và đường đi Facebook trong máy |
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
| 10 | Kết quả dò gần nhất | lần dò cuối nói nick bị ẩn / dính checkpoint | **Reddit** |

Luật 10 đọc thứ **người ngoài nhìn thấy**, còn luật 1 đọc thứ **mình tự đặt**. Chỗ hai cái lệch
nhau mới là chỗ đáng lo: gỡ cách ly một nick về "Khỏe" bằng tay thì luật 1 cho qua ngay, nhưng
luật 10 vẫn thấy lần dò cuối nói nick bị ẩn và chặn cho tới khi có lần dò mới chứng minh ngược lại.
Nick chưa dò lần nào, dò lâu quá (mặc định 3 ngày), bộ dò hỏng, hoặc dò xong mà không có bài nào
đánh dấu đã đăng để đối chiếu — cả bốn đều làm luật cảnh báo. *Không có tin xấu* không phải là
*tin tốt*, đó là *không có tin*.

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

## Đăng bài

Chỉ **Fanpage** đăng được bằng một nút (Graph API). **Reddit và Facebook Group phải đăng tay** —
Reddit chưa có bộ tự đăng (Phase 05), còn Group thì Meta gỡ quyền từ 04/2024.

Xếp lịch **không phải là hẹn giờ tự đăng**: nó ghi giờ dự kiến và chấm luật theo giờ đó. Đến giờ,
bài không tự lên.

Bài đăng tay đến hạn trong 24 tiếng tới hiện ở thẻ **"Đăng tay"** ngay trang tổng quan, cũ nhất
lên trước, quá giờ thì có nhãn riêng. Mỗi dòng có sẵn:

| Nút | Việc |
|---|---|
| **Mở profile** | Đẩy proxy vào profile antidetect rồi mở — không phải sang trang nick tìm lại |
| **Copy tiêu đề** / **Copy thân bài** | Chỉ Reddit, vì form Reddit có hai ô rời. Thân bài **không kèm tiêu đề**, dán vào là không bị lặp |
| **Copy nội dung** | Chỉ Facebook Group, vì ô đăng của group chỉ có một |
| Tên đích | Mở thẳng sub/group ở tab mới |

Link trong content luôn được dán kèm cuối phần thân bài: Reddit và Group đều không dựng thẻ xem
trước từ tham số như Page, nên link nằm ngoài thân bài là link biến mất khỏi bài.

> Đăng xong **phải quay lại `/queue` bấm "Đã đăng"** và dán link bài. Bộ luật chỉ biết những gì
> được ghi lại: không bấm thì luật đụng độ thread không có gì để so, và bộ dò shadowban không có
> bài nào để đối chiếu — nick sẽ rơi vào ô "Chưa đối chiếu được" dù vẫn đang đăng đều.

Bấm nhầm thì sửa được: job **Đã đăng / Bỏ qua / Lỗi** có nút **"Trả về chờ đăng"**. Nó xóa cả link
lẫn dấu vết đụng thread mà lượt "Đã đăng" đã ghi, rồi chấm lại luật — nên chỉ dùng khi bài **chưa
thật sự lên**. Trả về một bài đã lên thật là tự mở đường đăng nó lần thứ hai.

### Khỏi chép link: "Quét & gán link"

Với job Reddit còn đang mở, dòng job có nút **"Quét & gán link"**. Đăng tay xong bấm nó: bộ dò mở
trang profile công khai qua proxy quan sát viên (~30-60 giây), thấy bài vừa lên và **tự đánh dấu
đã đăng kèm link** — không phải copy link dán lại.

Nó chỉ tự ghi khi chắc. Ba cửa phải qua hết:

| Cửa | Vì sao |
|---|---|
| Cùng sub với đích của job | Một nick đăng nhiều sub; ghép nhầm sub là gán link bài này cho job kia |
| Đăng cách giờ dự kiến ≤ 24 tiếng | Lịch là giờ **dự kiến**, đăng trễ nửa ngày là bình thường |
| Slug tiêu đề trong link khớp content | Cửa chặn đúng ca dán nhầm link giữa hai bài cùng sub |

Còn lại đúng **một** ứng viên mới ghi. Hai bài cùng khớp một job, hoặc hai job cùng khớp một bài
→ không gán bài nào, chỉ báo. Bài đăng ngoài công cụ (nuôi nick, bài của chủ cũ) không có job nào
để ghép nên vẫn hiện ở cảnh báo **"Có bài chưa ghi"** — vào `/queue` ghi tay.

Cửa sổ quan sát là **7 ngày** và chỉ đọc trang đầu profile, nên bài cũ hơn không tự gán được.
Facebook không có bộ dò: Fanpage đã tự có link từ Graph API, Group thì phải bấm tay.

## Kiến trúc

```
src/
├── app/                     Next.js App Router — trang và API
│   ├── accounts/            danh sách + chi tiết nick (sửa, xóa, copy credential)
│   ├── content/             kho content team viết
│   ├── queue/               hàng đợi + trang xếp lịch có chấm luật realtime
│   ├── facebook/            kết nối Fanpage, trạng thái token
│   ├── health/              bảng sức khỏe, lịch sử dò, biểu đồ karma
│   ├── personas/ proxies/ targets/  danh sách + trang chi tiết để sửa/xóa
│   └── api/
│       ├── accounts/[id]/launch/   mở profile antidetect
│       ├── facebook/oauth/         start + callback của luồng OAuth
│       ├── health/run/             dò lại một nick ngay
│       └── rules/preview/          chạy thử bộ luật, trả verdict
├── components/              khối UI dùng chung (ui/, vault/, queue/, content/, facebook/, health/)
└── lib/
    ├── accounts/            server actions (thêm/sửa/xóa) + schema form + trạng thái nick
    ├── antidetect/          adapter MultiZen / AdsPower (đổi bằng 1 dòng .env)
    ├── content/             từ vựng content + server action kho content
    ├── crypto/              AES-256-GCM cho credential
    ├── db/                  Prisma client
    ├── facebook/            Graph API: OAuth, token, đăng Fanpage
    ├── format/ platforms/   định dạng ngày, gộp họ nền tảng
    ├── health/              bộ dò shadowban: phiên trình duyệt sạch, parser, đánh giá, runner
    ├── proxies/             kiểm proxy còn sống (hỏi IP ra, chặn mở profile) + đo băng thông
    ├── queue/               server action cho job + tương tác, nhắc việc đăng tay
    ├── rules/               bộ luật an toàn — mỗi luật một file
    └── totp/                sinh mã OTP 2FA
```

Mỗi luật là một hàm thuần `(ctx: RuleContext) => RuleVerdict`. Toàn bộ việc hỏi database nằm ở
`rule-context-builder.ts`, nên thêm luật mới chỉ là thêm một file và một dòng trong `rules-engine.ts`.

Stack: Next.js 16 + TypeScript + Prisma 7 + PostgreSQL + MCP client tới MultiZen. Một process,
chạy trên máy bạn MKT. Chưa cần VPS, Docker hay Redis.

> Nền dữ liệu đổi từ SQLite sang Postgres ngày 04/08/2026 — bước đầu của việc biến công cụ
> thành web chung cho team. Một file SQLite trên một máy không phục vụ được 5-6 người ở 5-6 nơi.

`playwright` chỉ dùng cho bộ dò shadowban, chạy trực tiếp qua proxy quan sát viên chứ không qua
antidetect browser — xem [Dò shadowban](#dò-shadowban). Lần đầu chạy phải cài trình duyệt:
`npx playwright install chromium`.

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

### Proxy được kiểm trước khi mở

Bấm "Mở profile" là công cụ **đi qua chính proxy đó hỏi xem người ngoài nhìn thấy IP nào**, rồi
mới đẩy và mở. Năm kết luận:

| Kết luận | Nghĩa là | Có mở profile không |
|---|---|---|
| **Sống** | proxy trả lời, IP ra khác IP nhà | ✅ mở |
| **Chết** | không nối được, sai mật khẩu, hoặc proxy không ra được internet | ❌ **không mở** |
| **Không đổi IP** | proxy trả lời bình thường nhưng IP ra **đúng bằng IP máy này** | ❌ **không mở** |
| **Lệch nước** | proxy sống nhưng ra ở nước khác nước đã khai | ⚠️ mở, có nói rõ |
| **Không kiểm được** | dịch vụ tra cứu hỏng hoặc mất mạng — *không phải* tin tốt | ⚠️ mở, có nói rõ |

Kiểm cả kho bằng nút **"Kiểm tất cả"** ở `/proxies`; mỗi dòng cũng có nút **"Kiểm"** riêng và
một cột ghi kết luận của lần kiểm gần nhất. Proxy hỏng nổi lên thành dải cảnh báo đỏ ở trang
**Hôm nay** — không phải mở giao diện antidetect mới thấy.

Proxy **chưa kiểm lần nào** hiện đúng chữ "chưa kiểm lần nào", không hiện như đang khỏe.

> ⚠️ Phép đo trên là của **công cụ**, không phải của trình duyệt: nó chứng minh proxy còn sống,
> không chứng minh MultiZen đang thật sự dùng nó. Lần đầu mở một profile mới vẫn nên vào
> `ipinfo.io` trong chính profile đó đối chiếu.

### Đo băng thông proxy

Mỗi dòng ở `/proxies` có nút **"Đo tốc độ (1 MB)"**: tải một file thử 1 MB qua đúng proxy đó rồi
tính megabit/giây. Kết quả ghi lại thành một cột riêng, `< 1 Mbps` là **rất chậm**, `< 5 Mbps` là
**chậm**.

**Vì sao không có nút "đo cả kho":** mỗi lượt đo tiêu **1 MB quota trả tiền** của proxy. Nhân cả
đàn là vài chục MB mỗi lần bấm, nên phép đo này chỉ chạy khi bấm tay từng cái — cái giá ghi thẳng
trên nhãn nút. Kiểm proxy còn sống thì ngược lại, chỉ tốn vài KB, bấm thoải mái.

**Ba điều phải nhớ khi đọc số đo:**

- Đây là tốc độ **tải xuống**. Đăng bài kèm ảnh/video thì thứ quyết định là tốc độ tải lên, mà
  hai chiều có thể lệch nhau rất xa trên proxy dân cư.
- Số đo là `min(mạng nhà, proxy, máy chủ thử)` — đo lúc mạng nhà đang tải thứ khác thì proxy tốt
  vẫn ra số xấu. **So tương đối** giữa các proxy đo cùng lúc thì đáng tin, so với ngưỡng tuyệt đối
  thì không.
- 128 KB đầu bị loại khỏi phép tính (TCP khởi động chậm), và proxy quá chậm thì cắt sau 8 giây —
  lúc đó câu kết quả nói rõ là chưa tải hết ngân sách.

Đo được nhưng ra lỗi thì hiện **"không đo được"**, không hiện thành số 0: proxy chưa đo được và
proxy chậm là hai chuyện khác nhau, dẫn tới hai hành động khác nhau.

MultiZen không phơi endpoint CDP ra ngoài (Playwright không gắn vào được) — đó là **bình thường,
không phải lỗi**. Nó lái trình duyệt bằng chính tool MCP của nó (`navigate`, `click`, `type`,
`extract`, `screenshot`), và Phase 05 sẽ đi đường đó. AdsPower thì có trả về endpoint CDP.

## Đăng nhập

Công cụ đăng nhập bằng **tài khoản Google**, và chỉ email nằm trong danh sách khai sẵn mới vào
được. **Không có tự đăng ký** — Google chỉ chứng minh *"người này sở hữu email đó"*, chứ không
chứng minh *"người này thuộc team"*.

### Tạo Google OAuth client (làm một lần, ~5 phút)

1. Vào [console.cloud.google.com](https://console.cloud.google.com/) → tạo project mới
   (tên gì cũng được, ví dụ `MKTTool`).
2. Menu trái → **APIs & Services** → **OAuth consent screen**:
   - **User type: External** → Create
   - Điền App name, User support email, Developer contact — ba ô đó là bắt buộc, phần còn lại bỏ qua
   - **Scopes:** không thêm gì cả. Mặc định đã có `email` + `profile`, và đó là tất cả những gì
     công cụ cần. Xin thêm quyền là tự chuốc App Review mà chẳng dùng tới.
   - **Audience:** để ở chế độ **Testing** cũng chạy được, nhưng phải thêm từng email vào
     *Test users*. Chọn **Publish app** thì khỏi phải thêm — app chỉ xin `email`/`profile` nên
     Google **không bắt xét duyệt**.
3. **APIs & Services** → **Credentials** → **Create Credentials** → **OAuth client ID**:
   - **Application type: Web application**
   - **Authorized JavaScript origins:** `http://localhost:3000`
   - **Authorized redirect URIs:** `http://localhost:3000/api/auth/callback/google`
4. Chép **Client ID** và **Client secret** vào `.env`.

> ⚠️ **Redirect URI phải khớp từng ký tự**, kể cả dấu `/` cuối. Và phải là `localhost` chứ không
> phải `127.0.0.1` — trình duyệt coi hai địa chỉ này là hai host khác nhau khi lưu cookie, nên
> cookie phiên đặt ở một bên không tới được bên kia. Cùng cái bẫy với luồng Facebook bên dưới.

Lên Railway thì thêm URI thứ hai `https://<tên-app>.up.railway.app/api/auth/callback/google`
và đổi `BETTER_AUTH_URL`. Giữ cả hai để vẫn chạy được ở máy dev.

### Bốn biến phải điền

```bash
ALLOWED_EMAILS="ban@gmail.com,dongnghiep@gmail.com"   # ai vào được
ADMIN_EMAILS="ban@gmail.com"                          # ai là quản trị viên
BETTER_AUTH_SECRET="<32 byte hex>"                    # khóa ký cookie phiên
GOOGLE_CLIENT_ID="..."
GOOGLE_CLIENT_SECRET="..."
```

Sinh `BETTER_AUTH_SECRET`:

```bash
node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
```

Thiếu bất kỳ biến nào ở trên thì **app dừng ngay kèm thông báo rõ**, không lặng lẽ chạy ở chế độ
không có đăng nhập. Cùng nguyên tắc với `TEAM_TIMEZONE`.

### Hai vai trò

| Vai trò | Làm được gì |
|---|---|
| **ADMIN** | mọi thứ, kể cả phân công nick và lấy bí mật của mọi nick |
| **OPERATOR** | mọi thứ, **trừ** lấy mật khẩu / OTP của nick không phải mình phụ trách |

**Tầm nhìn thì không chia.** Ai cũng thấy nick, job, tương tác và lịch sử của người khác — cố ý:
luật đụng độ thread phải nêu đúng tên nick của đồng nghiệp thì người đọc mới xử lý được. Thứ duy
nhất bị chia là **bí mật của nick**, và chặn nằm ở tầng dữ liệu chứ không phải ẩn nút trên giao diện.

> **Gỡ người khỏi team:** xóa email khỏi `ALLOWED_EMAILS` rồi khởi động lại. Có hiệu lực ngay,
> kể cả người đó đang mở sẵn tab — danh sách được kiểm ở **mọi request**, không phải chỉ lúc
> đăng nhập. Nick họ từng phụ trách **không bị xóa theo**, chỉ mất chủ.

## Facebook

Fanpage đăng bằng **Graph API chính thức** — miễn phí, hợp lệ, không bao giờ bị khóa vì vi phạm
chính sách tự động hóa. Không cần antidetect browser, không cần proxy.

**Bốn bước cấu hình** (làm một lần, khi nào cần thì làm — thiếu nó cả app vẫn chạy bình thường):

1. Tạo app ở [developers.facebook.com](https://developers.facebook.com/). Màn hình chọn use case
   phải chọn **`Other`** rồi type **`Business`**. Chọn *"Authenticate and request data from users
   with Facebook Login"* là app khóa vào nhánh chỉ có quyền cấp user — không thêm được quyền Page,
   và **không sửa được**, phải tạo app khác (chính Meta nói vậy trong hộp thoại thêm use case).
2. **Add Product → Facebook Login for Business** → tab **Configurations** → tạo một configuration
   kiểu *General*, tick đúng ba quyền `pages_show_list` + `pages_read_engagement` +
   `pages_manage_posts`. Chép lại **Configuration ID**.
3. Tab **Settings** của sản phẩm đó → khai redirect URI đúng bằng
   `http://localhost:3000/api/facebook/oauth/callback` — Facebook so từng ký tự, lệch dấu `/` cuối
   là hỏng.
4. Điền `FACEBOOK_APP_ID`, `FACEBOOK_APP_SECRET` (App settings → Basic) và
   `FACEBOOK_LOGIN_CONFIG_ID` vào `.env`, khởi động lại dev server.

Không cần App Review: chế độ Development đủ để đăng lên Page do chính mình quản trị. Ba quyền trên
sẽ ghi *"Requires App Review"* — kệ nó, bạn là admin của chính app nên Facebook vẫn cấp.

> **Hai kiểu Facebook Login, khác nhau ở chỗ quyền khai ở đâu.** Bản thường khai bằng `scope` ngay
> trong URL; bản **for Business** khai trước trong một configuration, URL chỉ trỏ tới bằng
> `config_id`. App loại Business tạo từ 2025 chỉ thêm được bản for Business, nên phần lớn app mới
> cần `FACEBOOK_LOGIN_CONFIG_ID`. Điền biến đó vào là quyền lấy theo configuration, **không** lấy
> theo `REQUIRED_SCOPES` trong code nữa — thiếu quyền nào ở configuration thì tới lúc bấm đăng mới
> lộ ra. App cũ dựng bằng Facebook Login thường thì để trống biến này.

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

Bài group vẫn xếp lịch ở `/queue` với đích loại Facebook Group và **vẫn bị chấm 9 trong 10 luật**
— đúng như Reddit, trừ luật 10 vốn chỉ áp cho Reddit. Đến hạn nó hiện ở thẻ nhắc việc chung với
bài Reddit — xem [Đăng bài](#đăng-bài).

## Bảo mật

- Mật khẩu, mật khẩu email, TOTP secret, **token Facebook**: mã hóa AES-256-GCM trước khi chạm database
- `FACEBOOK_APP_SECRET` chỉ nằm ở server, không có component client nào import tới nó
- Thông báo lỗi Graph API đi qua bộ che token trước khi hiện ra hoặc ghi `AuditLog` — Graph hay
  vọng lại nguyên tham số đã gửi
- Khóa nằm ở biến môi trường, không nằm trong DB
- Mật khẩu không bao giờ render ra màn hình — bấm copy là chép thẳng vào clipboard
- Mọi lần lộ credential / mở profile đều ghi `AuditLog` kèm **ai** đã làm
- **Mọi server action và route handler đều đòi đăng nhập** — gác nằm ở chữ ký định nghĩa, và
  có test quét bắt buộc (xem [Hàng rào giờ là đăng nhập](#hàng-rào-giờ-là-đăng-nhập))
- **Mọi trang cũng đòi đăng nhập** — `src/proxy.ts` chặn trước khi trang kịp hỏi database
- Route `POST` trong `api/` đối chiếu `Origin` với `Host` — Next tự làm việc này cho server
  action nhưng không làm cho route handler, mà route handler chính là chỗ có nút mở profile
- `.env` và thư mục sao lưu `data/backups/` đã nằm trong `.gitignore` — bản dump chứa ciphertext

### Hàng rào giờ là đăng nhập, không còn là chỗ app lắng nghe

Trước 05/08/2026 công cụ không có màn hình đăng nhập, nên hàng rào duy nhất là chỗ nó lắng
nghe: `npm run dev` và `npm start` gắn cứng `-H 127.0.0.1` để chỉ mở được từ chính máy đó.

**Cờ đó đã bỏ**, vì hàng rào thật đã dựng xong: mọi lối vào đều đòi đăng nhập Google và đối
chiếu `ALLOWED_EMAILS` ở **mỗi request**. Đó là điều kiện đã hẹn trước cho việc bỏ cờ — công cụ
phải phục vụ được 5-6 người ở 5-6 nơi thì không thể chỉ nghe trên `localhost`.

Hàng rào đó có **hai nửa**, và thiếu nửa nào cũng vô nghĩa:

| Nửa | Gác gì | Ở đâu |
|---|---|---|
| `guardedAction` / `guardedRoute` | đường **làm**: mọi server action, mọi route handler | chữ ký định nghĩa |
| `src/proxy.ts` | đường **đọc**: mọi trang | chặn trước khi trang hỏi database |

Nửa thứ hai dễ quên nhất và từng bị quên thật: trang trong `app/` là server component tự gọi
thẳng Prisma rồi trả HTML, **không đi qua wrapper nào**. Gác đủ 35 lối vào mà không gác trang
thì chưa đăng nhập vẫn mở được `/accounts` và `/proxies` để đọc username từng nick, email gốc,
và host/port/username của từng proxy — không sửa được gì, nhưng đọc là đủ.

`proxy.ts` **kiểm phiên thật** (hỏi database rồi đối chiếu `ALLOWED_EMAILS`) chứ không chỉ ngó
xem có cookie hay không. Cách ngó cookie nhanh hơn và chạy được ở edge, nhưng nó không thấy
được người vừa bị gỡ khỏi danh sách — cookie của họ vẫn còn nguyên và vẫn hợp lệ suốt 7 ngày.
Đổi lại, nó bắt buộc phải chạy ở `runtime: "nodejs"`; để mặc định edge thì Prisma không nạp
được và **mọi trang thành 500**, không phải chỉ một trang.

Thứ giữ cho điều kiện đó không mục là một phép kiểm hình dạng mã nguồn
([guarded-entry-points.test.ts](src/lib/auth/guarded-entry-points.test.ts)): trong file
`"use server"` thì **mỗi hàm export là một endpoint POST riêng** mà người lạ gọi thẳng được nếu
biết tên, nên test bắt mọi export phải có dạng `export const x = guardedAction(...)`. Gác nằm ở
chữ ký chứ không nằm trong thân hàm — không nhánh `if` nào bỏ qua được, và thêm một action mới
mà quên gác thì test đỏ ngay chứ không lặng lẽ mở toang một lối vào.

> ⚠️ **Đừng thêm `await requireActor()` vào đầu thân hàm rồi coi là đã gác.** Dòng đó quên được
> và lách được, và phép kiểm cố ý không chấp nhận nó.

> ⚠️ Đưa app ra internet thì phải có HTTPS. Cookie phiên đặt cờ `Secure` khi
> `NODE_ENV=production`, và cookie `Secure` không bao giờ được gửi qua `http://` — chạy
> production sau một reverse proxy chỉ có HTTP là đăng nhập xong lại quay về màn hình đăng nhập,
> lặp vô tận mà không có câu lỗi nào.

### Sao lưu — hai nửa, cất hai nơi

```bash
npm run db:backup     # → data/backups/mkttool-<ngày>-<giờ>.sql
```

Chạy được khi app đang mở: `pg_dump` chụp ảnh trong một transaction nên bản sao luôn nhất quán,
không phải tắt server mới sao lưu được. Tên file có mốc thời gian nên **không bao giờ ghi đè
bản cũ**.

Bản sao là SQL dạng chữ (`--format=plain`) chứ không phải dạng nén, dù dạng nén nhỏ hơn. Vì bản
sao phải **đọc được bằng mắt** để kiểm "không có credential dạng trần" — quét chuỗi trên file nén
thì luôn không thấy gì, tức là một phép kiểm an toàn luôn xanh, kiểu hỏng tệ nhất của một phép
kiểm. `npm run vault:smoke` chạy đúng phép quét đó trên bản dump thật.

Khôi phục vào một database rỗng mới (đừng nạp đè lên database đang có dữ liệu):

```bash
createdb -U postgres mkttool_restore
psql -U postgres -d mkttool_restore -f data/backups/mkttool-<ngày>-<giờ>.sql
```

Rồi trỏ `DATABASE_URL` sang database vừa khôi phục.

> Bản sao lưu và **hai khóa vùng** là các nửa của cùng một thứ. Có bản sao mà mất khóa thì mở
> ra chỉ thấy chuỗi vô nghĩa; có khóa mà mất bản sao thì chẳng còn gì để mở. Cất mỗi thứ một
> nơi — để chung là đưa cả ổ lẫn chìa cho người nhặt được. Khóa operator nằm ở máy operator,
> nên khôi phục mật khẩu nick từ bản sao lưu của máy chủ **bắt buộc phải có khóa từ máy đó**.

### Khóa bị lộ thì xoay, không phải nhập lại từ đầu

Lỡ commit `.env`, lỡ dán khóa vào chat, máy nghi bị xâm nhập:

```bash
npm run vault:keygen                                              # sinh khóa mới
npm run vault:rekey -- --domain=server --new-key=<hex>            # THỬ: giải mã hết, không ghi gì
npm run vault:rekey -- --domain=server --new-key=<hex> --apply    # tự sao lưu rồi ghi đè
```

`--domain` là **bắt buộc**: kho có hai vùng khóa, mỗi lượt xoay đúng một vùng. `server` là mật
khẩu proxy + token Facebook; `operator` là mật khẩu / email / TOTP của nick. Lộ khóa nào thì
xoay vùng đó — không phải xoay cả kho.

Lượt `--apply` giải mã sạch toàn bộ **trước khi** ghi bất cứ thứ gì, tự sao lưu, rồi ghi trong
một transaction. Một bản ghi hỏng là dừng cả mẻ — database xoay khóa được một nửa thì không
khóa nào mở nổi nữa.

Xong lệnh **chưa phải là xong**: phải tự sửa biến khóa của vùng đó trong `.env`, khởi động lại
app, rồi mở một nick bấm copy mật khẩu để kiểm. Giữ khóa cũ tới khi kiểm xong — bản sao lưu vừa
tạo vẫn mã hóa bằng khóa cũ.

### WebRTC — cần luật firewall, đừng bỏ

MultiZen che IP trong ICE candidate ở tầng JS (thay bằng chuỗi `auto`), nhưng **gói UDP vẫn rời
máy bằng IP nhà**: cầu SOCKS5 của nó không chuyển tiếp UDP. Site tự chạy STUN/TURN server riêng
thì thấy IP thật — đủ để nối mọi nick về một hộ gia đình. Không chỉnh được từ MultiZen (không có
trong MCP, file cấu hình, lẫn GUI).

Đã bịt 02/08/2026 bằng luật Windows Firewall chặn UDP ra ngoài cho `chrome.exe` của cloakbrowser.
Đo lại: candidate `srflx` bằng 0, duyệt web không chậm đi (Chrome không dùng QUIC khi có proxy).

> ⚠️ Đường dẫn trong luật có **số phiên bản chromium**. Nâng cấp MultiZen là đường dẫn đổi và luật
> **lặng lẽ hết tác dụng**. Sau mỗi lần nâng cấp: tạo lại luật rồi đo lại.
>
> ⚠️ **Đường hỏng thứ hai: profile firewall của mạng đang dùng bị tắt.** Luật vẫn hiện
> `Enabled: True` nên nhìn qua tưởng còn sống, nhưng Windows không lọc gì trên profile đã tắt.
> Kiểm bằng hai lệnh, phải khớp nhau:
>
> ```powershell
> Get-NetConnectionProfile | Select-Object Name, NetworkCategory   # đang ở profile nào
> Get-NetFirewallProfile   | Select-Object Name, Enabled           # profile đó có bật không
> ```
>
> Bấm "Cho phép máy này được phát hiện" là mạng chuyển Public → Private. Profile Private mà
> đang tắt thì lớp chặn biến mất ngay lúc đó, không có gì báo.
> Câu lệnh + cách đo: [báo cáo Chặng C](plans/reports/chang-c-260802-1443-proxy-push-verification.md).

## Dò shadowban

Shadowban im lặng: bài vẫn hiện với chính mình, người ngoài không thấy gì. Không đo thì ba tháng
sau mới phát hiện cả cụm đã chết.

`npm run health` mở trang profile công khai của từng nick ở chế độ **chưa đăng nhập**, qua một
**proxy quan sát viên riêng**, rồi đối chiếu số bài thấy được với số bài đã đánh dấu đã đăng.
Kết quả vào bảng ở `/health` và trang chủ, kèm biểu đồ karma 30 ngày.

| Đo được gì | Kết luận |
|---|---|
| Reddit trả HTTP 404 cho trang profile | **Bị ẩn** — nhưng xem cảnh báo ngay dưới bảng |
| Profile hiện ra, nhưng 0/N bài đã đăng nhìn thấy được | **Bị ẩn** — kiểu ẩn từng bài |
| Thấy dưới một nửa số bài đã đăng | **Nghi ngờ** — có thể chỉ là mod xóa bài |
| Trang báo tài khoản bị treo | **Dính checkpoint** |
| **Thấy nhiều bài hơn số đã ghi trong kho** | **Có bài chưa ghi** — bộ luật đang đếm thiếu |
| Bộ dò bị captcha / Reddit đổi HTML | **Không dò được** — *không phải* tin tốt |
| Profile bình thường, nhưng chưa bài nào đánh dấu đã đăng | **Chưa đối chiếu được** — cũng *không phải* tin tốt |

**"Có bài chưa ghi" là kết luận về SỔ SÁCH, không phải về nick** — nên nó không cách ly nick.
Nhưng đừng bỏ qua: bộ luật đếm theo job, nên mỗi bài không được ghi làm luật hạn mức ngày, giãn
cách cùng đích, tỷ lệ promo và chặn đụng độ thread **đều dễ dãi hơn thực tế**. Bài bị ẩn thì mất
reach; bài không được ghi thì bộ luật lặng lẽ cho qua những bài lẽ ra phải chặn — và đó mới là
đường dẫn tới shadowban. Kể cả bài đăng tay để nuôi nick hay bài của chủ cũ khi mua nick cổ cũng
nên ghi.

Bộ dò đọc `data-permalink` của từng bài nên chỉ được **đích danh bài nào** chưa ghi, và job nào
khai đã đăng mà không thấy bài. Khóa sinh bằng đúng `normalizeThreadUrl()` mà luật 8 dùng, nên
hai bên ghép được với nhau.

Hai kết luận cuối bảng đều có nghĩa "chưa biết", chỉ khác nguyên nhân: **Không dò được** là bộ
dò hỏng, **Chưa đối chiếu được** là bộ dò chạy ngon nhưng không có gì để so. Nick mới hoặc đang
nghỉ thì đó là bình thường; nhưng nick đăng đều mà không ai bấm **"Đã đăng"** cũng rơi vào đúng ô
này — và đó mới là lúc cần cảnh báo nhất. Cả hai đều làm luật 10 cảnh báo, không cho qua im lặng.

> ⚠️ **404 có bốn nguyên nhân, và Reddit trả về cùng một trang cho cả bốn:** nick bị ẩn toàn
> cục, **username khai sai trong kho**, nick đã bị xóa, nick chưa từng tồn tại. Kiểm chính tả
> username trước khi tin kết luận — lượt dò thật đầu tiên (04/08/2026) đã cách ly nhầm một nick
> khỏe đúng vì lý do đó.
>
> Bộ dò dùng lịch sử dò để thu hẹp: **đã từng đọc được** profile này rồi mà giờ mất thì loại trừ
> được khả năng gõ sai, và lúc đó nó mới nói chắc. Chưa từng thấy lần nào thì câu chữ nói rõ là
> chưa loại trừ được gì.
>
> Dù nguyên nhân nào thì nick **vẫn bị cách ly** — cách ly nhầm một nick khỏe thì ồn ào và sửa
> được bằng tay, còn để một nick đã bị ẩn đăng tiếp thì im lặng và tốn content mỗi ngày.

Nick bị kết luận **Bị ẩn** hoặc **Dính checkpoint** sẽ tự chuyển trạng thái và bộ luật chặn mọi
job của nó. Chiều ngược lại thì không: một lần dò khỏe **không** tự gỡ cách ly, vì nó chỉ chứng
minh lần dò đó không thấy vấn đề. Gỡ là quyết định của người, ở trang chi tiết nick.

> ⚠️ **Proxy quan sát viên phải là IP riêng, không bao giờ đăng nhập nick nào.** Dò bằng chính
> proxy của nick là tự nhìn mình trong gương rồi kết luận người ngoài cũng thấy vậy. Nhập ở
> `/proxies`, khối "Proxy quan sát viên". Chưa có thì bộ dò dừng ngay từ đầu — cố ý, vì dò bằng
> IP nhà còn tệ hơn không dò, và trang **Hôm nay** sẽ nói thẳng là chưa chạy được vì thiếu nó.

Chỉ nhận proxy **HTTP**: Chromium không xác thực được với SOCKS5, nó bỏ qua user/mật khẩu rồi
đi tiếp — hoặc hỏng, hoặc tệ hơn là chạy bằng IP nhà mà không ai biết.

Proxy quan sát viên **kiểm được bằng nút "Kiểm"** ngay trong khối đó, dùng chung bộ kiểm với
proxy thường (xem [Proxy được kiểm trước khi mở](#proxy-được-kiểm-trước-khi-mở)). Nên bấm trước
mỗi lượt dò quan trọng: proxy này chết thì mọi nick ra kết luận *Không dò được* — trung thực
nhưng vô dụng, và người đọc sẽ đi tìm lỗi ở phía Reddit.

### Ba cách chạy một lượt dò

| Cách | Dùng khi |
|---|---|
| Nút **"Dò cả đàn"** ở `/health` | muốn chạy ngay mà không mở terminal. Chạy nền ở tiến trình riêng — đóng tab không ảnh hưởng, tải lại trang thì bảng đầy dần |
| `npm run health` | đặt lịch chạy hằng ngày bằng Task Scheduler. **Một lần mỗi ngày là đủ** |
| Nút **"Dò lại ngay"** ở từng dòng | soi lại đúng một nick đáng ngờ |

Nút "Dò cả đàn" sinh **đúng tiến trình mà `npm run health` chạy**, không phải một bản sao của
luồng dò — nên hai đường không thể lệch nhau.

Lượt đầy đủ nghỉ **ngẫu nhiên 30-90 giây giữa các nick**, nên 8 nick mất gần mười phút. Đó là
chủ ý: tám lượt xem profile bắn ra trong ba giây từ một IP là hành vi của máy, và chính bộ dò
sẽ bị chặn trước tiên.

**Hai lượt dò không bao giờ chạy chồng nhau.** Lượt đang chạy giữ một file khóa
(`data/health-check.lock`); lượt thứ hai bị từ chối kèm câu nói rõ ai đang giữ và giữ bao lâu
rồi. Khóa là file chứ không phải biến trong bộ nhớ vì `npm run health` chạy ở tiến trình riêng —
cặp dễ đụng nhau nhất chính là lịch chạy 3 giờ sáng gặp người đang bấm nút. Tiến trình bị tắt
ngang để lại khóa mồ côi thì sau 30 phút lượt sau tự giành lấy.

Ảnh chụp màn hình **chỉ giữ khi kết luận khác "khỏe"**, và tự xóa sau 30 ngày ở cuối mỗi lượt
dò. Bản ghi kết luận thì giữ nguyên vĩnh viễn — đó là thứ vẽ ra xu hướng karma và cho biết nick
chuyển xấu từ lúc nào.

> Bộ dò đọc HTML của `old.reddit.com`. Reddit đổi giao diện là nó hỏng — và khi hỏng thì nó báo
> **"Không dò được"** chứ không bao giờ báo "khỏe". `npm run health:smoke` chạy đối chiếu với
> Reddit thật (không cần nick, không cần proxy) nên đó là thứ chạy đầu tiên khi thấy kết quả lạ.

## Việc chưa làm

- Tự động đăng Reddit → Phase 05

## Đã kiểm chứng bằng thực tế

| Việc | Ngày | Bằng chứng |
|---|---|---|
| Mở profile antidetect | 02/08/2026 | Chặng B |
| Đẩy proxy vào profile, IP khớp | 02/08/2026 | [Chặng C](plans/reports/chang-c-260802-1443-proxy-push-verification.md) |
| Dò shadowban đọc Reddit thật | 03/08/2026 | `npm run health:smoke` 17/17, bắt được 2 lỗi parser |
| Kiểm proxy còn sống qua chính proxy đó | 04/08/2026 | 10/10 proxy Webshare ra đúng IP và đúng quốc gia; nhánh SOCKS5 và nhánh HTTP trên cùng một proxy cho cùng một IP |
| **Đăng thật lên Fanpage qua Graph API** | **03/08/2026** | Bài lên tường Page nháp; job `POSTED` kèm URL thật, `Interaction` tự ghi, `AuditLog` ghi `FACEBOOK_PAGE_PUBLISHED` |

Chưa kiểm chứng: đăng bằng nick Reddit thật (Phase 05 chưa làm), và `npm run health` với nick thật
— chưa nhập proxy quan sát viên nào.
