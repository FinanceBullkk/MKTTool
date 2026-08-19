# Hướng dẫn vận hành cho team

**Cập nhật:** 06/08/2026 | Dành cho **người dùng công cụ**, không phải người cài nó

> File này là thứ bạn đọc để *dùng*. Cài đặt, biến môi trường, cách dựng máy chủ nằm ở
> [README.md](../README.md) — đó là việc của ADMIN, bạn không cần mở.

**Địa chỉ web:** `https://mkttool-web-production.up.railway.app`

Mở bằng Chrome, đăng nhập bằng **tài khoản Google công ty** của bạn. Không có mật khẩu riêng cho
công cụ này — nếu Google vào được mà công cụ vẫn từ chối, nghĩa là email của bạn chưa có trong
danh sách cho phép: nhắn ADMIN, đừng thử lại nhiều lần.

---

## Bạn thuộc nhóm nào

Đọc đúng phần của mình, đừng đọc hết.

| Bạn làm | Phải cài gì trên máy | Đọc mục nào |
|---|---|---|
| **Fanpage + viết content** | **Không cài gì cả**, chỉ cần Chrome | 1 → 2 → 3 → 4 → 6 |
| **Nick Reddit** (và TikTok sau này) | MultiZen + cầu nối, ADMIN cài hộ | tất cả |

Điểm khác nhau gọn lại một câu: **Fanpage đăng được bằng một nút, Reddit phải đăng tay.** Không
phải công cụ thiếu tính năng — Reddit không có đường API dùng được, và Facebook Group thì Meta đã
gỡ quyền tự đăng từ 04/2024.

---

## 1. Mỗi sáng mở trang chủ, đọc bốn thẻ

Trang chủ là thẻ **Hôm nay**. Bốn thẻ dưới đây trả lời bốn câu khác nhau — nhìn hết bốn cái mất
khoảng một phút.

| Thẻ | Nói gì | Bạn làm gì |
|---|---|---|
| **Vòng đăng bài** | Nhịp đăng của cả đàn nick — vòng chỉ khép lại khi có người bấm "Đã đăng" | Chỉ để nắm tình hình |
| **Đăng tay — N bài** | Bài Reddit/Group tới hạn trong 24 tiếng tới, **cũ nhất lên trước** | Đây là danh sách việc của bạn hôm nay |
| **Sức khỏe đàn nick** | Hai tầng: dãy huy hiệu là trạng thái **mình tự đặt**, bảng dưới là thứ **người ngoài thật sự nhìn thấy** | Hai tầng lệch nhau chính là lúc phải xem kỹ — đọc mục 7 |
| **Đang cold-start** | Nick mới, chưa được phép đăng, kèm số ngày còn lại | Đừng cố xếp lịch cho nick trong đây |

> **Hai thẻ "Đăng tay" và "Đang cold-start" chỉ hiện khi có việc.** Không thấy chúng nghĩa là hôm
> nay không có bài nào tới hạn và không nick nào đang nuôi — không phải trang bị lỗi.

Ngoài bốn thẻ còn có **khay cảnh báo vận hành** ngay dưới thanh đầu trang. Nó chỉ hiện khi có
chuyện — cấu hình khai thiếu, cầu nối bản cũ, lịch sao lưu chưa chạy lần nào. **Thấy dòng vàng
hoặc đỏ ở đó thì chụp màn hình gửi ADMIN**, đừng tự sửa và cũng đừng lờ đi.

---

## 2. Xếp lịch một bài

Thứ tự cố định, không tắt bước nào được:

**Bước 1 — Viết content vào `/content`.** Bài phải nằm trong công cụ thì bộ luật mới so trùng
được. Viết trong Word rồi dán thẳng lên Reddit là công cụ không biết gì, và luật "trùng nội dung"
mù hoàn toàn.

**Bước 2 — Vào `/queue` → nút tạo job mới.** Chọn nick, chọn đích (sub / Page / group), chọn giờ
dự kiến, chọn content.

**Bước 3 — Nhìn đèn luật.** Đèn hiện **ngay lúc chọn nick và đích**, không đợi bấm lưu. Xem mục 3.

> ⚠️ **Xếp lịch KHÔNG phải hẹn giờ tự đăng.** Nó ghi giờ dự kiến và chấm luật theo giờ đó. Đến giờ
> bài **không tự lên** — trừ Fanpage, và Fanpage cũng phải có người bấm nút. Đây là chỗ hay hiểu
> nhầm nhất trong tuần đầu.

