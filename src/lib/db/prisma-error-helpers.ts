/**
 * Phân biệt "trùng bản ghi" với mọi lỗi database khác.
 *
 * Tồn tại vì thói quen `catch {}` rồi trả về một câu đoán mò: người dùng thấy
 * "proxy trùng nhãn" trong khi thật ra VAULT_KEY sai định dạng, hoặc file database đang bị khóa.
 * Đoán sai nguyên nhân làm người ta sửa nhầm chỗ hàng giờ.
 */
import { Prisma } from "@prisma/client";

/** P2002 = vi phạm ràng buộc duy nhất, tức là bản ghi đã tồn tại. */
export function isUniqueConstraintError(error: unknown): boolean {
  return error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002";
}

/**
 * Câu chữ cho lỗi KHÔNG phải trùng bản ghi.
 *
 * Ghi nguyên lỗi ra terminal — đây là công cụ chạy trên máy người dùng, terminal đang mở
 * sẵn ngay cạnh, và đó là nơi duy nhất giữ được stack trace.
 */
export function describeUnexpectedDbError(error: unknown, action: string): string {
  console.error(`[db] lỗi khi ${action}:`, error);
  return `Lỗi không mong đợi khi ${action}. Chi tiết nằm ở terminal đang chạy npm run dev.`;
}
