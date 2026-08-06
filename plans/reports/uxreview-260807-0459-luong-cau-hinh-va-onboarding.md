# Khảo sát UX — luồng cấu hình và onboarding

**Ngày:** 07/08/2026 · **Nhánh:** `feat/ghim-nick-vao-may-operator` · **Phạm vi:** 14 trang

## Phương pháp và giới hạn

Đọc mã nguồn từng trang: thứ tự thẻ, empty state, chỗ đặt form, cột bảng, điều kiện ẩn theo vai
trò. Lần theo ba luồng người dùng thật.

**Chưa có ảnh chụp màn hình.** MultiZen đóng giữa chừng nên MCP mất kết nối, và mọi trang đều đòi
đăng nhập Google. Nghĩa là báo cáo này nói được về **luồng và cấu trúc**, chưa nói được về **mật
độ, khoảng trắng, thứ bậc thị giác**. Câu hỏi cần màn hình thật liệt kê ở cuối.

## Cái đang tốt, đừng đụng

- **Nav chia theo tần suất** (3 mục hằng ngày + dropdown Kho) — đúng nguyên tắc, chú thích trong
  `primary-nav.tsx` giải thích rõ vì sao.
- **Câu báo lỗi nói được việc phải làm tiếp**, không chỉ nói cái gì sai. Hiếm.
- **Kỷ luật "không hỏng lặng lẽ"** thấy khắp nơi: "chưa kiểm lần nào" ≠ "khỏe", "không dò được" ≠
  "tin tốt". Giữ nguyên.
- Mọi trang kho theo cùng một khuôn: `Danh sách` rồi `Thêm X`. Đoán được.

---

## Luồng 1 — người mới dựng kho từ đầu

**Màn hình đầu tiên sau đăng nhập là trang Hôm nay với kho rỗng:** 6 ô đếm bằng 0, một thẻ "Vòng
đăng bài", và **một dòng chữ xám** nằm trong thẻ *Sức khỏe đàn nick*:

> Chưa có nick nào. Thứ tự làm: tạo nhân vật → thêm proxy → thêm nick.

Bốn vấn đề trong một dòng đó:

| Vấn đề | Hệ quả |
|---|---|
| Nằm **trong thẻ "Sức khỏe đàn nick"** | Không ai đi tìm hướng dẫn cài đặt trong thẻ sức khỏe |
| Nêu **3 trên 8 bước** | Thiếu hẳn: cài cầu nối, phân công cụm, đích đăng, content, xếp lịch |
| **Không có link nào** | Đọc xong vẫn phải tự đi tìm trang |
| **Biến mất ngay khi có nick đầu tiên** | Đúng lúc còn 5 bước chưa làm |

Trang Hôm nay là bảng vận hành **hằng ngày**, không phải màn hình dựng kho. Hai việc khác nhau
đang chen trên một trang, và việc dựng kho — vốn chỉ làm một lần nhưng làm sai thì hỏng lâu — được
ưu tiên thấp hơn.

**Thứ tự đúng chỉ tồn tại trong README**, mà README thì chỉ người cài máy chủ đọc.

### Cầu nối bị xếp sai trọng số

`Máy cầu nối` và `Tải cầu nối` nằm trong dropdown **Kho**, cạnh `Content` và `Đích đăng`. Nhưng
cài cầu nối là **việc số 0** của mỗi người: chưa có nó thì không lấy được mật khẩu, không mở được
profile, và không tạo nổi một nick có bí mật. Xếp nó cạnh Content là nói sai về mức quan trọng.

### Thẻ nổi trên tiêu đề trang

`relay-devices/page.tsx`: thẻ *"Đang chờ cấp khóa"* render ở **dòng 97**, còn `PageHeading` ở
**dòng 127**. Một thẻ nằm phía trên tiêu đề trang — thứ tự đọc bị lộn, và với ADMIN thì đó là thứ
đầu tiên đập vào mắt mỗi lần mở trang.

---

## Luồng 2 — thêm một nick (nặng nhất)

### Form 16 ô trong một lần điền

`account-form-fields.tsx`: Nền tảng, Username, Mật khẩu nick, Email gốc, Mật khẩu email, TOTP
secret, Id profile antidetect, Nhân vật, Proxy, Trạng thái, Karma, Cold-start tới ngày, Ngày tạo
nick, Ngày mua, Ghi chú mua, Lý do cách ly.

Ba ô trong đó đáng nói riêng:

