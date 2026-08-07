# Prompt cho phiên khác — tối ưu bước "đăng nhập lần đầu"

Chép toàn bộ phần dưới dấu gạch vào phiên mới.

---

Đọc `./README.md` và `./docs/codebase-summary.md` trước khi làm gì.

## Bối cảnh

MKTTool vừa dựng lại luồng nhập một nick Reddit thành **ba chặng** (commit `e320658`, `eb09807`
trên nhánh `feat/ghim-nick-vao-may-operator`, PR #20 đã merge vào `master`):

| Chặng | Ở đâu | Kết quả |
|---|---|---|
| 1. Khai nick | `/accounts` → Thêm nick | proxy, bí mật, người phụ trách |
| 2. Dựng profile | thẻ *Việc tiếp theo — dựng profile antidetect* | `antidetectProfileId` + `deviceId` |
| 3. **Đăng nhập lần đầu** | thẻ *Việc tiếp theo — đăng nhập lần đầu* | `firstLoginAt` |

Chặng 3 hiện là **thao tác tay hoàn toàn**, và đó là chỗ cần tối ưu:

1. bấm **Mở profile** → chờ cửa sổ Chromium hiện ra
2. bấm **Mật khẩu Google** → tab của cầu nối mở ra hiện mật khẩu → chép tay
3. trong profile: vào reddit.com → *Continue with Google* → dán email, dán mật khẩu
4. bấm **Mã OTP** → chép mã 6 số (đổi mỗi 30 giây) → dán
5. quay lại web app bấm **"Đã đăng nhập được"** → ghi `firstLoginAt`

## Quyết định đã chốt — ĐỪNG đảo lại

**Không tự động điền email / mật khẩu / OTP vào trang đăng nhập Google**, dù công cụ hoàn toàn làm
được (MultiZen mở CDP ở `127.0.0.1:9222`, và MCP của nó có `navigate` / `type` / `click`).

Lý do: màn hình đăng nhập Google được canh chặt nhất trong cả quy trình — họ đo nhịp gõ, chuyển
động chuột, khoảng nghỉ giữa các trường. Gõ bằng CDP là mẫu hành vi nhận ra được ngay, và thời
điểm làm việc đó lại đúng lúc rủi ro nhất: tài khoản vừa mua, IP lạ, thiết bị lạ, chưa có lịch sử.
Đổi 2 phút thao tác tay lấy xác suất mất một nick đã trả tiền là vụ đổi tồi — cùng lý do với ba
quyết định khác của dự án (proxy kiểm trước khi mở, vân tay căn theo quốc gia, cold-start 14 ngày).

Nếu trong lúc làm thấy một cách "gõ hộ khéo hơn", vẫn không làm. Ghi lại vào báo cáo rồi hỏi.

## Ba việc, làm theo đúng thứ tự này

### Việc A — gộp hai cú bấm đầu (KHÔNG đụng cầu nối, làm trước)

Thêm nút **"Mở profile và lấy mật khẩu"** ở thẻ Thao tác: bắn cả lượt mở profile lẫn lượt mở tab bí
mật, để cửa sổ Chromium và tab mật khẩu hiện lên song song thay vì phải bấm hai lần, chờ hai lượt.

Đọc kỹ `src/app/accounts/[id]/account-vault-actions-panel.tsx` trước — **thứ tự gọi ở đó là ràng
buộc thật, không phải sở thích sắp xếp**:

- `launchProfile()` gọi `pingRelay()` ở **dòng đầu và không await** (ràng buộc 1 của spike GĐ0) —
  hộp xin quyền mạng nội bộ chỉ hiện ra khi lời gọi mang kích hoạt người dùng, mà kích hoạt đó mất
  sau vòng `await` đầu tiên.
- `openSecretTab()` mở `window.open` **trước** khi xin vé, vì mở sau một vòng `await` là rơi thẳng
  vào bộ chặn popup.
- Chuỗi features của `window.open` **không được có `noopener`** — nó làm hàm trả về `null`, tức
  nhánh "bị chặn popup" ăn mọi cú bấm. Đã vấp thật.

Gộp hai việc đó phải giữ nguyên cả ba điều trên. Nếu không giữ được thì **đừng gộp** — nói rõ vì
sao thay vì làm hỏng một thứ đang chạy.

### Việc B — tự đo "đã đăng nhập" thay vì hỏi người (cần cầu nối bản 7)

`Account.firstLoginAt` hiện là **lời khai của người**: ai quên bấm thì cột "Sẵn sàng" báo đỏ oan.
MCP của MultiZen có `get_cookies` — cầu nối hỏi profile *"có cookie phiên Reddit chưa"* rồi tự đánh
dấu là xóa hẳn nhược điểm đó.

Cần làm:

- thêm hàm đọc cookie vào `AntidetectAdapter` (`src/lib/antidetect/antidetect-browser-adapter.ts`)
  và `MultizenAdapter`. `AdsPowerAdapter` ném lỗi "chưa hỗ trợ" theo đúng khuôn `chuaHoTro()` đang
  có — **đừng trả mảng rỗng**, vì rỗng nghĩa là "chưa đăng nhập", một câu khác hẳn "không hỏi được"
- một đường ở cầu nối để web app hỏi
- web app tự gọi khi mở trang chi tiết nick đang ở chặng 3, và ghi `firstLoginAt` khi thấy cookie
- **giữ nguyên nút bấm tay** làm đường lùi: máy chạy cầu nối bản cũ vẫn phải đánh dấu được

### Việc C — tab bí mật tiện hơn (cùng bản 7 với việc B)

Trang `/secret` do cầu nối phục vụ (`relay/src/`): thêm nút chép vào clipboard, và **đếm ngược cho
mã OTP**. Mã đổi mỗi 30 giây; chép lúc còn 3 giây là gõ xong thì đã hết hạn.

Làm chung một chuyến với việc B: cả hai đều bắt cả team cài lại cầu nối, và hai lần cài cho hai
tiện nghi nhỏ là hai lần quá nhiều.

## Ràng buộc bắt buộc

**Cầu nối không có bộ tự cập nhật (QĐ 11).** Tăng `RELAY_VERSION` nghĩa là mọi người phải tự vào
`/relay-download` tải lại và chạy `setup.bat`. Nên:

- việc B và C phải đi **cùng một bản 7**, không tách hai lần phát hành
- **đừng nâng `MIN_RELAY_VERSION`** (sàn chung). Loại vé nào đòi bản mới thì khai riêng ở
  `MIN_RELAY_VERSION_BY_KIND` trong `src/lib/tickets/ticket-types.ts` — nâng sàn chung là làm **mọi**
  vé (mật khẩu, OTP, mở profile) bị mọi cầu nối cũ từ chối cùng lúc
- mọi tính năng mới phải **lùi được**: cầu nối bản cũ trả 404 thì giao diện im lặng lùi về đường
  cũ, không kêu đỏ. Cầu nối bản cũ còn chạy ngoài kia rất lâu, và một dải đỏ thường trực thì không
  ai đọc nữa

**Hạn giờ.** `RELAY_TIMEOUT_MS` = 4 giây cho lời gọi thường; `RELAY_PROFILE_WORK_TIMEOUT_MS` = 60
giây cho lời gọi bắt MultiZen dựng hoặc bật trình duyệt thật. Lời gọi đọc cookie thuộc loại nào thì
phải **đo rồi mới chọn**, đừng đoán — đã vấp hai lần vì chọn nhầm 4 giây (07/08/2026).

**Code.** File dưới 200 dòng, kebab-case, chú thích tiếng Việt giải thích **vì sao** chứ không phải
làm gì. Theo đúng giọng của các file quanh đó.

## Nghiệm thu

- `npm run typecheck`, `npm test`, `npm run lint` — phải sạch. **Đừng chạy `npm run build`**, máy
  yếu RAM
- việc B và C: `npm run relay:build` → `npm run relay:verify` → cài lại trên máy đang ngồi → thử
  thật trên `https://mkttool-web-production.up.railway.app` (**không** phải `localhost:3000` — cầu
  nối chỉ tin nguồn Railway, mở ở localhost là mọi lời gọi chết theo kiểu CORS và giao diện báo
  nhầm là "cầu nối chưa chạy")
- có một nick thật để thử: `Ok_Swimmer_5542`, profile `15ab627f-b743-4e42-81bb-b8780d27ec0b`,
  proxy `webshare-02-us`

## Việc dọn trước khi bắt đầu

Nhánh `feat/ghim-nick-vao-may-operator` đang có **hai commit chưa push** (`e320658`, `eb09807` —
sửa hạn giờ cho hai nút profile). Push và mở PR trước, đừng chồng việc mới lên trên.