Đăng trễ nửa ngày so với giờ dự kiến là bình thường, không sao cả. Giờ đó dùng để chấm luật và xếp
thứ tự nhắc việc, không phải một lời hứa.

---

## 3. Đọc đèn luật

Mỗi lần xếp lịch, mười phép kiểm chạy và trả về một trong ba mức, kèm lý do bằng tiếng Việt:

| Đèn | Nghĩa là | Làm gì |
|---|---|---|
| 🟢 **Cho phép** | Không thấy vấn đề | Lưu bình thường |
| 🟡 **Cảnh báo** | Có điểm đáng để ý nhưng không chặn | Đọc lý do rồi tự quyết |
| 🔴 **Chặn** | Không lưu được | Đọc mục dưới |

Mười luật, và điều đáng nhớ là **luật nào bị bỏ qua thì checklist nói thẳng** — nó ghi *"Không áp
dụng cho nền tảng này"* chứ không im lặng. Đừng bao giờ đọc một ô trống thành "đã kiểm rồi".

| # | Luật | Chặn khi |
|---|---|---|
| 1 | Sức khỏe nick | Nick không ở trạng thái Khỏe |
| 2 | Cold start | Nick còn trong thời gian nuôi (mặc định 14 ngày) |
| 3 | Điều kiện đích | Thiếu karma, hoặc nick chưa đủ tuổi theo luật sub |
| 4 | Hạn mức ngày | Nick đã có 2 bài trong ngày đó |
| 5 | Nghỉ giữa 2 bài | Hai bài cùng sub cách nhau dưới 24 tiếng |
| 6 | Tỷ lệ promo | Chưa đủ 9 bài hữu ích cho bài quảng cáo tiếp theo |
| 7 | Trùng nội dung | Giống từ 70% một bài cùng nền tảng trong 30 ngày |
| 8 | **Đụng độ thread** | Nick khác của mình đã chạm đúng thread đó |
| 9 | Chính sách link | Sub cấm link mà bài có link |
| 10 | Kết quả dò gần nhất | Lần dò cuối nói nick bị ẩn hoặc dính checkpoint |

**Bốn luật 4, 5, 6, 8 không áp cho Fanpage.** Fanpage là kênh của chính mình — đăng 5 bài một ngày
hay đăng toàn nội dung bán hàng đều bình thường. Bốn luật đó chỉ áp cho **cộng đồng**: Reddit và
Facebook Group, nơi mình là khách trong nhà người khác.

### Bị chặn thì làm gì

Chín luật cho **ghi đè**, nhưng bắt buộc nhập lý do và luôn để lại dấu vết ai đã ghi đè.

**Luật 8 — đụng độ thread — KHÔNG cho ghi đè, không có ngoại lệ.** Hai nick cùng chủ nhảy vào một
thread là tín hiệu phối hợp rõ nhất mà nền tảng bắt được, rõ hơn cả IP trùng. Gặp đèn đỏ luật 8 thì
đổi thread khác, đừng đi tìm cách lách.

> Ghi đè không phải "tắt cảnh báo". Nó là bạn ký tên rằng bạn biết mình đang làm gì. Ghi đè luật 5
> để đăng hai bài liền một sub trong hai tiếng thì người chịu hậu quả là chính nick đó, ba tuần sau.

---

## 4. Nhóm Fanpage — đăng bằng một nút

Job có đích là Fanpage sẽ có nút **"Đăng lên Page"** ngay trong hàng đợi. Bấm là bài lên thật,
link tự ghi lại, không phải copy gì cả.

Một việc duy nhất phải làm đều: vào `/facebook` bấm **"Kiểm tra token tất cả Page"** theo thói
quen, đừng đợi tới lúc cần đăng gấp.

> **Token chết không báo trước.** Nick admin Page đổi mật khẩu, gỡ app, hoặc bị Meta khóa là kết
> nối thành rác ngay lập tức — và điều đó chỉ lộ ra ở lần bấm đăng tiếp theo. Kiểm mỗi tuần một
> lượt thì phát hiện lúc rảnh; không kiểm thì phát hiện lúc đang gấp.