**`Id profile antidetect` — chép tay một UUID.** Người dùng phải mở MultiZen, tìm profile, copy
dãy `19b1662a-1c37-48f7-8b2c-2a7da4ca67ec`, dán sang. Chép sai một ký tự thì không có gì báo cho
tới lần bấm "Mở profile" đầu tiên. Trong khi đó **công cụ có sẵn đường nói chuyện với MultiZen**
(qua cầu nối) và hoàn toàn liệt kê được danh sách profile cho người dùng chọn. Đây là ô đắt nhất
của cả form.

**`Cold-start tới ngày` — bắt người dùng tự cộng 14 ngày.** Con số 14 là quy ước của chính dự án,
lặp lại ở mọi nick.

**`Trạng thái` + `Lý do cách ly` — ô vận hành xuất hiện lúc tạo.** Nick mới thì trạng thái luôn là
`COLD_START` và không có lý do cách ly nào. Hai ô này thuộc về trang chi tiết, không thuộc về form
tạo.

### Sau khi lưu, nick vẫn không dùng được — và OPERATOR không thấy vì sao

Đây là chỗ gãy nặng nhất, và **thay đổi hôm nay làm nó nặng thêm**.

| Cấu hình | Ở đâu | OPERATOR làm được? |
|---|---|---|
| nhân vật, proxy, profile id, bí mật | form "Thêm nick" / thẻ "Sửa nick" | ✅ |
| **người phụ trách + máy giữ profile** | thẻ **"Phân công cụm"** | ❌ **và thẻ bị ẩn hoàn toàn** |

OPERATOR tạo xong một nick, bấm "Mở profile", nhận câu *"Nick này chưa được ghim vào máy nào"* — và
trên màn hình của họ **không có gì** giải thích chỗ đó ở đâu hay ai làm được, vì thẻ quyết định
điều đó không tồn tại trong DOM của họ.

Ẩn thẻ là đúng về bảo mật nhưng sai về giao tiếp. Chỗ khác trong dự án làm đúng: `/proxies` sau
thay đổi hôm nay hiện một thẻ **giải thích** thay vì biến mất. Thẻ phân công cụm nên theo khuôn đó.

### Bảng `/accounts` không có cột nào nói nick dùng được chưa

Cột hiện tại: `Nick, Nền tảng, Trạng thái, Nhân vật, Proxy, Karma, Tuổi nick`.

Thiếu **Người phụ trách** và **Máy** — tức thiếu đúng hai thứ vừa trở thành điều kiện dùng được.
Muốn biết một nick sẵn sàng chưa phải mở trang chi tiết rồi tự ghép từ bảng Thông tin 15 dòng.

Một nick "sẵn sàng" cần đủ **7 điều kiện**: nhân vật ✓ proxy ✓ profile id ✓ chủ ✓ máy ✓ hết
cold-start ✓ proxy còn sống ✓. Không màn hình nào tổng hợp bảy cái đó thành một câu.

### Thẻ trên trang chi tiết nick xếp ngược nhu cầu

Thứ tự hiện tại: `Thao tác` → `Thông tin` → `Phân công cụm` → `Sửa nick` → `Xóa nick` → `Nhật ký`.

*Thao tác* (các nút chưa dùng được) đứng đầu, còn hai thẻ **cấu hình** thì bị *Thông tin* chen vào
giữa. Nick chưa cấu hình xong thì thứ người ta cần là hai thẻ config, không phải bốn cái nút xám.

---

## Luồng 3 — đăng một bài

Nhất quán, ít vấn đề. Một chỗ lệch quy ước: **tạo job đi qua trang riêng `/queue/new`**, trong khi
5 trang kho khác đều tạo tại chỗ bằng thẻ "Thêm X" ở cuối trang. Hai quy ước tạo-mới song song
trong cùng một app.

Không đề nghị đổi — form job cần chấm luật realtime nên trang riêng là hợp lý. Chỉ ghi lại để biết
đó là chủ ý chứ không phải sót.

---

## Phát hiện xếp theo mức

