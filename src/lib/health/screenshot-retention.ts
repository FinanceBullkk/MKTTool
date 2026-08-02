/**
 * Dọn ảnh chụp màn hình cũ.
 *
 * Bộ dò chỉ giữ ảnh khi kết luận KHÁC "khỏe", nên thư mục không phình nhanh — nhưng nó cũng
 * không bao giờ tự nhỏ lại. Chạy hằng ngày, mỗi nick có vấn đề một ảnh ~300KB, một năm là vài
 * trăm MB nằm im trên máy bạn MKT.
 *
 * Dọn theo DATABASE chứ không quét thư mục: mỗi ảnh bị xóa thì bản ghi trỏ tới nó cũng được
 * gỡ đường dẫn trong cùng một lượt. Quét thư mục thì đĩa sạch mà trang /health vẫn chỉ vào
 * những file không còn tồn tại — người dùng đi tìm rồi tưởng công cụ mất dữ liệu.
 *
 * Bản ghi HealthCheck thì GIỮ NGUYÊN. Lịch sử kết luận là thứ vẽ ra xu hướng karma và cho biết
 * nick chuyển xấu từ lúc nào; ảnh chỉ là bằng chứng kèm theo, hết hạn được.
 */
import { unlinkSync } from "node:fs";
import { prisma } from "@/lib/db/prisma-client";
import { MS_PER_DAY } from "@/lib/format/vietnamese-date-format";

/** Giữ ảnh ngần này ngày. Đủ dài để soi lại một đợt nick chết, đủ ngắn để không tích thành rác. */
export const SCREENSHOT_RETENTION_DAYS = 30;

export interface PruneResult {
  /** Số file thật sự xóa được khỏi đĩa. */
  deleted: number;
  /** Số bản ghi trỏ tới file đã biến mất từ trước — dọn đường dẫn cho khớp lại. */
  alreadyGone: number;
}

export async function pruneOldScreenshots(
  options: { now?: Date; retentionDays?: number } = {},
): Promise<PruneResult> {
  const { now = new Date(), retentionDays = SCREENSHOT_RETENTION_DAYS } = options;
  const cutoff = new Date(now.getTime() - retentionDays * MS_PER_DAY);

  const stale = await prisma.healthCheck.findMany({
    where: { screenshotPath: { not: null }, checkedAt: { lt: cutoff } },
    select: { id: true, screenshotPath: true },
  });

  let deleted = 0;
  let alreadyGone = 0;

  for (const check of stale) {
    try {
      unlinkSync(check.screenshotPath as string);
      deleted += 1;
    } catch {
      // File đã bị xóa tay, hoặc ổ đĩa từ chối. Vẫn gỡ đường dẫn trong DB: bản ghi trỏ vào
      // khoảng không còn tệ hơn bản ghi không trỏ đi đâu cả.
      alreadyGone += 1;
    }
  }

  if (stale.length > 0) {
    await prisma.healthCheck.updateMany({
      where: { id: { in: stale.map((check) => check.id) } },
      data: { screenshotPath: null },
    });
  }

  return { deleted, alreadyGone };
}