**Bài Facebook Group phải đăng tay** như Reddit — Meta gỡ quyền tự đăng group tháng 04/2024, không
công cụ nào trên thị trường làm được nữa. Job group vẫn được chấm 9 trong 10 luật và vẫn hiện ở
thẻ "Đăng tay". Dòng job có nút **"Copy nội dung"** (group chỉ có một ô đăng, khác Reddit).

---

## 5. Nhóm Reddit — mở profile, đăng tay, rồi bấm "Đã đăng"

### Trước khi bắt đầu: cầu nối phải đang chạy

**Cầu nối** là chương trình nhỏ chạy nền trên máy bạn. Nó là chỗ **duy nhất trong cả hệ thống** mở
được mật khẩu nick — máy chủ không mở được, kể cả ADMIN ngồi trên máy chủ cũng không.

Ba việc bắt buộc phải có cầu nối đang chạy:

1. Lấy mật khẩu / mã OTP của nick
2. Mở profile antidetect
3. Tạo hoặc sửa nick **có nhập bí mật mới**

Mọi việc khác vẫn chạy bình thường khi cầu nối tắt — kể cả sửa karma, trạng thái, proxy của nick.

> Máy của bạn phải nằm trong sổ trước khi dùng được, nhưng **bạn tự ghi được máy mình đang ngồi**
> ở `/setup` — không phải chờ ADMIN. Chưa ghi thì nút bấm sẽ nói thẳng phải làm gì. Tải cầu nối ở
> `/setup` sau khi đăng nhập — cùng trang bạn sẽ ghi máy vào sổ ở bước sau.
>
> Nếu bạn có **hai máy** trong sổ, công cụ sẽ hỏi bạn đang ngồi máy nào trước khi bấm. Chọn đúng —
> chọn sai là phát ra một tấm vé chắc chắn hỏng, phải làm lại.

### Cài cầu nối — ba bước

Cả ba bước ở **cùng một trang**: `/setup`.

1. Mở **`/setup`**, tải gói ở phần đầu trang.
2. Giải nén cả ba file vào một thư mục, bấm đúp **`setup.bat`**.
3. Quay lại **`/setup`** và **ở lại đó**. Thẻ hướng dẫn tự tìm cầu nối, ghi máy vào sổ, rồi tự lấy
   **khóa vùng operator** về khi ADMIN bấm cấp. Thẻ chuyển xanh là xong.

> **Ở lại trang `/setup` cho tới khi thẻ xanh.** Việc lấy khóa chỉ chạy khi trang đó đang mở — đi
> sang trang khác thì hộp khóa cứ nằm trên máy chủ đợi. Ngày 18/08/2026 chuyện này làm một chiếc
> máy đợi vô ích, và một chiếc khác đợi **mười ngày** mà không ai nhận ra.

> **Không phải `/relay-devices`.** Trang đó giờ chỉ còn là sổ tra cứu và các việc của ADMIN
> (duyệt, thu hồi, đăng ký hộ một máy bạn không ngồi được).

**Bạn không phải gõ tay chuỗi nào.** Khóa đi xuống trong một cái hộp mà cầu nối của ADMIN bọc riêng
cho đúng máy bạn; máy chủ chỉ giữ hộ và không mở được. Đường chép tay — dán khóa ở
`http://127.0.0.1:47821` — chỉ còn là **dự phòng** cho lúc đường trên không chạy, và khi dùng nó thì
xin ADMIN qua trình quản lý mật khẩu dùng chung, đừng qua chat.

> Bước 2 **ai cũng bấm được** — máy bạn đăng ký sẽ thuộc về chính bạn. Cài hộ người khác thì
> vẫn phải là ADMIN, và thu hồi máy cũng vậy.

> **Đang chạy bản cũ?** Tải lại ở `/setup` rồi chạy `setup.bat` lần nữa. Nó giữ nguyên
> cấu hình cũ — không phải đăng ký lại máy, không phải xin lại khóa.

### Bốn bước đăng một bài

**Bước 1 — Bấm "Mở profile"** ngay trên dòng job ở thẻ "Đăng tay". Nó tự đẩy proxy vào profile rồi
mở MultiZen. Không phải sang trang nick tìm lại.

**Bước 2 — Kiểm IP.** Vào `ipinfo.io` trong chính cửa sổ vừa mở, xác nhận IP khớp proxy của nick.
**Đây là bước không được bỏ**, lý do ở mục 6.

**Bước 3 — Đăng.** Dòng job có sẵn hai nút **"Copy tiêu đề"** và **"Copy thân bài"** (form Reddit
có hai ô rời). Thân bài đã kèm link ở cuối, dán vào là đủ — không bị lặp tiêu đề.

