# Spike Phase 00 — trình duyệt gọi xuống cầu nối

**Ngày đo:** 04/08/2026 | **Máy đo:** Windows 11 Home 10.0.26200, Node v24.14.1
**Kế hoạch:** [phase-00](../260804-1752-web-chung-cho-team-phan-tan/phase-00-spike-trinh-duyet-goi-cau-noi.md)

## Kết luận một dòng

**Cả hai câu đều CÓ.** Nhưng câu 1 kèm một điều kiện chưa có trong kế hoạch: lời gọi ngầm
**chỉ chạy khi bắn từ trong một cú bấm thật của người**, và lần đầu mỗi máy phải bấm
"Cho phép" một lần. Bắn tự động lúc trang nạp thì **treo im lặng** — không lỗi, không hộp
xin quyền, không gì cả.

---

## Câu 1 — trang HTTPS gọi xuống `http://127.0.0.1:<cổng>`: **CÓ, có điều kiện**

Đo trên `https://example.com` gọi xuống máy chủ thử nghe `127.0.0.1:43117`, máy chủ trả
đủ CORS khai đúng một nguồn (không dùng `*`) + cả hai đời header mạng nội bộ.

| # | Phép đo | Trình duyệt | Kết quả |
|---|---|---|---|
| 1 | fetch bắn tự động lúc trang nạp | Chrome 150.0.7871.188 | **TREO vô hạn.** Máy chủ **không nhận được request nào** |
| 2 | fetch bắn tự động lúc trang nạp | Edge 151.0.4129.59 | y hệt Chrome |
| 3 | fetch bắn **từ trong cú bấm của người**, rồi bấm "Cho phép" | Chrome 150 | **HTTP 200.** Máy chủ nhận đúng request |
| 4 | fetch tự động, chạy với `--disable-features=LocalNetworkAccessChecks` | Chrome 150 | **HTTP 200** cả lượt GET thường lẫn lượt có preflight |
| 5 | `navigator.permissions.query({name:"local-network-access"})` | Chrome 150 + Edge 151 | `"prompt"` |
| 6 | fetch tự động | Chromium 148 (Electron, trình duyệt trong app Claude) | 200 — bản Electron chưa áp luật này |

### Thứ chặn KHÔNG phải CORS

Phép đo 4 là bằng chứng chốt: tắt đúng cờ `LocalNetworkAccessChecks` là mọi thứ chạy ngay,
với **nguyên bộ header CORS đó, không sửa một dòng nào**. Máy chủ nhận đủ ba lượt:

```
GET     /ping?simple=1     origin: https://example.com
OPTIONS /ping?preflight=1  origin: https://example.com
                           access-control-request-method: GET
                           access-control-request-headers: x-relay-probe
GET     /ping?preflight=1  origin: https://example.com
```

→ **CORS và preflight không phải rào cản.** Rào cản là **Local Network Access** (luật mới
thay cho Private Network Access), bật sẵn ở Chrome 150 và Edge 151.

Đáng chú ý: trình duyệt **chưa bao giờ gửi** `Access-Control-Request-Private-Network` hay
`Access-Control-Request-Local-Network-Access`. Luật đời mới không hỏi máy chủ nữa — nó hỏi
**người dùng**. Nên máy chủ trả lời khéo tới đâu cũng không tự mở được đường.

### Nguyên văn lỗi: **không có lỗi nào**

Đây là phần nguy hiểm nhất và cần chép nguyên vào thiết kế:

- fetch **không ném lỗi**, **không trả về**, **không hết giờ**. Nó treo.
- console **trắng trơn** — không một dòng cảnh báo nào (`Log.entryAdded` = rỗng).
- máy chủ cục bộ **không thấy gì** — request không hề rời trình duyệt.
- Chuỗi `TimeoutError: signal timed out` trong dữ liệu đo là **hạn giờ của chính phép đo**
  (`AbortSignal.timeout(10000)`), không phải trình duyệt báo về.

Không tự đặt hạn giờ thì giao diện đứng im vĩnh viễn, và không có gì để log.

### Vì sao cú bấm quyết định

Chrome chỉ **hiện hộp xin quyền khi trang đang có "kích hoạt người dùng"**. Bắn lúc trang
nạp thì không có kích hoạt → Chrome nuốt luôn cả hộp xin quyền lẫn request. Đã kiểm chéo:
người vận hành xác nhận **"ko thấy hộp xin quyền"** ở hai lượt bắn tự động, rồi thấy hộp và
bấm Cho phép ở lượt có cú bấm — đúng lượt đó ra HTTP 200 và quyền chuyển `prompt` → `granted`.