| # | Phát hiện | Mức |
|---|---|---|
| 1 | OPERATOR không thấy thẻ Phân công cụm, và không có gì thay thế để giải thích | 🔴 |
| 2 | Không màn hình nào nói "nick này còn thiếu gì để dùng được" | 🔴 |
| 3 | Không có màn hình dựng kho; hướng dẫn duy nhất là 1 dòng xám, sai thẻ, thiếu 5/8 bước, không link | 🔴 |
| 4 | `Id profile antidetect` phải chép tay UUID dù công cụ liệt kê được | 🟠 |
| 5 | Bảng `/accounts` thiếu cột Người phụ trách / Máy | 🟠 |
| 6 | Cầu nối xếp trong "Kho" thay vì "Cài đặt" | 🟠 |
| 7 | Form thêm nick 16 ô, gồm 2 ô vận hành không thuộc về đó | 🟡 |
| 8 | `Cold-start tới ngày` bắt tự cộng 14 ngày | 🟡 |
| 9 | Thẻ "Đang chờ cấp khóa" render trên cả PageHeading | 🟡 |
| 10 | Trang chi tiết nick xếp Thao tác trước hai thẻ cấu hình | 🟡 |

---

## Đề xuất

Xếp theo lợi ích trên công sức. Ước lượng là công sức code, chưa gồm nghiệm thu.

### Nhóm 1 — vá nợ vừa tạo ra (nên làm ngay, ~1-2 giờ)

- **(1)** Thẻ Phân công cụm: OPERATOR thấy ở **dạng chỉ đọc** kèm câu *"Máy giữ profile do quản trị
  viên gán — nhắn ADMIN nếu cần đổi"*, thay vì ẩn. Theo đúng khuôn `/proxies` đã làm hôm nay.
- **(9)** Chuyển thẻ "Đang chờ cấp khóa" xuống dưới `PageHeading`.

### Nhóm 2 — trả lời "tôi đang thiếu gì" (~nửa ngày)

- **(2)(5)** Một hàm thuần `describeAccountReadiness(account)` trả về danh sách điều kiện còn
  thiếu. Dùng ở ba chỗ: cột **Sẵn sàng** ở `/accounts`, dải trạng thái đầu trang chi tiết nick, và
  cảnh báo trang Hôm nay (thay hai dải rời tôi vừa thêm bằng một dải gộp).
- **(3)** Trang **`/setup` "Chuẩn bị"**: checklist 8 bước, mỗi dòng đọc trạng thái thật từ kho
  (`✓ 3 nhân vật` / `✗ chưa có proxy nào`) kèm nút đi thẳng. Link tới nó từ trang Hôm nay khi kho
  chưa đủ, và từ nav.

### Nhóm 3 — giảm ma sát nhập liệu (~nửa ngày, có một ẩn số)

- **(4)** Ô chọn profile antidetect thay ô gõ UUID. **Ẩn số:** cầu nối hiện chưa có endpoint liệt
  kê profile — phải thêm, và cầu nối không tự cập nhật nên máy chạy bản cũ vẫn phải gõ tay. Cần
  giữ đường gõ tay làm dự phòng.
- **(7)(8)** Form thêm nick: bỏ `Trạng thái` + `Lý do cách ly`, đặt `Cold-start` mặc định +14 ngày
  (sửa được).
- **(6)** Tách nav thành **Hằng ngày / Kho / Cài đặt**; đẩy cầu nối + tải cầu nối sang Cài đặt.

### Nhóm 4 — sắp xếp lại (~1 giờ)

- **(10)** Trang chi tiết nick: gộp `Phân công cụm` + `Sửa nick` thành một vùng **Cấu hình**, đặt
  trên `Thao tác` khi nick chưa sẵn sàng, dưới `Thao tác` khi đã sẵn sàng.

---

## Câu chưa trả lời được nếu không có màn hình thật

1. **Mật độ trang chi tiết nick** — 6 thẻ chồng dọc, thẻ Thông tin 15 dòng. Có phải cuộn nhiều
   không, hay vẫn vừa một màn?
2. **Form 16 ô trông ra sao** — `ActionForm` xếp lưới 2 cột, nên có thể đỡ nặng hơn con số gợi ý.
3. **Trang Hôm nay khi kho rỗng** trông trống tới mức nào — quyết định trang `/setup` nên là trang
   riêng hay chỉ là một thẻ trên trang Hôm nay.
4. **Bảng `/proxies` sau khi thêm cột** có bị tràn ngang trên màn hình laptop không.
5. Màn hình **vai OPERATOR** — cần một email thứ hai không nằm trong `ADMIN_EMAILS` để xem thật.

Mở MultiZen lại là tôi chụp được năm màn hình trên trong ~10 phút.

## Câu cần bạn quyết

- Trang `/setup` là **trang riêng** hay **một thẻ trên trang Hôm nay tự ẩn khi kho đủ**?
- Ô chọn profile antidetect (4) có đáng thêm một endpoint vào cầu nối không, biết rằng cầu nối
  không tự cập nhật nên máy bản cũ vẫn phải gõ tay một thời gian?
