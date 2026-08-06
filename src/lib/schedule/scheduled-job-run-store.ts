/**
 * Sổ ghi "việc theo lịch nào đã quyết tới đâu" — và cũng là chỗ **đòi quyền chạy**.
 *
 * Vì sao hai vai trò gộp làm một: xem chú thích model `ScheduledJobRun` trong `schema.prisma`.
 * Tóm tắt — đòi quyền phải quyết trong MỘT lệnh, không có khe hở giữa "đọc xem hôm nay chạy
 * chưa" và "ghi rằng hôm nay đã chạy". Hai bản sao của app cùng tick lúc 09:00 mà mỗi bản làm
 * hai bước rời thì cả hai đều thấy "chưa chạy" và cả hai đều bắn.
 */
import { hostname } from "node:os";
import { prisma } from "../db/prisma-client";
import { isUniqueConstraintError } from "../db/prisma-error-helpers";

/**
 * Kết cục của một lượt theo lịch.
 *
 * `SKIPPED` phải phân biệt được với "chưa tới lượt" — cùng nguyên tắc với `verdict: ERROR` của
 * bộ dò: *không có tin xấu* không phải là *tin tốt*, đó là *không có tin*.
 */
export type ScheduledRunOutcome = "CLAIMED" | "LAUNCHED" | "SKIPPED";

export interface ScheduledJobRunRecord {
  lastRunAt: Date;
  host: string;
  outcome: string;
  detail: string | null;
}

export function readScheduledJobRun(key: string): Promise<ScheduledJobRunRecord | null> {
  return prisma.scheduledJobRun.findUnique({
    where: { key },
    select: { lastRunAt: true, host: true, outcome: true, detail: true },
  });
}

/**
 * Đòi quyền chạy lượt của mốc hẹn `scheduledFor`. Trả `true` khi giành được.
 *
 * Hai đường, và cả hai đều quyết trong một lệnh của database:
 *  - Hàng đã có → `updateMany` kèm điều kiện `lastRunAt < scheduledFor`. Bản nào tới sau thấy
 *    điều kiện không còn đúng nên đổi được 0 hàng.
 *  - Hàng chưa có → `create`, và khóa chính chặn bản thứ hai.
 *
 * Ghi `lastRunAt = now` NGAY LÚC ĐÒI, trước khi biết lượt đó có chạy được không — cố ý, xem chú
 * thích cột `lastRunAt`.
 */
export async function claimScheduledRun(options: {
  key: string;
  scheduledFor: Date;
  now: Date;
  host?: string;
}): Promise<boolean> {
  const { key, scheduledFor, now, host = hostname() } = options;
  const mine = { lastRunAt: now, host, outcome: "CLAIMED" satisfies ScheduledRunOutcome };

  const { count } = await prisma.scheduledJobRun.updateMany({
    where: { key, lastRunAt: { lt: scheduledFor } },
    data: { ...mine, detail: null },
  });
  if (count === 1) return true;

  // Đổi được 0 hàng nghĩa là MỘT TRONG HAI: hàng chưa tồn tại, hoặc hàng đã ở lượt hôm nay. Thử
  // tạo là phân biệt được cả hai mà không cần thêm một lượt đọc — tạo thành công là vế đầu, đụng
  // khóa chính là vế sau.
  try {
    await prisma.scheduledJobRun.create({ data: { key, ...mine } });
    return true;
  } catch (error) {
    if (!isUniqueConstraintError(error)) throw error;
    return false;
  }
}

/**
 * Ghi lại chuyện gì đã xảy ra sau khi đã giành được quyền chạy.
 *
 * Chỉ gọi khi `claimScheduledRun` trả `true`: lúc đó hàng chắc chắn là của mình cho tới mốc hẹn
 * kế tiếp, nên ghi đè thẳng không cần điều kiện.
 */
export async function recordScheduledRunOutcome(
  key: string,
  outcome: ScheduledRunOutcome,
  detail: string,
): Promise<void> {
  await prisma.scheduledJobRun.update({ where: { key }, data: { outcome, detail } });
}
