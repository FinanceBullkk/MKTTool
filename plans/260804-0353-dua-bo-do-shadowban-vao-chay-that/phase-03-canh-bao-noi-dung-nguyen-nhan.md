# Phase 03 — Cảnh báo nói đúng nguyên nhân

**Trạng thái:** ☐ Chưa làm · [← plan](plan.md)

## Vấn đề

Trang Hôm nay đang hiện:

> *2 nick chưa được dò gần đây — chưa biết bài của chúng còn hiện với người ngoài không.*

Câu đó **đúng về hiện tượng nhưng sai về nguyên nhân**. Nó gợi ý "lâu rồi chưa chạy, chạy lại
đi", trong khi sự thật là **chưa từng chạy và không thể chạy**: kho chưa có proxy quan sát viên
nào, nên `runHealthCheck` dừng ngay từ đầu.

Kết quả: một dải cảnh báo sẽ hiện vĩnh viễn, không bao giờ tự tắt được dù người dùng làm gì trên
màn hình đó. Dải cảnh báo không bao giờ tắt sẽ được học cách phớt lờ trong một tuần, và khi nó
tắt được thật thì cũng không ai còn nhìn.

`loadAccountHealthRows()` gộp hai chuyện khác nhau vào cùng một cờ `stale`: *chưa dò lần nào* và
*dò lâu rồi*. Với người đọc, hai chuyện đó cần hai câu khác nhau và hai việc phải làm khác nhau.

## Làm gì

Tách ba tình huống, mỗi tình huống một câu và một đường đi:

| Tình huống | Câu | Đường đi |
|---|---|---|
| Chưa có proxy quan sát viên | "Bộ dò shadowban chưa chạy được — kho chưa có proxy quan sát viên nào" | → `/proxies` |
| Có proxy, nhưng chưa nick nào được dò | "Chưa nick nào được dò lần nào" | → `/health` bấm Dò cả đàn |
| Có proxy, đã dò, nhưng lâu rồi | "N nick chưa được dò gần đây" (giữ nguyên câu hiện tại) | → `/health` |

Chỉ hiện **một** dải, theo thứ tự ưu tiên trên: ba dải cùng lúc nói về cùng một chuyện là ba lần
phiền cho một vấn đề.

Không hiện gì khi kho chưa có nick Reddit nào — chưa có nick thì không có gì để dò, và đó là
trạng thái bình thường của một cài đặt mới.

## File

**Tạo**
- `src/lib/health/health-setup-warning.ts` — quyết định hiện dải nào (hàm thuần, test được)
- `src/lib/health/health-setup-warning.test.ts`

**Sửa**
- `src/app/page.tsx` — thay dải `staleHealth` bằng dải do hàm trên quyết định
- `src/components/health/observer-proxy-section.tsx` — ô trống hiện đang chỉ nhắc
  `npm run health`; bổ sung rằng khai xong là bấm được nút ngay trong app

## Xong là khi

- Kho hiện tại (0 proxy quan sát viên) → dải nói đúng "chưa có proxy quan sát viên", trỏ về
  `/proxies`.
- Khai một proxy quan sát viên xong → dải đổi sang "chưa nick nào được dò", trỏ về `/health`.
- Dò xong → dải biến mất.
- Mỗi bước đều có đúng một việc tiếp theo để làm.

## Rủi ro

| Rủi ro | Xử lý |
|---|---|
| Thêm một truy vấn nữa vào trang mở nhiều nhất | Đếm `observerProxy` là một `count()` có điều kiện `active` — rẻ, và đi chung `Promise.all` sẵn có |
| Logic ba nhánh nằm trong JSX rồi mục sau sửa nhầm | Tách hẳn thành hàm thuần có test, JSX chỉ hiển thị thứ hàm đó trả về |