**Bước 4 — Quay lại công cụ và ghi nhận.** Hai cách:

| Cách | Khi nào dùng |
|---|---|
| Bấm **"Quét & gán link"** | Nhanh hơn. Bộ dò mở trang profile công khai (~30-60 giây), tự tìm bài vừa lên và tự đánh dấu kèm link |
| Bấm **"Đã đăng"** rồi dán link | Khi "Quét & gán link" không tìm ra, hoặc bài đăng đã lâu hơn 7 ngày |

"Quét & gán link" chỉ tự ghi khi nó chắc chắn — phải khớp cả sub, cả khoảng thời gian, cả tiêu đề.
Hai bài cùng khớp một job thì nó **không đoán bừa**, chỉ báo để bạn ghi tay.

### Bấm nhầm thì sửa được

Job đã đăng có nút **"Trả về chờ đăng"**. Nó xóa link và xóa dấu vết đụng thread rồi chấm lại luật.

> ⚠️ **Chỉ dùng khi bài chưa thật sự lên.** Trả về một bài đã lên thật là tự mở đường cho chính
> mình đăng nó lần thứ hai — và hai bài giống nhau trên cùng một sub là thứ mod để ý trước tiên.

### Ghi tương tác

Comment, upvote, trả lời — vào `/queue` → **"Ghi tương tác thủ công"**. Đây cũng chính là nơi luật
đụng độ thread chạy ở mức **chặn thật** (lúc xếp lịch chưa có link thread nên nó chỉ cảnh báo được).

---

## 6. Ba việc hỏng trong im lặng

**Đọc kỹ mục này.** Ba việc dưới đây có chung một tính chất: làm sai thì **không có gì báo lỗi**,
màn hình vẫn xanh, mọi thứ trông vẫn chạy — và hậu quả chỉ lộ ra sau vài tuần, lúc đã muộn.

### 6.1. Không bấm "Đã đăng" → hai lớp bảo vệ cùng mù

Đây là lỗi phổ biến nhất và tốn nhất.

Bộ luật **chỉ biết những gì được ghi lại**. Đăng xong mà không quay lại bấm thì:

- **Luật đụng độ thread không có gì để so.** Đồng nghiệp bạn xếp bài vào đúng thread đó, đèn xanh,
  và hai nick cùng chủ đụng nhau — đúng thứ luật 8 sinh ra để chặn.
- **Bộ dò shadowban không có bài nào để đối chiếu.** Nick rơi vào ô **"Chưa đối chiếu được"** ở
  `/health` dù bạn vẫn đang đăng đều mỗi ngày. Nick có thể đã bị ẩn từ ba tuần trước mà không ai biết.

> Tự kiểm mỗi tuần: vào `/health`, đếm số nick nằm trong ô "Chưa đối chiếu được". Con số đó **phải
> là 0**. Khác 0 nghĩa là có người đăng mà không ghi — kể cả khi đó là chính bạn.

### 6.2. Tự nâng cấp MultiZen → IP nhà rò ra ngoài

Trên máy có một **luật firewall** chặn WebRTC. Không có nó, trang web đọc được IP thật của bạn
xuyên qua proxy — proxy vẫn chạy đúng, cửa sổ vẫn hiện đúng IP giả khi bạn vào `ipinfo.io`, nhưng
Reddit vẫn thấy IP nhà bạn qua một đường khác.

Luật đó gắn với **đúng file chương trình MultiZen hiện tại**. Nâng cấp là đổi file, và luật thành
vô nghĩa — trong khi giao diện Windows vẫn hiện luật đó `Enabled: True`.

> **Không tự bấm nâng cấp MultiZen.** Thấy nó mời cập nhật thì bấm để sau và nhắn ADMIN. Nâng cấp
> là việc có người đo lại sau đó, không phải việc bấm một nút.

Có một đường hỏng thứ hai, không liên quan tới nâng cấp: **profile firewall của mạng đang dùng bị
tắt**. Hay gặp nhất khi Windows hỏi *"Cho phép máy này được phát hiện trên mạng?"* và bạn bấm Có —
mạng chuyển từ Public sang Private, và nếu profile Private đang tắt firewall thì lớp chặn biến mất
không một lời báo. Đổi mạng (mang laptop sang chỗ khác, đổi wifi) là lúc nên nhắn ADMIN đo lại.