Cấp quyền bằng lệnh gỡ lỗi (`Browser.setPermission`) **không có tác dụng**: Permissions API
báo `granted` nhưng request vẫn treo, và quyền không lưu lại sang lượt sau. Chỉ cú bấm thật
mới ăn.

### Quyền cấp một lần là xong — đo bổ sung cùng ngày

Hồ sơ Chrome giữ lại trên đĩa, hai lượt liên tiếp:

| Lượt | Cách bắn | Quyền lúc vào | Kết quả |
|---|---|---|---|
| 1 — người bấm nút rồi bấm Cho phép | trong cú bấm | `prompt` | **HTTP 200**, quyền thành `granted` |
| 2 — **mở lại Chrome**, bắn tự động lúc trang nạp, không cú bấm nào | tự động | **`granted`** | **HTTP 200** |

→ **Quyền giữ qua lần khởi động sau, và cấp rồi thì hết cần cú bấm.** Chỉ lời gọi **đầu tiên
trên mỗi máy** mới cần người bấm. (Chrome được đóng bằng `Browser.close` để kịp ghi
Preferences xuống đĩa — giết ngang thì đo nhầm thành "không giữ".)

### Ba ràng buộc cho Phase 02/03/04

1. **Lời gọi ngầm ĐẦU TIÊN trên mỗi máy phải nằm trong trình xử lý sự kiện bấm** — và phải
   gọi **thẳng trong** handler, không đẩy qua một vòng `await` lấy dữ liệu khác trước
   (đợi xong là mất kích hoạt người dùng). Nút "Mở profile" vốn đã là một cú bấm nên hợp lệ.
   Cấp quyền xong thì ràng buộc này hết hiệu lực.
   **Đặt được policy ở mục dưới thì ràng buộc này biến mất ngay từ đầu.**
2. **Tự đặt hạn giờ cho mọi lời gọi** + thông báo dạy việc: *"Chrome đang hỏi bạn có cho
   trang này gọi vào máy không — bấm Cho phép ở hộp trên thanh địa chỉ."*
   **Ràng buộc này không bao giờ gỡ:** người dùng bấm Chặn, hoặc sau này xóa quyền, là quay
   lại cảnh treo im lặng.
3. **Ô "cầu nối đang sống" cập nhật ngầm được — nhưng chỉ sau khi máy đó đã cấp quyền.**
   Máy chưa cấp thì lời gọi nền treo im lặng và không hiện hộp nào. Nên trạng thái phải có
   ô thứ ba *"chưa cấp quyền"*, đừng gộp vào *"mất kết nối"* — đúng tinh thần *không có tin
   xấu không phải là tin tốt* của bộ dò shadowban.

### Có policy cấp sẵn quyền — bỏ được hộp hỏi

`LocalNetworkAccessAllowedForUrls`, có từ **Chrome 139**, và **Edge cũng có cùng tên policy**.
Origin nằm trong danh sách thì **không bị kiểm Local Network Access**, không hiện hộp nào.

| Trình duyệt | Khóa registry |
|---|---|
| Chrome | `HKLM\SOFTWARE\Policies\Google\Chrome\LocalNetworkAccessAllowedForUrls` |
| Edge | `HKLM\SOFTWARE\Policies\Microsoft\Edge\LocalNetworkAccessAllowedForUrls` |

Giá trị là danh sách `REG_SZ` đánh số `1`, `2`, … mỗi dòng một origin. Kiểm bằng `chrome://policy`.
Có `LocalNetworkAccessBlockedForUrls` đè lên thì Blocked thắng.

Cần **quyền admin** trên máy người dùng. GĐ6 vốn đã cài hộ qua remote desktop nên thêm bước này
gần như miễn phí — và nó gỡ luôn ràng buộc 1.

> ⚠️ Cùng loại rủi ro với luật firewall WebRTC: đây là thứ đặt một lần rồi **lặng lẽ hết tác
> dụng** nếu ai đó dọn policy hay cài lại máy. Ghi vào tài liệu vận hành GĐ6 kèm cách kiểm
> (`chrome://policy`), đừng đặt xong rồi quên.

---

## Câu 2 — TypeScript thành một file `.exe`, gọi được MultiZen: **CÓ**

Đo bằng **Node SEA** (bạn chọn phương án này, Bun không cài). Quyết định 6 chốt
"TypeScript → một file `.exe`", không chốt phải là Bun — nên kết luận vẫn dùng được.

Đường đi: `tsc` → JS CommonJS một file → `node --experimental-sea-config` → chép `node.exe`
→ `postject` nhét blob.

