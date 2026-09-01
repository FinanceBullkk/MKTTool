# Runbook: cảnh báo khi production chết

**Cập nhật:** 02/09/2026
**Trạng thái:** **ĐANG CHẠY** — UptimeRobot, chủ dự án tạo 02/09/2026, báo về
`anhhao.dl108@gmail.com`. Cấu hình theo bảng bên dưới. Đường báo **đã diễn tập và nổ thật**
cùng ngày; xem bảng ở mục "Diễn tập".

## Vấn đề nó giải

Trước 02/09/2026 **không có cảnh báo nào**. Sự cố 503 ngắt quãng ngày 30/08/2026 được phát hiện
bằng mắt người, không phải bằng báo động — dịch vụ trả 503 suốt nhiều giờ và không ai biết cho tới
khi có người mở trang.

Railway có healthcheck riêng, nhưng nó **điều khiển việc định tuyến, không gửi thông báo cho ai**.
Nó ngừng đẩy traffic vào instance hỏng — việc đó tốt và khác hẳn việc báo cho người biết.

## Điều kiện tiên quyết: monitor phải ở NGOÀI

Thứ chạy trên chính máy bị sập thì không báo được lúc máy sập. Không dựng cron trên Railway để
theo dõi chính Railway. Dùng dịch vụ ngoài — cần tài khoản, nên bước tạo là việc của chủ dự án.

Miễn phí đủ dùng: UptimeRobot, BetterStack (Better Uptime), Healthchecks.io.

## Cấu hình

| Mục | Giá trị |
|---|---|
| URL | `https://mkttool-web-production.up.railway.app/api/healthz` |
| Phương thức | `GET` |
| Chu kỳ | 60 giây |
| Điều kiện PASS | **HTTP 200** |
| Báo động sau | **2 lần lỗi liên tiếp** (~2 phút) |
| Báo phục hồi sau | 2 lần thành công liên tiếp |
| Timeout mỗi lượt | 10 giây |

### Chỉ cần kiểm HTTP status, không cần parse body

`src/app/api/healthz/route.ts:48` trả **200 khi ready và 503 khi không ready** — trạng thái đã nằm
ở mã HTTP. Không có trường hợp "200 kèm `ok:false`" để phải bóc JSON. Cấu hình mặc định của mọi
dịch vụ uptime là đủ.

Body vẫn hữu ích lúc điều tra vì nó chỉ ra thành phần nào hỏng:

```json
{"ok":true,"status":"ready",
 "checks":{"database":"ok","releaseMetadata":"ok","r2":"ok"},
 "relayVersion":16,"releaseSource":"r2"}
```

### Vì sao 2 lần liên tiếp chứ không phải 1

Sự cố 30/08 là 503 **ngắt quãng**. Báo động ngay lần đầu sẽ ồn tới mức bị tắt thông báo — và một
báo động bị tắt thì tệ hơn không có. Hai lần liên tiếp lọc được nhiễu một-lượt mà vẫn bắt được
đúng kiểu hỏng đã từng xảy ra thật.

### ⚠️ Đừng trỏ vào `/api/health/run`

Đó là bộ dò sức khỏe **của nick**, không phải của dịch vụ: nó đòi xác thực (sẽ trả 401 và báo động
giả liên tục) và mỗi lượt gọi là một lượt chạy việc thật. Nhầm hai đường này đã từng làm hỏng cấu
hình healthcheck trước đây — xem `deployment-guide.md` bước 7.

## Nội dung cảnh báo cần có

Đủ để người bị đánh thức biết phải làm gì mà không cần mở laptop trước:

```
MKTTool production KHONG PHAN HOI
URL   : /api/healthz
Status: 503 (2 lượt liên tiếp)
Lúc   : <thời gian>
```

## Diễn tập — làm một lần, trước khi tin vào nó

Một đường báo động chưa từng nổ là một giả định, không phải một lớp bảo vệ. Cấu hình đúng mà email
rơi vào spam, hoặc địa chỉ gõ sai một ký tự, thì lần sập thật vẫn im lặng — và lúc đó không ai biết
để mà sửa. Lần 1 đã chạy và đã nhận được mail, nên hôm nay đây là một lớp bảo vệ chứ không còn là
một ô cấu hình đã điền.

Bắt nó nổ đúng một lần:

1. Trong UptimeRobot, sửa tạm URL của monitor thành một đường chắc chắn 404 trên cùng host, ví dụ
   `https://mkttool-web-production.up.railway.app/api/healthz-drill`.
2. Đợi ~2 phút (2 lượt lỗi liên tiếp). Email báo động phải tới.
3. **Kiểm cả hộp spam.** Nếu nó nằm ở spam thì đánh dấu "not spam" ngay — đó chính là chỗ báo động
   thật sẽ rơi vào.
4. Trả URL về `/api/healthz`. Đợi 2 lượt xanh, phải nhận được email phục hồi.

Ghi ngày diễn tập vào đây. Làm lại khi đổi địa chỉ nhận hoặc đổi dịch vụ monitor.

| Lần diễn tập | Ngày | Kết quả |
|---|---|---|
| 1 | 02/09/2026 | **PASS.** Chủ dự án đổi URL sang đường 404, email báo động tới nơi, khôi phục URL xong dịch vụ trở lại xanh. Xác nhận độc lập cùng lúc: `/api/healthz` HTTP 200, `/api/healthz-drill` HTTP 404 |

## Việc đầu tiên khi nhận báo động

1. Gọi tay `curl -s https://mkttool-web-production.up.railway.app/api/healthz` — đọc `checks` xem
   thành phần nào hỏng (`database` / `releaseMetadata` / `r2`).
2. `railway status --json` — xem deployment đang chạy có phải bản mong đợi không, instance còn
   RUNNING không.
3. Xem log dịch vụ trên Railway.
4. Chỉ khi xác định là hồi quy do bản mới mới tính rollback — theo
   [release-rollback.md](release-rollback.md). Rollback do người duyệt và người thực hiện.

## Nên theo dõi thêm (tùy chọn)

- **`/login` trả 200.** Bắt được kiểu hỏng mà tiến trình còn sống và healthz còn xanh nhưng trang
  không render được.
- **Hạn SSL và hạn domain.** Đa số dịch vụ uptime có sẵn, bật là xong.

## Chưa quyết

- **Ai nhận báo động, và kênh nào** (Telegram, email, điện thoại). Một người thì có điểm chết đơn;
  cả nhóm thì dễ thành ai cũng tưởng người khác xử lý. Cần chủ dự án chốt.
- **Có báo động ngoài giờ không.** Không ai trực đêm thì báo động 3h sáng chỉ làm mất ngủ chứ
  không rút ngắn thời gian chết — khi đó đặt báo động giờ hành chính là lựa chọn thành thật hơn.
