# Nhật ký thay đổi

Ghi theo ngày, gom theo giai đoạn. Chỉ ghi thứ đổi hành vi của công cụ — không ghi việc dọn dẹp
nội bộ. Trạng thái hiện tại ở [development-roadmap.md](development-roadmap.md).

Dự án chưa phát hành phiên bản (`0.1.0`, dùng nội bộ). Mốc chia theo giai đoạn, không theo semver.

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
  nick, email gốc và host/port/username của proxy. Hai chi tiết phải đúng: tên file là
  `proxy.ts` (Next 16 bỏ `middleware.ts`), và `runtime: "nodejs"` — để mặc định edge thì Prisma
  không nạp được và **mọi trang thành 500**.
- **Bỏ `-H 127.0.0.1` khỏi `dev` và `start`** — bước cuối cùng, chỉ làm sau khi danh sách chưa
  gác về rỗng.
- **Tắt `agentRules`** trong `next.config.ts`. Next 16 tự sinh `AGENTS.md` và `CLAUDE.md` ở gốc
  kho mỗi lần chạy dev; dự án đã có `README.md` và `docs/` nên hai file đó chỉ là nguồn sự thật
  thứ hai, không ai viết và tự ghi đè sau mỗi lần nâng cấp Next. Tắt ở nguồn chứ không
  `.gitignore` — bỏ qua trong git thì chúng vẫn mọc lại trong thư mục làm việc.

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
