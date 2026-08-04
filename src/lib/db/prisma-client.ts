/**
 * Prisma client dùng chung.
 *
 * Prisma 7 bắt buộc dùng driver adapter — connection URL không còn khai báo trong
 * schema.prisma nữa (xem prisma.config.ts).
 *
 * Giữ singleton trên globalThis để hot-reload của Next dev không tạo hàng chục
 * kết nối mỗi lần sửa file.
 */
import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "@prisma/client";

function createPrismaClient(): PrismaClient {
  const url = process.env.DATABASE_URL;
  if (!url) {
    throw new Error("Thiếu DATABASE_URL. Sao chép .env.example thành .env rồi điền giá trị.");
  }

  const adapter = new PrismaPg({ connectionString: url });
  return new PrismaClient({
    adapter,
    log: process.env.NODE_ENV === "development" ? ["warn", "error"] : ["error"],
  });
}

const globalForPrisma = globalThis as unknown as { prisma?: PrismaClient };

export const prisma: PrismaClient = globalForPrisma.prisma ?? createPrismaClient();

if (process.env.NODE_ENV !== "production") {
  globalForPrisma.prisma = prisma;
}
