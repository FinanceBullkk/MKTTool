/**
 * Khóa chặn hai lượt dò chạy chồng nhau.
 *
 * Vì sao cần: cả kiến trúc bộ dò xoay quanh việc nghỉ ngẫu nhiên 30-90 giây giữa các nick, để
 * proxy quan sát viên không lộ ra là máy. Hai lượt chạy chồng nhau phá đúng thứ đó — request
 * từ cùng một IP dồn lại trong khoảng ngắn, đúng khuôn mẫu mà giãn cách sinh ra để tránh.
 * Bộ dò tự làm mình bị chặn, rồi trả ERROR cho mọi nick trong khi nhìn vẫn như đang chạy đều.
 *
 * Vì sao là FILE chứ không phải biến trong bộ nhớ: `npm run health` chạy ở tiến trình RIÊNG,
 * không phải trong web app. Khóa trong bộ nhớ chỉ chặn được hai lời gọi API cùng lúc, hoàn
 * toàn không thấy lượt chạy theo lịch — mà đó mới là cặp dễ đụng nhau nhất (lịch chạy 3 giờ
 * sáng trong khi người dùng bấm nút).
 */
import { closeSync, mkdirSync, openSync, readFileSync, unlinkSync, writeSync } from "node:fs";
import path from "node:path";

export const LOCK_PATH = path.join("data", "health-check.lock");

/**
 * Quá ngần này thì coi như khóa mồ côi và giành lấy.
 *
 * Một lượt 8 nick nghỉ tối đa 90 giây mỗi lần mất chưa tới 15 phút, nên 30 phút là dư. Cần
 * ngưỡng này vì tiến trình bị tắt ngang (Ctrl+C, mất điện) sẽ để lại khóa không ai dọn — và
 * một bộ dò tự khóa mình vĩnh viễn thì cũng mù y như bị Reddit chặn.
 */
export const STALE_AFTER_MS = 30 * 60_000;

export class HealthCheckBusyError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "HealthCheckBusyError";
  }
}

interface LockBody {
  pid: number;
  startedAt: string;
}

export interface HeldLock {
  release(): void;
}

function readLock(lockPath: string): LockBody | null {
  try {
    const parsed = JSON.parse(readFileSync(lockPath, "utf8")) as Partial<LockBody>;
    if (typeof parsed?.pid !== "number" || typeof parsed?.startedAt !== "string") return null;
    return { pid: parsed.pid, startedAt: parsed.startedAt };
  } catch {
    // Không đọc được hoặc nội dung hỏng — coi như khóa rác, để bên gọi giành lấy.
    return null;
  }
}

function writeLock(lockPath: string, body: LockBody): void {
  // Cờ "wx" là mấu chốt: tạo file và NÉM LỖI nếu đã tồn tại, trong một thao tác duy nhất của
  // hệ điều hành. Kiểu "kiểm tra tồn tại rồi mới ghi" có khe hở giữa hai bước, và khe đó đúng
  // bằng lúc hai tiến trình cùng nghĩ mình là người đầu tiên.
  const handle = openSync(lockPath, "wx");
  try {
    writeSync(handle, JSON.stringify(body));
  } finally {
    closeSync(handle);
  }
}

function describeHolder(holder: LockBody, now: Date): string {
  const minutes = Math.max(0, Math.round((now.getTime() - Date.parse(holder.startedAt)) / 60_000));
  return `tiến trình ${holder.pid}, bắt đầu ${minutes} phút trước`;
}

/**
 * Giành khóa, hoặc ném `HealthCheckBusyError` nếu lượt khác đang chạy.
 *
 * Trả về đối tượng có `release()` — LUÔN gọi nó trong khối `finally`.
 */
export function acquireHealthCheckLock(
  options: { lockPath?: string; now?: Date } = {},
): HeldLock {
  const { lockPath = LOCK_PATH, now = new Date() } = options;
  const body: LockBody = { pid: process.pid, startedAt: now.toISOString() };
  const token = JSON.stringify(body);

  mkdirSync(path.dirname(lockPath), { recursive: true });

  try {
    writeLock(lockPath, body);
  } catch {
    const holder = readLock(lockPath);
    const startedAt = holder ? Date.parse(holder.startedAt) : Number.NaN;
    const isStale = !holder || !Number.isFinite(startedAt) || now.getTime() - startedAt > STALE_AFTER_MS;

    if (!isStale) {
      throw new HealthCheckBusyError(
        `Đang có một lượt dò chạy dở (${describeHolder(holder, now)}). Chờ nó xong rồi thử lại. ` +
          `Hai lượt chạy chồng nhau làm proxy quan sát viên bắn request dồn dập và bị Reddit chặn.`,
      );
    }

    // Khóa mồ côi: chủ cũ chết mà không dọn. Xóa rồi giành lại — nếu giữa hai bước có tiến
    // trình khác chen vào giành được, lần ghi này ném lỗi và ta báo bận, đúng như mong muốn.
    try {
      unlinkSync(lockPath);
    } catch {
      // Người khác vừa xóa trước. Không sao, bước ghi dưới đây quyết định ai thắng.
    }

    try {
      writeLock(lockPath, body);
    } catch {
      throw new HealthCheckBusyError(
        "Một lượt dò khác vừa giành khóa trước. Thử lại sau ít phút.",
      );
    }
  }

  return {
    release() {
      // Chỉ xóa khóa của CHÍNH MÌNH. Nếu khóa đã bị người khác giành sau một lượt dọn mồ côi,
      // xóa bừa là kéo theo lượt chạy của họ mất khóa giữa chừng.
      try {
        if (readFileSync(lockPath, "utf8") === token) unlinkSync(lockPath);
      } catch {
        // Khóa đã biến mất hoặc không đọc được — không còn gì để dọn.
      }
    },
  };
}
