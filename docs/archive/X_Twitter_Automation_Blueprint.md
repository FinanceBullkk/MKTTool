# Bản Thiết Kế Kiến Trúc & Luồng Vận Hành Hệ Thống Auto-X (Twitter)
*Dành cho Product Team (Dev & Copywriter)*

---

## 1. TỔNG QUAN KIẾN TRÚC HỆ THỐNG (SYSTEM ARCHITECTURE)

Hệ thống được thiết kế theo mô hình Micro-services cơ bản, chạy trên Docker để dễ deploy lên VPS.

```text
[ COPYWRITER / ADMIN ] ──(Giao diện UI nội bộ hoặc Google Sheets/Airtable)
        │
        ▼
┌─────────────────────────────────────────────────────────────┐
│                 VPS (BACKEND CONTROLLER)                    │
│                                                             │
│  1. API Server (Node.js / Express)                          │
│     - Nhận lệnh, lưu lịch trình, kết nối Webhook            │
│                                                             │
│  2. AI Engine (Tích hợp OpenAI/Claude API)                  │
│     - Spin content, gen Reply, tạo DM message               │
│                                                             │
│  3. Database Layer                                          │
│     - PostgreSQL: Lưu data (Nick, Post, Proxy, Stats)       │
│     - Redis (BullMQ): Hàng đợi Queue để chạy tác vụ         │
└───────┬─────────────────────────────────────────────┬───────┘
        │ (Lệnh chạy ngầm)                            │ (Webhook/UTM)
        ▼                                             ▼
┌──────────────────────────────┐              ┌───────────────┐
│ AUTOMATION WORKERS           │              │ YOUR PRODUCT  │
│ (Playwright + Antidetect)    │              │ (Main DB)     │
│                              │              │               │
│ - Worker 1 (Nick_Alex01)     │ ──(Clicks)─> │ - Nhận Lead   │
│ - Worker 2 (Nick_Sarah02)    │ <─(Ping)──── │ - Ghi nhận    │
│ ...                          │              │               │
└──────────────────────────────┘              └───────────────┘
```

**Chi tiết Tech Stack đề xuất:**
*   **Backend & Workers:** Node.js (TypeScript). Node.js rất mạnh trong việc xử lý I/O bất đồng bộ và là môi trường "native" (bản địa) của thư viện Playwright.
*   **Database:** PostgreSQL (Lưu dữ liệu cứng) + Redis (Lưu Cache và xử lý Hàng đợi Job).
*   **Automation:** Playwright (Điều khiển trình duyệt) kết nối qua giao thức Local API của Gologin hoặc AdsPower.
*   **Quản lý Proxy:** Tích hợp thẳng vào Profile của Antidetect Browser, Playwright không cần tự cấu hình.

---

## 2. DATABASE SCHEMA (CÁC BẢNG DỮ LIỆU CỐT LÕI)

Team Dev cần thiết kế các bảng cơ bản sau trong PostgreSQL để quản lý hệ thống:
1.  `accounts`: Lưu thông tin 50 nick vệ tinh (Account ID, Username, Password, Profile ID của Antidetect, Status: Alive/Shadowbanned).
2.  `proxies`: Lưu IP, Port, User, Pass. Map 1-1 với bảng `accounts`.
3.  `campaigns`: Lưu các kịch bản Mồi nhử (Lead Magnet), chứa Prompt gốc để AI spin.
4.  `posts_queue`: Bảng chứa các bài viết chuẩn bị đăng (thời gian đăng, thuộc nick nào, link ảnh).
5.  `leads_tracking`: Lưu User ID của khách trên X đã được gửi DM và trạng thái (Đã gửi DM / Đã click / Đã đăng ký Product).

---

## 3. CHI TIẾT CÁC LUỒNG VẬN HÀNH (WORKFLOWS)

### Flow 1: Luồng Nuôi Nick & Đa Dạng Hóa (Warm-up & Humanize)
*Mục đích: Giữ cho 50 nick luôn sống và có Trust cao trong mắt thuật toán X.*
1.  Cronjob (Redis) kích hoạt Worker Playwright mỗi 4 tiếng/lần.
2.  Playwright gọi API Antidetect để mở Profile (Ví dụ: `Nick_01`).
3.  **Hành động:** 
    *   Cuộn newsfeed ngẫu nhiên từ 2-5 phút.
    *   Dừng lại đọc bài (delay 10-20s).
    *   Like random 1-2 bài (không chứa từ khóa nhạy cảm, dev có thể check text trước khi like).
    *   Retweet 1 bài của tài khoản Hub (Tài khoản Brand chính của bạn) để dồn traffic.
4.  Đóng Profile, ghi log "Thành công" vào Database.

