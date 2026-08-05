/**
 * Khóa chặn hai lượt dò chạy chồng nhau.
 *
 * Vì sao cần: cả kiến trúc bộ dò xoay quanh việc nghỉ ngẫu nhiên 30-90 giây giữa các nick, để
 * proxy quan sát viên không lộ ra là máy. Hai lượt chạy chồng nhau phá đúng thứ đó — request
 * từ cùng một IP dồn lại trong khoảng ngắn, đúng khuôn mẫu mà giãn cách sinh ra để tránh.
 * Bộ dò tự làm mình bị chặn, rồi trả ERROR cho mọi nick trong khi nhìn vẫn như đang chạy đều.
 *
 * ## Vì sao là một HÀNG trong database, không phải file
 *
 * Bản trước là file `data/health-check.lock`, và nó chặn đúng **hai tiến trình trên cùng một
 * máy** — `npm run health` chạy ở tiến trình riêng chứ không trong web app, nên khóa trong bộ
 * nhớ không thấy lượt chạy theo lịch.
 *
 * Từ GĐ5 điều kiện đó không còn đúng: cron chạy trên Railway, nút "Dò cả đàn" chạy trong web
 * app, và một dev vẫn có thể gõ `npm run health` ở máy mình trỏ vào cùng database. Ba nơi,
 * ba hệ thống tệp khác nhau, không nơi nào thấy file của nơi kia — khóa file im lặng mất tác
 * dụng đúng vào lúc nó bắt đầu cần thiết. Database là thứ duy nhất cả ba đều nhìn thấy.
 *
 * Chi tiết vì sao chọn một hàng thay vì advisory lock của Postgres: xem chú thích của model
 * `HealthCheckLock` trong `prisma/schema.prisma`. Tóm tắt: advisory lock không mang được dữ
 * liệu "ai đang giữ", và nó hỏng MỞ khi connection bị cắt giữa chừng.
 */
import { randomUUID } from "node:crypto";
import { hostname } from "node:os";
import { prisma } from "../db/prisma-client";
import { isUniqueConstraintError } from "../db/prisma-error-helpers";

/** Khóa của hàng duy nhất trong bảng. */
export const HEALTH_CHECK_LOCK_KEY = "health-check";

/**
 * Quá ngần này thì coi như khóa mồ côi và giành lấy.
 *
 * Một lượt 8 nick nghỉ tối đa 90 giây mỗi lần mất chưa tới 15 phút, nên 30 phút là dư. Cần
 * ngưỡng này vì tiến trình bị tắt ngang (Ctrl+C, mất điện, Railway thay container) sẽ để lại
 * hàng không ai dọn — và một bộ dò tự khóa mình vĩnh viễn thì cũng mù y như bị Reddit chặn.
 */
export const STALE_AFTER_MS = 30 * 60_000;

export class HealthCheckBusyError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "HealthCheckBusyError";
  }
}

export interface HeldLock {
  release(): Promise<void>;
}

export interface HealthCheckLockStatus {
  running: boolean;
  /** Máy đang giữ khóa. `null` khi không có lượt nào đang chạy. */
  host: string | null;
  pid: number | null;
  startedAt: Date | null;
  /** Đã chạy bao lâu, tính bằng phút. `null` khi không có lượt nào đang chạy. */
  minutesElapsed: number | null;
}

const NOT_RUNNING: HealthCheckLockStatus = {
  running: false,
  host: null,
  pid: null,
  startedAt: null,
  minutesElapsed: null,
};

interface LockRow {
  token: string;
  host: string;
  pid: number;
  startedAt: Date;
}

function readLock(): Promise<LockRow | null> {
  return prisma.healthCheckLock.findUnique({
    where: { key: HEALTH_CHECK_LOCK_KEY },
    select: { token: true, host: true, pid: true, startedAt: true },
  });
}

function minutesSince(startedAt: Date, now: Date): number {
  return Math.max(0, Math.round((now.getTime() - startedAt.getTime()) / 60_000));
}

function isStale(row: LockRow, now: Date): boolean {
  return now.getTime() - row.startedAt.getTime() > STALE_AFTER_MS;
}

/**
 * ĐỌC khóa mà không giành nó — để giao diện biết có lượt nào đang chạy không.
 *
 * Hỏi bằng cách giành thử rồi thả ra là sai: giữa hai bước đó lượt chạy theo lịch có thể bị
 * chen mất khóa.
 *
 * Khóa quá `STALE_AFTER_MS` thì coi như KHÔNG chạy, dùng đúng ngưỡng của `acquire` — hai ngưỡng
 * riêng cho cùng một khái niệm là hai thứ sớm muộn cũng lệch nhau.
 */
