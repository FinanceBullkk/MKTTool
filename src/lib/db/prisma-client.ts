/**
 * Prisma client dùng chung.
 *
 * Prisma 7 bắt buộc dùng driver adapter — connection URL không còn khai báo trong
 * schema.prisma nữa (xem prisma.config.ts).
 *
 * Giữ singleton trên globalThis để hot-reload của Next dev không tạo hàng chục
 * kết nối mỗi lần sửa file.
 *
 * ## Vì sao client dựng TRỄ, không dựng lúc nạp module
 *
 * Cùng lý lẽ với `getAuth()` trong `auth-server.ts`, và phát hiện ra theo cùng một cách: lần
 * đầu build ảnh Docker (GĐ5).
 *
 * Bản trước gọi `createPrismaClient()` ngay ở thân module, nên chỉ cần **import** file này là
 * đã đọc `DATABASE_URL` và ném lỗi khi thiếu. `next build` phải nạp mọi route để đọc cấu hình
 * đoạn của chúng, mà `layout.tsx` → `SessionBadge` → `require-actor` → file này, nên build
 * **dừng ở `/_not-found`** trong một môi trường không có secret:
 *
 *     Error: Failed to collect configuration for /_not-found
 *       [cause]: Error: Thiếu DATABASE_URL.
 *
 * Máy dev không thấy vì `next build` tự nạp `.env`. Railway build trong Docker thì không có
 * file đó — và **không nên có**: khóa kho danh tính không đi vào ảnh (xem `.dockerignore`).
 *
 * Dựng trễ cũng sửa một chuyện thứ hai, âm thầm hơn: nạp module này vốn có **tác dụng phụ** là
 * mở sẵn một connection pool. Một bài test chỉ lỡ import gián tiếp qua vài lớp cũng dựng pool
 * dù không hỏi database câu nào.
 *
 * Dùng `Proxy` thay vì đổi `prisma` thành `getPrisma()` để **không phải sửa hơn trăm chỗ gọi** —
 * và quan trọng hơn: để không có hai cách lấy client cùng tồn tại, thứ sớm muộn cũng có người
 * dùng nhầm cách cũ.
 */
import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "@prisma/client";

function createPrismaClient(): PrismaClient {
  const url = process.env.DATABASE_URL;
  if (!url) {
    throw new Error("DATABASE_URL is missing. Copy .env.example to .env, then add the value.");
  }

  const adapter = new PrismaPg({ connectionString: url });
  return new PrismaClient({
    adapter,
    log: process.env.NODE_ENV === "development" ? ["warn", "error"] : ["error"],
  });
}

const globalForPrisma = globalThis as unknown as { prisma?: PrismaClient };

/** Dựng ở lần chạm ĐẦU TIÊN, không phải lúc nạp module. Thiếu biến vẫn báo đúng câu như cũ. */
function getClient(): PrismaClient {
  globalForPrisma.prisma ??= createPrismaClient();
  return globalForPrisma.prisma;
}

/**
 * Client dùng chung. Nhìn từ chỗ gọi thì không khác gì một `PrismaClient` thường —
 * `prisma.account.findMany()`, `prisma.$transaction([...])` — chỉ khác ở chỗ nó chưa tồn tại
 * cho tới lần chạm đầu tiên.
 */
export const prisma: PrismaClient = new Proxy({} as PrismaClient, {
  get(_target, property) {
    const client = getClient();
    const value = Reflect.get(client, property) as unknown;

    // Gắn lại `this` cho phương thức: lấy ra rồi gọi rời khỏi client (`const { $transaction } =
    // prisma`) thì nếu không bind, `this` là proxy rỗng chứ không phải client thật.
    return typeof value === "function" ? value.bind(client) : value;
  },
});
