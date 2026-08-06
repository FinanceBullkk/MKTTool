/**
 * Quyết định "đã tới lượt chạy hôm nay chưa" — hàm thuần, không đụng database, không đọc đồng hồ.
 *
 * ## Vì sao bộ lịch nằm trong app, không phải cron của hãng
 *
 * Railway (và phần lớn hãng) chỉ nhận biểu thức cron theo **giờ UTC**. Mà giờ hẹn của dự án này
 * phải theo `TEAM_TIMEZONE` — cùng biến quyết định "hôm nay" của luật hạn mức ngày và cold-start.
 * Khai bằng cron UTC nghĩa là **cùng một giờ hẹn nằm ở hai nơi**: biến môi trường của app, và một
 * chuỗi `0 2 * * *` trong bảng điều khiển của hãng. Đổi múi giờ team mà quên sửa chuỗi kia thì bộ
 * dò chạy sai giờ và **không có gì báo** — đúng họ hỏng mà cả dự án đang tránh (`pg_dump` lệch
 * major, luật firewall WebRTC hết tác dụng).
 *
 * Thêm hai lẽ nữa: cron là cấu hình riêng của từng hãng, mà QĐ 9 đòi cùng một `Dockerfile` chạy
 * được ở Render/Fly; và cron của Railway đòi dựng một dịch vụ thứ hai, tức deploy thêm một bản
 * ảnh 4.86 GB để chạy mười phút mỗi ngày.
 *
 * ## Vì sao "HH:MM" chứ không phải biểu thức cron
 *
 * Biểu thức cron hứa hẹn thứ dự án cố ý không muốn: chạy nhiều lần một ngày. `run-health-check.ts`
 * nói thẳng lý do — *dò mỗi giờ không cho thêm thông tin gì mà lại biến chính bộ dò thành thứ
 * đáng ngờ*. `HH:MM` làm điều đó **không khai được**, thay vì khai được rồi dựa vào việc không ai
 * khai. Đổi lại còn khỏi một bộ phân tích cron.
 */
import { instantFromWallClock, wallClockIn } from "../format/team-timezone";

export class DailyScheduleError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "DailyScheduleError";
  }
}

/** Giờ hẹn trên đồng hồ treo tường của múi giờ team. */
export interface TimeOfDay {
  hour: number;
  minute: number;
}

const TIME_PATTERN = /^(\d{1,2}):(\d{2})$/;

/**
 * Đọc giờ hẹn từ một chuỗi biến môi trường.
 *
 * - Vắng mặt / để trống → `null`, nghĩa là **tắt lịch**. Đây là mặc định, và nó cố ý: máy dev nào
 *   cũng trỏ vào một database thật, nên một bộ lịch tự bật sẵn là mỗi lập trình viên mở máy lại
 *   bắn một lượt dò tiêu quota proxy quan sát viên.
 * - Có mặt nhưng sai dạng → **ném lỗi**. Không lặng lẽ coi như tắt: người gõ `9h00` vào biến này
 *   đang muốn bật lịch, và im lặng nuốt lỗi đúng là cách để họ tin rằng nó đang chạy.
 */
export function readDailyScheduleTime(raw: string | undefined): TimeOfDay | null {
  if (raw === undefined || raw.trim() === "") return null;

  const match = TIME_PATTERN.exec(raw.trim());
  if (!match) {
    throw new DailyScheduleError(
      `Giờ hẹn "${raw}" không đúng dạng. Phải là HH:MM theo giờ team, ví dụ "09:00".`,
    );
  }

  const hour = Number(match[1]);
  const minute = Number(match[2]);
  if (hour > 23 || minute > 59) {
    throw new DailyScheduleError(
      `Giờ hẹn "${raw}" nằm ngoài một ngày. Giờ 0-23, phút 0-59, ví dụ "09:00".`,
    );
  }

  return { hour, minute };
}

/** Dạng để hiện lên màn hình và ghi vào log — luôn hai chữ số. */
export function formatTimeOfDay(at: TimeOfDay): string {
  return `${String(at.hour).padStart(2, "0")}:${String(at.minute).padStart(2, "0")}`;
}

/**
 * Mốc tuyệt đối của giờ hẹn TRONG NGÀY mà `now` đang thuộc về, tính theo múi giờ team.
 *
 * Đi qua `wallClockIn` rồi `instantFromWallClock` chứ không cộng trừ độ lệch: hai hàm đó đã lo
 * phần đổi giờ mùa hè, và `Asia/Ho_Chi_Minh` không có đổi giờ hôm nay không có nghĩa là múi giờ
 * team sẽ không bao giờ đổi.
 */
export function scheduledInstantFor(now: Date, timeZone: string, at: TimeOfDay): Date {
  const today = wallClockIn(now, timeZone);
  return instantFromWallClock(
    { ...today, hour: at.hour, minute: at.minute, second: 0 },
    timeZone,
  );
}

export type DailyRunVerdict = "RUN" | "TOO_EARLY" | "ALREADY_DECIDED";

export interface DailyRunDecision {
  verdict: DailyRunVerdict;
  /** Mốc hẹn của hôm nay. Cũng là mốc dùng để đòi quyền chạy, nên hai bên luôn nói cùng một số. */
  scheduledFor: Date;
  /** Câu giải thích cho log và cho trang Sức khỏe. */
  reason: string;
}

/**
 * Có nên bắn lượt dò ngay bây giờ không.
 *
 * `lastRunAt` là mốc bộ lịch **quyết** cho lượt gần nhất, không phải mốc lượt dò kết thúc — xem
 * chú thích của model `ScheduledJobRun`.
 *
 * Bắt kịp lượt đã lỡ là **có chủ ý**: app tắt suốt từ 08:00 tới 14:00, bật lại lúc 14:00 với giờ
 * hẹn 09:00 thì nó chạy ngay, chứ không bỏ hẳn ngày hôm đó. Một lượt dò trễ vẫn trả lời được câu
 * "bài của nick còn hiện với người ngoài không"; bỏ hẳn thì không. Và nó chỉ bắt kịp MỘT lượt dù
 * lỡ mấy ngày, vì mốc hẹn luôn tính theo ngày của `now`.
 */
export function decideDailyRun(input: {
  now: Date;
  timeZone: string;
  at: TimeOfDay;
  lastRunAt: Date | null;
}): DailyRunDecision {
  const { now, timeZone, at, lastRunAt } = input;
  const scheduledFor = scheduledInstantFor(now, timeZone, at);
  const clock = formatTimeOfDay(at);

  if (now.getTime() < scheduledFor.getTime()) {
    return {
      verdict: "TOO_EARLY",
      scheduledFor,
      reason: `Chưa tới giờ hẹn ${clock} của hôm nay.`,
    };
  }

  if (lastRunAt !== null && lastRunAt.getTime() >= scheduledFor.getTime()) {
    return {
      verdict: "ALREADY_DECIDED",
      scheduledFor,
      reason: `Lượt ${clock} của hôm nay đã quyết xong rồi.`,
    };
  }

  return {
    verdict: "RUN",
    scheduledFor,
    reason: `Tới lượt ${clock} của hôm nay.`,
  };
}