### 6.3. Không kiểm IP sau khi mở profile → proxy chết mà vẫn đăng

Proxy chết không làm profile báo lỗi. Nó mở ra bình thường, ăn cấu hình bình thường, và bạn đăng
bằng IP nhà mà không biết.

**Mở profile xong là vào `ipinfo.io`**, mỗi lần, kể cả khi hôm qua vừa kiểm. Mất 5 giây.

---

## 7. Đọc kết quả dò shadowban

Shadowban im lặng: **bài vẫn hiện với chính mình, người ngoài không thấy gì**. Không đo thì ba
tháng sau mới phát hiện cả cụm nick đã chết.

Mỗi sáng công cụ tự chạy một lượt: mở trang profile công khai của từng nick ở chế độ **chưa đăng
nhập**, qua một IP riêng, rồi đối chiếu số bài người ngoài thấy được với số bài bạn đã đánh dấu
"Đã đăng". Kết quả ở `/health` và ở thẻ "Sức khỏe đàn nick" trang chủ.

| Kết quả | Nghĩa là |
|---|---|
| **Khỏe** | Người ngoài thấy đủ bài |
| **Bị ẩn** | Profile trả 404, hoặc thấy 0 trên N bài đã đăng |
| **Dính checkpoint** | Reddit đang chặn bằng một màn hình xác minh |
| **Không dò được** | Không kết luận được — thường là proxy quan sát viên chết |
| **Chưa đối chiếu được** | Không có bài nào đã đánh dấu để so. Xem mục 6.1 |

Nick bị kết luận **Bị ẩn** hoặc **Dính checkpoint** sẽ tự chuyển trạng thái và bộ luật chặn mọi job
của nó ngay.

Chiều ngược lại **không tự động**: một lần dò khỏe không tự gỡ cách ly, vì nó chỉ chứng minh lần dò
đó không thấy vấn đề. Gỡ là quyết định của người, làm ở trang chi tiết nick.

> **Không có tin xấu không phải là tin tốt — đó là không có tin.** Bốn ô "Không dò được" và "Chưa
> đối chiếu được" trông hiền lành hơn ô đỏ, nhưng chúng nghĩa là bạn đang bay mù. Ô đỏ ít ra còn nói
> cho bạn biết một chuyện.

---

## 8. Ai thấy gì, ai làm được gì

Có hai vai trò:

| Vai trò | Làm được gì |
|---|---|
| **ADMIN** | Mọi thứ, kể cả phân công nick và lấy bí mật của mọi nick |
| **OPERATOR** | Mọi thứ, **trừ** ba việc dưới đây |

Ba việc OPERATOR không làm được:

1. Lấy mật khẩu / OTP của nick **không phải mình phụ trách**
2. Phân công chủ sở hữu nick
3. **Đăng ký máy cầu nối hộ người khác**, và **thu hồi** máy của bất kỳ ai

Đăng ký **máy của chính mình** thì ai cũng làm được — người ngồi ở máy chính là người cài nó.
Chủ máy do công cụ ép bằng tài khoản đang đăng nhập, không chọn được người khác.

**Tầm nhìn thì không chia — ai cũng thấy nick, job, tương tác và lịch sử của người khác.** Đây là
cố ý: luật đụng độ thread phải nêu đúng tên nick của đồng nghiệp thì bạn mới xử lý được. Thứ bị
chia là **bí mật của nick** và **quyền ghi kho proxy**.

Và chặn đó nằm ở tầng dữ liệu, không phải ẩn nút cho đẹp: máy chủ **từ chối phát vé** cho nick
không phải của bạn, kèm câu nói rõ nick đó do ai phụ trách. Không có mẹo nào lách được từ phía
trình duyệt.

Từ 07/08/2026 có thêm một vế nữa, và nó áp cho **cả nút mở profile** chứ không chỉ nút lấy bí
mật: mỗi nick được **ghim vào một chiếc máy**, và vé chỉ bay tới chiếc máy đó. Bấm trên nick nằm
ở máy người khác thì công cụ nói thẳng *"nick này ở máy X của …"* — kể cả bạn là ADMIN, vì vé mã
hóa cho khóa của máy kia nên phát được cũng không mở nổi. Muốn đổi thì ADMIN gán lại cụm ở trang
chi tiết nick.

