/**
 * Nhận diện màn hình chặn đường: checkpoint, captcha, tài khoản bị khóa.
 *
 * Hàm thuần trên (url + html) nên test được mà không cần mạng, và dùng lại được ở Phase 05
 * khi lái trình duyệt đã đăng nhập.
 *
 * ── Phân biệt quan trọng nhất của file này ──
 * Bộ dò mở trang profile công khai ở chế độ CHƯA đăng nhập. Ở đó có hai loại màn hình chặn
 * hoàn toàn khác nhau, và gộp chúng làm một là sai nguy hiểm:
 *
 *  • `ACCOUNT` — trang nói về chính nick: bị khóa, bị cấm, phải xác minh lại.
 *    Đây là tin về nick → đáng cách ly nick.
 *  • `PROBE` — trang nói về NGƯỜI ĐANG XEM: captcha, "too many requests", IP bị chặn.
 *    Đây là tin về proxy quan sát viên → chỉ có nghĩa là lần dò này không kết luận được gì.
 *
 * Coi captcha của proxy là checkpoint của nick thì mỗi lần Reddit bóp proxy quan sát viên là
 * cả đàn nick khỏe bị cách ly cùng lúc — hỏng đúng theo kiểu khiến người ta tắt cảnh báo đi.
 */

/** Ai đang bị chặn: chính nick, hay người đang đứng nhìn nick. */
export type CheckpointScope = "ACCOUNT" | "PROBE";

export interface CheckpointSignal {
  scope: CheckpointScope;
  /** Câu tiếng Việt nói rõ bắt được gì, đi thẳng vào `HealthCheck.detail`. */
  reason: string;
}

interface Pattern {
  scope: CheckpointScope;
  reason: string;
  /** So trên chuỗi đã hạ chữ thường. Chọn cụm dài để tránh khớp nhầm chữ lẻ. */
  needles: readonly string[];
}

/** Đường dẫn mà nền tảng chỉ dùng cho màn hình chặn. So trên pathname đã hạ chữ thường. */
const BLOCKING_PATHS: readonly { path: string; scope: CheckpointScope; reason: string }[] = [
  { path: "/checkpoint", scope: "ACCOUNT", reason: "Nền tảng chuyển sang màn hình checkpoint." },
  { path: "/quarantine", scope: "ACCOUNT", reason: "Nội dung bị đưa vào diện cách ly." },
  { path: "/suspended", scope: "ACCOUNT", reason: "Nền tảng báo tài khoản bị treo." },
  { path: "/challenge", scope: "PROBE", reason: "Nền tảng bắt người xem qua màn hình thử thách." },
];

const PATTERNS: readonly Pattern[] = [
  {
    scope: "ACCOUNT",
    reason: "Trang profile báo tài khoản đã bị treo.",
    needles: [
      "this account has been suspended",
      "your account has been suspended",
      "account has been permanently suspended",
      "tài khoản đã bị tạm khóa",
    ],
  },
  {
    scope: "ACCOUNT",
    reason: "Nền tảng đòi xác minh lại danh tính hoặc email trước khi cho xem.",
    needles: [
      "verify your email address to continue",
      "we need to confirm it's you",
      "upload a photo of your id",
      "confirm your identity",
    ],
  },
  {
    scope: "PROBE",
    reason: "Bị chắn bằng captcha — proxy quan sát viên đang bị nghi, không phải nick.",
    // CỐ Ý không có "recaptcha" và "g-recaptcha": đo 03/08/2026 thì MỌI trang old.reddit.com
    // đều nhúng script reCAPTCHA cho ô đăng nhập ở sidebar, kể cả trang profile bình thường.
    // Để hai cụm đó ở đây là bộ dò báo "bị captcha" cho mọi nick, mọi lần — tức là mù hoàn toàn
    // mà vẫn trông như đang chạy. Chỉ giữ những nhà cung cấp thật sự vắng mặt trên trang thường.
    needles: [
      "funcaptcha",
      "arkoselabs",
      "arkose-labs",
      "hcaptcha",
      "verify you are human",
      "i'm not a robot",
    ],
  },
  {
    scope: "PROBE",
    reason: "Bị chặn vì gọi quá nhiều — giãn lịch dò hoặc đổi proxy quan sát viên.",
    needles: [
      "too many requests",
      "you've been blocked by network security",
      "whoa there, pardner",
      "rate limit exceeded",
      "access denied",
    ],
  },
];

/**
 * Trả về tín hiệu đầu tiên bắt được, `null` nếu trang trông bình thường.
 *
 * Thứ tự có chủ ý: đường dẫn trước (chắc chắn nhất), rồi mới tới nội dung trang.
 */
export function detectCheckpoint(input: { url: string; html: string }): CheckpointSignal | null {
  const haystack = input.html.toLowerCase();

  let pathname = "";
  try {
    pathname = new URL(input.url).pathname.toLowerCase();
  } catch {
    // URL rác thì bỏ qua bước này, vẫn soi được nội dung trang.
  }

  for (const candidate of BLOCKING_PATHS) {
    if (pathname.includes(candidate.path)) {
      return { scope: candidate.scope, reason: candidate.reason };
    }
  }

  for (const pattern of PATTERNS) {
    if (pattern.needles.some((needle) => haystack.includes(needle))) {
      return { scope: pattern.scope, reason: pattern.reason };
    }
  }

  return null;
}
