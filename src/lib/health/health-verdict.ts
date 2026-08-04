/**
 * Kết luận của một lần dò sức khỏe nick, và cách hiển thị nó.
 *
 * Sáu kết luận, và hai trong số đó tồn tại chỉ để bộ dò nói được câu "tôi không biết":
 *
 *  • `ERROR` — bộ dò KHÔNG chạy được. Reddit đổi HTML, proxy quan sát viên chết.
 *  • `NO_BASELINE` — bộ dò chạy ngon nhưng KHÔNG CÓ GÌ ĐỂ SO, vì chưa bài nào được đánh dấu
 *    đã đăng trong cửa sổ quan sát.
 *
 * Hai cái này khác nhau về nguyên nhân nhưng giống nhau ở chỗ quan trọng nhất: cả hai đều
 * KHÔNG phải "khỏe". Một hệ thống cảnh báo hỏng thầm lặng còn tệ hơn không có hệ thống cảnh
 * báo — vì lúc đó người ta tin nó.
 */
import type { AccountStatus } from "@/lib/accounts/account-status";

export const HEALTH_VERDICTS = [
  "CHECKPOINT",
  "SHADOWBANNED",
  "ERROR",
  "WARN",
  "UNTRACKED_POSTS",
  "NO_BASELINE",
  "HEALTHY",
] as const;

export type HealthVerdict = (typeof HEALTH_VERDICTS)[number];

interface VerdictPresentation {
  label: string;
  /**
   * Nhỏ hơn = cần chú ý hơn. Sắp xếp tăng dần là nick có vấn đề nổi lên đầu bảng.
   * Cùng chiều với `severity` của account-status.ts để hai bảng sắp xếp giống nhau.
   */
  severity: number;
  className: string;
  hint: string;
}

export const VERDICT_PRESENTATION: Record<HealthVerdict, VerdictPresentation> = {
  CHECKPOINT: {
    label: "Dính checkpoint",
    severity: 0,
    className: "bg-red-100 text-red-800 dark:bg-red-950 dark:text-red-300",
    hint: "Nền tảng đang chặn đường vào. Xử lý tay, KHÔNG tự giải captcha.",
  },
  SHADOWBANNED: {
    label: "Bị ẩn",
    severity: 1,
    className: "bg-orange-100 text-orange-800 dark:bg-orange-950 dark:text-orange-300",
    hint: "Người ngoài không thấy bài của nick này. Dừng đăng ngay.",
  },
  ERROR: {
    label: "Không dò được",
    severity: 2,
    className: "bg-purple-100 text-purple-800 dark:bg-purple-950 dark:text-purple-300",
    hint: "Chưa biết nick khỏe hay không — đọc lý do rồi sửa bộ dò, đừng coi là khỏe.",
  },
  WARN: {
    label: "Nghi ngờ",
    severity: 3,
    className: "bg-amber-100 text-amber-800 dark:bg-amber-950 dark:text-amber-300",
    hint: "Thấy ít bài hơn số đã đăng. Theo dõi thêm vài ngày trước khi kết luận.",
  },
  UNTRACKED_POSTS: {
    label: "Có bài chưa ghi",
    severity: 4,
    className: "bg-sky-100 text-sky-800 dark:bg-sky-950 dark:text-sky-300",
    hint: "Người ngoài thấy bài mà kho không có. Bộ luật đang đếm thiếu — vào /queue ghi lại.",
  },
  NO_BASELINE: {
    label: "Chưa đối chiếu được",
    severity: 5,
    className: "bg-slate-200 text-slate-800 dark:bg-slate-800 dark:text-slate-300",
    hint: "Thấy nick, chưa thấy bài nào để so. Nhớ bấm “Đã đăng” sau mỗi lần đăng.",
  },
  HEALTHY: {
    label: "Khỏe",
    severity: 6,
    className: "bg-emerald-100 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-300",
    hint: "Người ngoài nhìn thấy nick và bài của nó bình thường.",
  },
};

export function isHealthVerdict(value: string): value is HealthVerdict {
  return (HEALTH_VERDICTS as readonly string[]).includes(value);
}

export function getVerdictPresentation(verdict: string): VerdictPresentation {
  return isHealthVerdict(verdict) ? VERDICT_PRESENTATION[verdict] : VERDICT_PRESENTATION.ERROR;
}

/**
 * Trạng thái nick mà kết luận này ép sang, hoặc `null` nếu không đụng tới.
 *
 * Chỉ hai kết luận xấu nhất mới đổi trạng thái nick. `WARN` cố ý KHÔNG đổi: thấy ít bài hơn
 * dự kiến có thể chỉ là bài bị mod xóa, và cách ly nhầm một nick khỏe cũng tốn như bỏ sót
 * một nick chết. `ERROR` càng không được đổi — bộ dò đang mù thì nó không biết gì để mà kết luận.
 *
 * `UNTRACKED_POSTS` cũng không đổi, và lý do khác hẳn: nick hoàn toàn khỏe, thứ hỏng là SỔ SÁCH
 * của mình. Cách ly nick vì mình ghi thiếu là phạt nhầm đối tượng — việc phải làm nằm ở /queue.
 */
export function statusForcedBy(verdict: HealthVerdict): AccountStatus | null {
  if (verdict === "CHECKPOINT") return "CHECKPOINT";
  if (verdict === "SHADOWBANNED") return "SHADOWBANNED";
  return null;
}