Kho proxy (`/proxies`) cũng về tay ADMIN: thêm, sửa, xóa và **đo tốc độ** đều chỉ ADMIN làm được.
Mật khẩu proxy không có bản thứ hai ở đâu cả nên xóa nhầm là mất tiền thật, còn nút đo tốc độ thì
đốt 1 MB quota trả tiền mỗi lượt. Nút **Kiểm** vẫn để mở cho mọi người — nó tốn vài KB và là thứ
cần bấm đúng lúc đang gấp.

> Công cụ giới hạn **10 lượt lấy bí mật một phút**. Bạn sẽ không bao giờ chạm ngưỡng đó khi làm
> việc bình thường. Nó tồn tại để nếu tab của bạn bị chiếm, kẻ chiếm không rút sạch kho trong vài
> giây được.

---

## 9. Khi nào nhắn ADMIN

Đừng tự xử bốn nhóm việc này:

| Gặp gì | Vì sao đừng tự làm |
|---|---|
| Khay cảnh báo hiện dòng vàng/đỏ | Nó thường là cấu hình máy chủ, không phải thứ sửa từ giao diện |
| MultiZen mời nâng cấp | Xem mục 6.2 |
| Đổi wifi / mang máy sang chỗ khác | Lớp chặn WebRTC cần đo lại |
| Đăng nhập Google được mà công cụ từ chối | Email chưa vào danh sách cho phép |
| Nick báo **Không dò được** nhiều ngày liền | Proxy quan sát viên có thể đã chết |
| Mất laptop, hoặc nghi máy bị người khác dùng | **Nhắn ngay, đừng đợi tới sáng hôm sau** |

Về ca cuối: mất máy thì ADMIN thu hồi máy đó khỏi sổ trong vài giây, nhưng thu hồi **không** với
tới những gì máy đó đã lấy về trước đó. Máy mất thật thì phải xoay khóa cho cả team — càng chậm
báo càng nhiều thứ phải làm lại.

---

## 10. Khi có người mới vào team

Đối xứng với mục 11. Ba việc, theo thứ tự — hai việc đầu của ADMIN, việc thứ ba người mới tự làm.

1. **ADMIN thêm email của họ vào danh sách cho phép** (`ALLOWED_EMAILS`) rồi khởi động lại máy chủ.
   Chưa có bước này thì họ đăng nhập Google xong vẫn bị chặn ở mọi cú bấm — danh sách được kiểm ở
   từng lần bấm, không phải chỉ lúc đăng nhập. Muốn họ làm được việc của ADMIN thì thêm cả vào
   `ADMIN_EMAILS`, và email đó **vẫn phải nằm trong** `ALLOWED_EMAILS`.
2. **ADMIN đưa khóa vùng operator xuống máy họ.** Hai đường, chọn một:
   - **Gửi qua sổ** — trên `/relay-devices`, ADMIN bấm nút phát khóa cho máy đó. Cầu nối của ADMIN
     bọc khóa bằng chính khóa công khai của máy nhận, máy chủ chỉ giữ hộ cái hộp đã bọc và không
     mở được. Đường này **khóa thô không đi qua tay ai**.
   - **Chép tay** — đưa khóa qua trình quản lý mật khẩu dùng chung, họ tự dán ở
     `http://127.0.0.1:47821`. Dùng khi đường trên không chạy. **Không bao giờ qua chat**: khóa dán
     trong chat là khóa nằm trong lịch sử chat của một công ty khác, vĩnh viễn.
3. **Người mới tự cài lấy** theo mục 5: mở `/setup`, tải gói ở ngay đầu trang, chạy `setup.bat`, rồi quay lại chính trang đó
   để ghi máy mình vào sổ. Bước này **không cần ADMIN** — máy họ ghi sẽ thuộc về chính họ.

> Việc 1 phải xong trước việc 3. Ghi máy vào sổ cho một email chưa được phép đăng nhập thì công cụ
> từ chối thẳng, kèm câu giải thích đúng lý do — nhưng đó là một vòng đi lại không cần thiết.

---

## 11. Khi có người rời team

Ba việc, phải làm **cả ba**, theo thứ tự:

1. **Xóa email khỏi danh sách cho phép** rồi khởi động lại máy chủ. Có hiệu lực ngay, kể cả người
   đó đang mở sẵn tab — danh sách được kiểm ở mọi lần bấm, không phải chỉ lúc đăng nhập.