export async function readHealthCheckLockStatus(
  options: { now?: Date } = {},
): Promise<HealthCheckLockStatus> {
  const { now = new Date() } = options;

  const holder = await readLock();
  if (!holder) return NOT_RUNNING;

  // Giữ lại `host`/`pid` của hàng mồ côi: người đọc muốn biết máy nào bỏ lại nó.
  if (isStale(holder, now)) {
    return { ...NOT_RUNNING, host: holder.host, pid: holder.pid };
  }

  return {
    running: true,
    host: holder.host,
    pid: holder.pid,
    startedAt: holder.startedAt,
    minutesElapsed: minutesSince(holder.startedAt, now),
  };
}

/** Câu mô tả người đang giữ khóa, dùng trong thông báo bận. */
export function describeLockHolder(holder: LockRow, now: Date): string {
  return `máy ${holder.host}, tiến trình ${holder.pid}, bắt đầu ${minutesSince(holder.startedAt, now)} phút trước`;
}

const BUSY_HINT =
  "Hai lượt chạy chồng nhau làm proxy quan sát viên bắn request dồn dập và bị Reddit chặn.";

/**
 * Giành khóa, hoặc ném `HealthCheckBusyError` nếu lượt khác đang chạy.
 *
 * Trả về đối tượng có `release()` — LUÔN gọi nó trong khối `finally`.
 */
export async function acquireHealthCheckLock(
  options: { now?: Date } = {},
): Promise<HeldLock> {
  const { now = new Date() } = options;
  const token = randomUUID();
  const mine = {
    key: HEALTH_CHECK_LOCK_KEY,
    token,
    host: hostname(),
    pid: process.pid,
    startedAt: now,
  };

  try {
    await prisma.healthCheckLock.create({ data: mine });
  } catch (error) {
    // Bất kỳ lỗi nào khác trùng khóa chính đều là lỗi thật (mất kết nối, schema lệch) — ném
    // tiếp. Nuốt hết ở đây là biến "database hỏng" thành "đang bận", và người đi sửa sẽ ngồi
    // chờ một lượt chạy không tồn tại.
    if (!isUniqueConstraintError(error)) throw error;

    const holder = await readLock();

    // Hàng vừa biến mất giữa hai lời gọi: chủ cũ thả khóa đúng lúc này. Thử lại một lần.
    if (!holder) return retryAfterClearing(mine);

    if (!isStale(holder, now)) {
      throw new HealthCheckBusyError(
        `Đang có một lượt dò chạy dở (${describeLockHolder(holder, now)}). ` +
          `Chờ nó xong rồi thử lại. ${BUSY_HINT}`,
      );
    }

    // Khóa mồ côi: chủ cũ chết mà không dọn. Xóa ĐÚNG hàng mồ côi đó — đối chiếu `token`, nên
    // nếu một tiến trình khác vừa giành được trong khe này thì token đã khác và lệnh xóa không
    // chạm gì cả. Lượt tạo bên dưới sẽ đụng khóa chính và ta báo bận, đúng như mong muốn.
    await prisma.healthCheckLock.deleteMany({
      where: { key: HEALTH_CHECK_LOCK_KEY, token: holder.token },
    });

    return retryAfterClearing(mine);
  }

  return heldLock(token);
}

/** Lượt tạo thứ hai, sau khi đã dọn hàng mồ côi hoặc thấy nó tự biến mất. */
async function retryAfterClearing(mine: {
  key: string;
  token: string;
  host: string;
  pid: number;
  startedAt: Date;
}): Promise<HeldLock> {
  try {
    await prisma.healthCheckLock.create({ data: mine });
  } catch (error) {
    if (!isUniqueConstraintError(error)) throw error;
    throw new HealthCheckBusyError(
      `Một lượt dò khác vừa giành khóa trước. Thử lại sau ít phút. ${BUSY_HINT}`,
    );
  }

  return heldLock(mine.token);
}

function heldLock(token: string): HeldLock {
  return {
    async release() {
      // Xóa theo `token`, tức chỉ xóa khóa của CHÍNH MÌNH, và quyết trong một lệnh. Bản khóa
      // file phải đọc rồi so rồi mới xóa — ba bước, và giữa chúng có khe cho người khác chen
      // vào giành khóa rồi bị ta xóa mất.
      await prisma.healthCheckLock.deleteMany({
        where: { key: HEALTH_CHECK_LOCK_KEY, token },
      });
    },
  };
}