### Flow 2: Luồng Cướp Traffic (Reply Hijacking)
*Mục đích: Lấy traffic hiển thị từ các KOL lớn trong ngách.*
1.  Backend dùng API của X (gói Free/Basic) để subscribe (theo dõi) 10-20 KOL mục tiêu.
2.  Khi KOL vừa đăng bài (bắt được qua Webhook hoặc quét RSS/Scrape mỗi 2 phút), hệ thống đẩy nội dung bài đó về Backend.
3.  **AI Engine** nhận text của KOL -> Chạy Prompt: *"Viết 1 bình luận phản biện/thêm giá trị dưới 20 từ, giọng điệu chuyên gia"*.
4.  Backend chọn ngẫu nhiên 1 tài khoản đang rảnh (Idle) trong pool 50 nick.
5.  Playwright mở nick đó lên -> Điều hướng thẳng đến URL bài viết của KOL -> Gõ phím từng chữ (mô phỏng delay) -> Bấm Reply.
6.  *(Giới hạn: Mỗi nick vệ tinh chỉ đi reply tối đa 5-7 lần/ngày để tránh spam).*

### Flow 3: Luồng Cốt Lõi - Thu Phễu Auto-DM (Lead Generation)
*Mục đích: Biến lượt tương tác thành User đăng ký Sản phẩm của bạn.*
1.  Copywriter lên lịch đăng bài "Mồi nhử" (Ví dụ: *Reply "DATA" để nhận bộ công cụ*).
2.  Bài được Playwright đăng lên X qua một Nick vệ tinh (Ví dụ: `Nick_Alex01`).
3.  **Listener Module:** Playwright định kỳ 5 phút/lần mở bài viết đó ra, quét thẻ HTML chứa các comment mới.
4.  Nếu phát hiện comment có chứa từ khóa "DATA" từ `User_X`:
    *   Hệ thống kiểm tra `User_X` đã có trong bảng `leads_tracking` chưa (chống gửi đúp).
    *   Playwright tự động bấm Like comment đó.
    *   Playwright điều hướng sang trang DM (Tin nhắn) của `User_X`.
    *   Gõ tin nhắn tự động: *"Here is your link as promised: https://yourproduct.com/?utm_source=twitter&utm_medium=autodm&utm_campaign=Nick_Alex01"*
5.  Ghi nhận trạng thái "Đã gửi DM" vào Database.

### Flow 4: Luồng Tracking Chuyển Đổi (Closed-Loop Tracking)
*Mục đích: Báo cáo Nick nào, Kịch bản nào mang lại khách hàng thật.*
1.  Khách hàng (`User_X`) click vào link UTM từ DM.
2.  Họ điền form đăng ký thành công trên website/app của bạn (Main Product).
3.  **Main DB** của bạn bắn 1 Webhook (chứa chuỗi UTM) về lại API Server của VPS.
4.  VPS nhận Webhook, cập nhật trạng thái trong bảng `leads_tracking` thành "Đã đăng ký".
5.  Giao diện Admin cập nhật Real-time: Phễu từ Mồi nhử "DATA" đã mang về 1 Paid User từ vệ tinh `Nick_Alex01`.

---

## 4. QUY TẮC AN TOÀN KHI CODE (ANTI-BAN BEST PRACTICES DÀNH CHO DEV)

Để hệ thống chạy mượt mà mà không bị X khóa bay cả dàn 50 nick, Dev cần tuân thủ nghiêm ngặt các quy tắc sau khi code kịch bản Playwright:

*   **Không nhúng Link trực tiếp (No direct links):** Không dùng Playwright hàm `page.goto('url')` liên tục. Hãy truy cập trang chủ X, sau đó dùng hàm `page.click()` để search tên người dùng hoặc bài viết, bắt chước hành vi thật.
*   **Mô phỏng Gõ phím (Human Typing):** Tuyệt đối không dùng `page.fill(selector, text)`. Hàm này dán text vào trong 1 mili-giây, X nhận ra bot ngay. Phải dùng `page.type(selector, text, { delay: 100 })` để mô phỏng nhịp gõ phím ngẫu nhiên của con người.
*   **Xử lý Lỗi (Error Handling & Retry):** X hay bị lag hoặc thay đổi selector (CSS class). Dev cần bọc try-catch cẩn thận. Nếu Playwright không tìm thấy nút "Reply", phải chụp màn hình (screenshot) lưu vào log và đóng trình duyệt, thay vì click điên cuồng gây Checkpoint tài khoản.
*   **Rate Limit Cứng (Hard Limits):** Set cứng giới hạn trong file `.env` hoặc Database:
    *   Max Tweets/ngày/nick: 3 - 5 bài.
    *   Max DMs/ngày/nick: 20 - 30 tin nhắn (vượt mức này cực kỳ dễ bị Shadowban).
    *   Delay giữa các DMs: Random từ 5 đến 15 phút. Không bao giờ gửi 1 lúc 10 tin nhắn.
