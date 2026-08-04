/**
 * Đường Better Auth phục vụ toàn bộ luồng đăng nhập.
 *
 * Một file bắt hết mọi đường con: `/api/auth/sign-in/social`, `/api/auth/callback/google`,
 * `/api/auth/get-session`, `/api/auth/sign-out`. Địa chỉ callback ở đây phải khớp từng ký tự
 * với thứ đã khai ở Google Cloud Console — xem README, mục "Tạo Google OAuth client".
 *
 * ## Vì sao đường này CỐ Ý không gác
 *
 * Nó có tên trong `UNGUARDED_ROUTES_BY_DESIGN`. Gác lối vào đăng nhập bằng chính đăng nhập là
 * khóa cửa rồi để chìa bên trong: chưa ai đăng nhập được thì không ai đăng nhập được nữa.
 * Better Auth tự lo phần bảo vệ của nó — tham số `state` chống CSRF, kiểm chữ ký, kiểm hết hạn.
 *
 * ## Vì sao gọi `getAuth()` bên trong hàm chứ không bọc sẵn ngoài
 *
 * `toNextJsHandler(getAuth())` trông gọn hơn nhưng nó đọc biến môi trường **ngay lúc nạp file**,
 * đúng thứ mà khởi tạo trễ trong `auth-server.ts` tồn tại để tránh: `next build` nạp mọi route
 * để phân tích, và build trong Docker (GĐ5) không có secret. Truyền vào một hàm thì credential
 * chỉ được đọc lúc thật sự phục vụ một request.
 */
import { toNextJsHandler } from "better-auth/next-js";
import { getAuth } from "@/lib/auth/auth-server";

export const runtime = "nodejs";

export const { GET, POST } = toNextJsHandler((request) => getAuth().handler(request));
