/**
 * Múi giờ chuẩn của cả team — thứ quyết định "hôm nay" bắt đầu và kết thúc lúc nào.
 *
 * Vì sao phải có: `setHours(0,0,0,0)` cắt ngày theo giờ CỦA MÁY ĐANG CHẠY. Khi công cụ còn
 * chạy trên đúng một máy thì không ai thấy gì. Có người thứ hai ngồi múi giờ khác là cùng
 * một job cho ra hai kết quả khác nhau: luật hạn mức ngày đếm sang ngày khác, cold-start
 * hết sớm hoặc muộn hơn vài tiếng. Và không có gì báo rằng nó vừa lệch — đó mới là phần tệ.
 *
 * Nên mọi phép cắt ngày và mọi chuỗi ngày giờ hiển thị đều đi qua đây. Không ai được gọi
 * `setHours` / `getHours` / `toLocaleDateString` trực tiếp nữa; có test chặn tái phạm ở
 * `machine-clock-ban.test.ts`.
 *
 * Thiếu biến thì **ném lỗi ngay**, không lặng lẽ lùi về giờ máy: lùi về im lặng đúng là
 * kiểu hỏng mà module này sinh ra để diệt.
 */

export class TeamTimezoneError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "TeamTimezoneError";
  }
}

/** Giờ trên đồng hồ treo tường tại một múi giờ — không mang thông tin múi giờ trong nó. */
export interface WallClock {
  year: number;
  month: number;
  day: number;
  hour: number;
  minute: number;
  second: number;
}

/**
 * Kiểm tên múi giờ. Tách khỏi `loadTeamTimezone` để test được mà không đụng `process.env`,
 * cùng kiểu với `parseVaultKey`.
 */
export function parseTeamTimezone(raw: string | undefined): string {
  if (!raw || raw.trim() === "") {
    throw new TeamTimezoneError(
      'Thiếu TEAM_TIMEZONE. Thêm `TEAM_TIMEZONE="Asia/Ho_Chi_Minh"` vào .env rồi khởi động lại.\n' +
        "Không có biến này thì mỗi máy cắt ngày theo giờ của chính nó, và bộ luật ra kết quả " +
        "khác nhau tùy ai mở — sai lặng lẽ, không có thông báo nào.",
    );
  }

  const timeZone = raw.trim();
  try {
    // Tên múi giờ sai thì hàm dựng ném RangeError — mượn luôn làm phép kiểm.
    new Intl.DateTimeFormat("en-US", { timeZone });
  } catch {
    throw new TeamTimezoneError(
      `TEAM_TIMEZONE "${timeZone}" không phải tên múi giờ IANA hợp lệ. ` +
        "Đúng phải có dạng vùng/thành phố, ví dụ Asia/Ho_Chi_Minh.",
    );
  }
  return timeZone;
}

/** Cache sau lần đọc đầu — mỗi lượt chấm luật gọi hàm ngày tháng hàng chục lần. */
let cachedTimezone: string | null = null;

export function loadTeamTimezone(): string {
  if (cachedTimezone) return cachedTimezone;
  cachedTimezone = parseTeamTimezone(process.env.TEAM_TIMEZONE);
  return cachedTimezone;
}

/** Xóa cache — chỉ dùng trong test. */
export function resetTeamTimezoneCache(): void {
  cachedTimezone = null;
}

/**
 * Dựng `Intl.DateTimeFormat` một lần cho mỗi múi giờ.
 *
 * Dùng Intl ở đây là để ĐỔI MÚI GIỜ, không phải để định dạng: các phần số lấy ra rồi tự ghép
 * chuỗi ở `vietnamese-date-format.ts`. Nên chuyện bản ICU này đổi dấu phân cách hay thứ tự
 * ngày/tháng so với bản kia không chạm tới kết quả.
 */
const formatterCache = new Map<string, Intl.DateTimeFormat>();

function wallClockFormatter(timeZone: string): Intl.DateTimeFormat {
  const cached = formatterCache.get(timeZone);
  if (cached) return cached;

  const formatter = new Intl.DateTimeFormat("en-US", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    // `hourCycle: "h23"` chứ không phải `hour12: false`: vài bản ICU trả giờ 24 cho nửa đêm
    // khi dùng hour12, và 24 giờ thì mọi phép so sánh sau đó lệch một ngày.
    hourCycle: "h23",
  });
  formatterCache.set(timeZone, formatter);
  return formatter;
}

/** Một mốc thời gian tuyệt đối nhìn từ múi giờ đã cho. */
export function wallClockIn(date: Date, timeZone: string): WallClock {
  const parts = wallClockFormatter(timeZone).formatToParts(date);
  const read = (type: Intl.DateTimeFormatPartTypes): number => {
    const part = parts.find((item) => item.type === type);
    return part ? Number(part.value) : 0;
  };

  return {
    year: read("year"),
    month: read("month"),
    day: read("day"),
    hour: read("hour"),
    minute: read("minute"),
    second: read("second"),
  };
}

/** Độ lệch của múi giờ so với UTC tại đúng mốc đó, tính bằng mili giây. */
function offsetAt(date: Date, timeZone: string): number {
  const wall = wallClockIn(date, timeZone);
  const asUtc = Date.UTC(wall.year, wall.month - 1, wall.day, wall.hour, wall.minute, wall.second);
  // Bỏ phần mili giây của mốc gốc: đồng hồ treo tường không mang mili giây.
  return asUtc - (date.getTime() - date.getMilliseconds());
}

/**
 * Chiều ngược lại: giờ treo tường ở múi giờ đã cho → mốc thời gian tuyệt đối.
 *
 * Phải đoán rồi hiệu chỉnh chứ không trừ thẳng một lần: mốc đoán có thể rơi sang phía bên kia
 * của một lần đổi giờ mùa hè, lúc đó độ lệch dùng để trừ không phải độ lệch đúng.
 * `Asia/Ho_Chi_Minh` không có đổi giờ nên vòng thứ hai hôm nay luôn thừa — nhưng nó là thứ
 * giữ cho hàm này còn đúng nếu sau này team đổi sang một múi giờ có đổi giờ.
 */
export function instantFromWallClock(wall: WallClock, timeZone: string): Date {
  const naive = Date.UTC(wall.year, wall.month - 1, wall.day, wall.hour, wall.minute, wall.second);
  const firstGuess = new Date(naive - offsetAt(new Date(naive), timeZone));
  return new Date(naive - offsetAt(firstGuess, timeZone));
}
