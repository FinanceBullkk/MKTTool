/**
 * Better Auth phía trình duyệt — chỉ dùng cho hai việc: bấm đăng nhập, bấm đăng xuất.
 *
 * ## Vì sao cần client thay vì một form HTML thường
 *
 * `/api/auth/sign-in/social` không trả về chuyển hướng HTTP mà trả về JSON `{ url }` chứa địa
 * chỉ Google. Form thường POST thẳng vào đó sẽ đưa người dùng tới một trang toàn JSON. Phải có
 * một nhịp JavaScript đọc `url` rồi mới chuyển trang.
 *
 * Dùng client chính thức thay vì tự `fetch`: tham số `state` chống CSRF, tên endpoint và hình
 * dạng body đều là giao ước nội bộ của thư viện. Tự chép lại là tự nhận việc dò xem bản nâng
 * cấp nào âm thầm đổi chúng.
 *
 * Không khai `baseURL`: mặc định là chính origin đang mở, nên máy dev (`localhost:3000`) và
 * Railway (GĐ5) dùng chung một file, không có biến nào phải nhớ đổi.
 */
import { createAuthClient } from "better-auth/react";

export const authClient = createAuthClient();