Kết quả chạy `.exe` với `PATH` đã cắt sạch (không tìm thấy `node`):

```
chạy trong .exe đã đóng gói: true      ← require("node:sea").isSea()
Node nhúng bên trong: v24.14.1
initialize: OK
tools/list: OK, 22 tool
tools/call list_profiles: OK           ← trả về danh sách profile thật
```

22 tool đúng bộ MultiZen công bố (`list_profiles`, `launch_profile`, `navigate`, `click`,
`type`, `extract`, `screenshot`, …). Không dừng ở mức bắt tay — đã gọi một tool thật và
nhận dữ liệu thật.

| Hạng mục | Số đo |
|---|---|
| Kích thước `.exe` | **87.3 MB** |
| Cảnh báo lúc đóng gói | `warning: The signature seems corrupted!` — bình thường, do chữ ký của `node.exe` gốc vỡ khi nhét blob vào |

87 MB là cái giá của Node SEA (gói nguyên runtime). Bun thường ra ~50-60 MB. Với việc
cài hộ qua remote desktop ở GĐ6 thì chênh lệch này không đáng đổi hướng, nhưng nếu sau
này thấy vướng thì đổi sang Bun được mà **không phải viết lại code** — cùng một file TS.

---

## Khuyến nghị: **giữ thiết kế hiện tại**, thêm ba ràng buộc

Không cần đổi sang đường tab nhỏ toàn bộ. Quyết định 3 giữ nguyên:
mở profile đi đường gọi ngầm, bí mật đi đường tab nhỏ.

Lý do:
- Đường gọi ngầm **chạy được thật**, chỉ cần một lần bấm Cho phép mỗi máy.
- Thao tác đi đường này (mở profile) **vốn đã bắt đầu bằng một cú bấm** — đúng điều kiện
  mà luật mới đòi. Không phải uốn thiết kế để chiều nó.
- Đường lùi vẫn còn nguyên: tab nhỏ do chính cầu nối phục vụ là **cùng nguồn với cầu nối**
  nên không dính luật này. Luật siết thêm thì chuyển thao tác sang tab nhỏ, mất mượt chứ
  không mất an toàn — đúng như GĐ0 đã lường.

Nhưng ba ràng buộc ở mục "Câu 1" là **bắt buộc**, không phải khuyến nghị. Bỏ qua ràng buộc 1
là cả tính năng treo im lặng trên máy người dùng mà không log lại được gì.

Thêm một việc cho GĐ6: tài liệu bàn giao phải có ảnh chụp hộp xin quyền và câu
*"lần đầu bấm Mở profile, Chrome sẽ hỏi — bấm Cho phép"*. Người low-tech gặp hộp lạ mà
không được báo trước thì phản xạ đầu tiên là bấm Chặn.

---

## Chưa kiểm được

| Việc | Vì sao |
|---|---|
| `.exe` chạy trên **máy Windows thứ hai không cài Node** | Chỉ có một máy. Đã cắt sạch `PATH` cho `node` không tìm thấy được và `.exe` vẫn chạy, `isSea()` = `true` — mạnh nhưng **không thay thế được** phép thử trên máy sạch |
| Hành vi trên Edge khi **có cú bấm** | Chỉ đo cú bấm trên Chrome. Edge cùng nhân Chromium và cùng cho `"prompt"` ở phép đo 5, nhưng chưa đo trực tiếp |
| Policy `LocalNetworkAccessAllowedForUrls` **chạy thật trên máy này** | Mới tra tài liệu, chưa đặt thử. Đặt policy đòi quyền admin và ghi vào registry máy — để GĐ6 làm, không làm trong spike |

**Đã gỡ khỏi mục này (đo bổ sung 04/08/2026):** quyền có giữ qua lần khởi động sau không,
cấp rồi còn cần cú bấm nữa không, và có policy cấp sẵn quyền không — cả ba đã trả lời ở trên.

## Đã dọn

Thư mục `spike/` đã xóa — không để lại code nghe cổng cục bộ trong repo.
Máy chủ thử không đụng credential thật, không nối database.

## Câu chưa trả lời

1. GĐ6 chọn **đặt policy** `LocalNetworkAccessAllowedForUrls` hay **dạy người dùng bấm Cho
   phép**? Policy gỡ được ràng buộc 1 nhưng đòi quyền admin và là thứ lặng lẽ hết tác dụng
   khi cài lại máy — cùng loại rủi ro với luật firewall WebRTC đang có.
2. 87 MB mỗi lần phát bản mới cầu nối có phiền không (tải về qua đường nào, có tự cập nhật
   không) — chưa bàn trong kế hoạch.