2. **Thu hồi máy của họ** trong sổ ở `/relay-devices`.
3. **Xoay khóa vùng operator trên mọi máy còn lại.**

Bước 3 là bước hay bị bỏ, và là bước quan trọng nhất. Khóa mở bí mật nick nằm **trên máy của từng
người**, không nằm trên máy chủ — đó là cả điểm của thiết kế này. Nghĩa là người đã rời team vẫn
giữ một bản khóa trên máy cũ của họ. Xóa tài khoản chỉ chặn đường vào web; nó không lấy lại được
thứ đã nằm trên máy người ta.

Nick họ từng phụ trách **không bị xóa theo**, chỉ mất chủ — ADMIN phân công lại ở trang nick.

> Khóa phát cho người mới qua **trình quản lý mật khẩu dùng chung**, không qua chat. Khóa dán trong
> chat là khóa nằm trong lịch sử chat của một công ty khác, vĩnh viễn.

---

## Profile không mở được — đọc mã thoát trước khi đoán

Trình duyệt từ chối khởi động thì nó **có nói lý do**, bằng một mã số. Tra bảng này trước, đừng
đoán — ba trong bốn mã dưới đây từng làm mất nửa buổi vì lời khuyên trong thông báo chỉ sang
hướng khác.

| Mã | Nghĩa thật | Làm gì |
|---|---|---|
| **76** | Hết số phiên của gói. Gói free chỉ **1 trình duyệt cùng lúc** | Đóng profile đang mở. Nếu chắc chắn không mở cái nào: bạn vừa đóng cứng (Task Manager / tắt máy) nên phiên còn treo trên server — **chờ 10–15 phút** (đo được ngày 19/08), đừng cài lại gì cả |
| **77** | Khóa license thiếu, sai, hoặc hết hạn | Kiểm lại khóa ở Cài đặt |
| **78** | **Không tra được tên miền của máy chủ license** | Gần như luôn là tường lửa chặn UDP 53, không phải mạng hỏng và không phải khóa sai. Xem dưới |
| **79** | Không ghi được trạng thái license dưới máy | Kiểm quyền thư mục |

**Riêng mã 78.** Bản cài trước **0.3.4** đặt luật tường lửa chặn **mọi cổng UDP** của trình duyệt
để chống rò WebRTC — chặn luôn DNS. Duyệt web vẫn được vì Chrome quay sang bộ phân giải của
Windows, nhưng đường kiểm license không có đường lui nên chết, và báo "không tới được máy chủ".
Người đọc sẽ đi kiểm mạng và kiểm khóa — cả hai đều đang đúng, nên bế tắc.

**Cách xử: cài bản 0.3.4 trở lên.** Luật mới chỉ chừa UDP 53 và 443, phần còn lại vẫn chặn.

Đóng profile **bằng nút trong ứng dụng**, đừng tắt cứng — tắt cứng để lại phiên treo và mã 76.
Gói free chỉ **1 phiên**, nên một lần tắt cứng là khoá cả người khác lẫn chính mình trong 10–15 phút.

---

## Bảng tra nhanh

| Việc | Ở đâu |
|---|---|
| Xem việc hôm nay | Trang chủ, thẻ "Đăng tay" |
| Viết / sửa content | `/content` |
| Xếp lịch, ghi tương tác, bấm "Đã đăng" | `/queue` |
| Nick, karma, trạng thái, gỡ cách ly | `/accounts` |
| Kết quả dò shadowban, biểu đồ karma | `/health` |
| Kết nối Fanpage, kiểm token | `/facebook` |
| Tải cầu nối, ghi máy vào sổ | `/setup` |
| Sổ máy đã đăng ký, phát khóa, thu hồi (ADMIN) | `/relay-devices` |

---

## Còn thiếu trong tài liệu này

Ghi ra để không ai tưởng đã đủ:

- [ ] **Ảnh chụp màn hình hộp xin quyền mạng nội bộ.** Dùng làm *đường cấp lại* khi ai đó lỡ bấm
      Từ chối — **không** phải để cấp lần đầu. Lần đầu là người cài bấm hộ ngay trong buổi cài máy,
      đừng để người dùng gặp hộp này lần đầu khi ngồi một mình.
- [ ] Ảnh chụp thẻ "Đăng tay" và checklist luật, để đối chiếu khi đọc mục 2 và 3.
- [ ] Mục TikTok — viết khi đợt TikTok làm xong.
