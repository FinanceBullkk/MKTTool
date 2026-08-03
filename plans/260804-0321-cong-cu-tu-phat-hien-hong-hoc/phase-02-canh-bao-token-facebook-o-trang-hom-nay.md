# Phase 02 — Cảnh báo token Facebook ở trang Hôm nay

**Ưu tiên:** Cao · **Trạng thái:** ☐ Chưa làm · [← plan](plan.md)

## Vấn đề

`src/app/page.tsx` có ba dải cảnh báo: nick chưa dò gần đây, job bị luật chặn, nick cần xử lý
tay. Không dải nào đọc `FacebookPage.tokenValid` hay `FacebookConnection.expiresAt`.

Token chết là chuyện xảy ra **không báo trước** — nick admin đổi mật khẩu, gỡ app, hoặc bị Meta
khóa. README thừa nhận cách phát hiện hiện tại là *"bấm Kiểm tra token tất cả Page theo thói
quen"*. Thói quen không phải là cơ chế.

Hậu quả đúng lúc tệ nhất: lộ ra ở lần bấm đăng tiếp theo, tức là lúc đang cần đăng.

## Làm gì

Thêm dải cảnh báo thứ tư. Đọc thẳng từ DB, **không gọi Graph API lúc render** — trang Hôm nay
là trang mở nhiều nhất, gắn một lời gọi mạng vào đó là làm chậm mọi lần mở.

Hai mức, gộp vào một dải:

| Điều kiện | Chữ | Màu |
|---|---|---|
| `tokenValid = false` | "N Page có token hỏng — không đăng được" | đỏ |
| `expiresAt` còn < 7 ngày | "Token của kết nối X hết hạn sau N ngày" | vàng |

Cả hai đều dẫn về `/facebook`, nơi đã có sẵn nút "Kiểm tra token tất cả Page".

Ngưỡng 7 ngày để ở `rule-thresholds.ts`? **Không** — đó là ngưỡng của bộ luật, không phải của
cảnh báo giao diện. Để hằng số ngay trong module truy vấn, đặt tên rõ.

## File

**Tạo**
- `src/lib/facebook/facebook-token-warnings.ts` — truy vấn + gom thành danh sách cảnh báo

**Sửa**
- `src/app/page.tsx` — render dải thứ tư

**Dùng lại**
- `evaluateTokenHealth()` trong `facebook-token-health.ts` đã có sẵn logic đánh giá một token.
  Đọc trước, và nếu nó nhận đủ ba trường `{ expiresAt, tokenValid, tokenNote }` thì gọi thẳng
  thay vì viết lại điều kiện lần thứ hai. Hai nơi tự đánh giá "token còn dùng được không" là
  chỗ chắc chắn sẽ lệch nhau.

## Các bước

1. Đọc `facebook-token-health.ts`, xác nhận `evaluateTokenHealth()` dùng lại được.
2. `facebook-token-warnings.ts`: một truy vấn `facebookPage.findMany` kèm `connection`, ánh xạ
   qua `evaluateTokenHealth`, trả về `{ broken: [], expiringSoon: [] }`.
3. Nối vào `Promise.all` sẵn có ở `page.tsx` — không thêm lượt chờ tuần tự.
4. Render dải, chỉ khi có ít nhất một mục.

## Xong là khi

- Page có token hỏng → trang Hôm nay hiện đỏ ngay, không cần vào `/facebook`.
- Token sắp hết hạn (< 7 ngày) → hiện vàng.
- Chưa cấu hình Meta App hoặc chưa kết nối Page nào → **không** hiện gì (đa số người dùng ở
  trạng thái này; một dải luôn hiện là một dải bị phớt lờ).
- Trang Hôm nay không phát sinh lời gọi mạng mới.

## Rủi ro

| Rủi ro | Xử lý |
|---|---|
| Thêm dải thứ tư làm trang ồn | Chỉ hiện khi thật sự có vấn đề; gộp hai mức vào một dải |
| `tokenValid` là kết quả của lần kiểm **gần nhất**, có thể đã cũ | Câu chữ ghi kèm `tokenCheckedAt` — "kiểm lúc …" chứ không khẳng định hiện tại |
