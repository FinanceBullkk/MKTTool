# parked/

Code **chưa quyết định** — nằm ngoài `src/` nên không biên dịch, không lint, không chạy test.
Giữ lại nguyên văn để còn đường quay lại; xóa là mất, vì phần lớn chưa từng vào git.

Muốn dùng lại thì đọc phần "Vì sao gác" bên dưới trước, rồi mới chuyển ngược vào `src/`.

---

## `warmup-260819/` — bộ nuôi nick TikTok tự động

**Nguồn:** Gemini viết 19/08/2026, 11:30–11:32. 1339 dòng, 11 file.
**Trạng thái lúc gác:** không biên dịch được, không có gì trong `src/` import tới.

### Nội dung

| Thư mục | Làm gì |
|---------|--------|
| `physics/` | Đường chuột bezier, cuộn có quán tính, mô phỏng gõ telex |
| `markov/` | Máy trạng thái quyết định xem/lướt/like, bộ quan sát video TikTok qua DOM |
| `driver/` | Client CDP (Chrome DevTools Protocol) — giả sự kiện chuột/phím sao cho `event.isTrusted === true` |
| `orchestrator/` | Chạy một phiên nuôi: mở FYP, lặp N video, tự like, ghi telemetry |
| `warmup-actions.ts` | Server action trừ dần số ngày cold-start |

### Vì sao gác

**1. Nó là bot farm, và README nói dự án không phải bot farm.**

Dòng đầu [README.md](../README.md): *"Không phải bot farm. Là 'tủ hồ sơ + bảng điều khiển' dùng
chung cho team; mỗi nick có đúng một người phụ trách... team **tự viết content**; công cụ lo phần
danh tính và an toàn."*

Bộ này tự cuộn feed, tự like, tự đọc comment, và cố tình qua mặt phép kiểm `isTrusted` của
trình duyệt. Đó là một hướng sản phẩm khác hẳn — không phải nâng cấp của hướng cũ. Nuôi nick
**bằng tay** (người ngồi lướt 15 phút) và nuôi nick **bằng bot** là hai sản phẩm khác nhau, khác
cả về rủi ro pháp lý lẫn rủi ro bị nền tảng phạt. Quyết định đó thuộc về chủ dự án, không thuộc
về một lượt sinh code.

**2. Mô hình dữ liệu sai, và sai theo kiểu tốn công về sau.**

`warmup-actions.ts` đọc `coldStartDaysRemaining` như một **cột trong database**. Không có cột đó.
`coldStartDaysRemaining()` là **hàm thuần** tính ra số ngày từ `Account.coldStartUntil` (một mốc
ngày). Bốn lỗi biên dịch của nó đều từ chỗ này.

Khác biệt không nằm ở tên gọi:

| Cách lưu | Hệ quả |
|----------|--------|
| `coldStartUntil` = mốc ngày (**hiện tại**) | Số ngày còn lại luôn đúng, không cần ai làm gì |
| `coldStartDaysRemaining` = số ngày (**bản gác**) | Phải có thứ chạy hằng ngày trừ đi 1. Quên ba ngày là sai ba ngày, và không có gì báo |

Thiết kế hiện tại chọn mốc ngày có chủ ý. Muốn dùng lại bộ này thì phải viết lại phần đó, không
phải đổi tên biến.

**3. Nó tự bật lại phần đã gác.**

Khi đếm về 0, nó đặt trạng thái nick thành `ALIVE` kèm câu *"sẵn sàng đăng bài"* — trong khi
pipeline đăng bài đã gác từ 19/08/2026 (xem
[plan](../../plans/260819-1059-tiktok-only-ui-rescope/plan.md)).

### Nếu muốn dùng lại

Phần `physics/` và `markov/` là hàm thuần, có test riêng, và **không** phụ thuộc vào quyết định
sản phẩm — chúng vẫn dùng được nếu sau này chốt hướng bot. Phần `driver/` và `orchestrator/` thì
phải xem lại cùng lúc với quyết định đó. `warmup-actions.ts` phải viết lại.
