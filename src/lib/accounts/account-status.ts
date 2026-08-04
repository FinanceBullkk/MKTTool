/**
 * Trạng thái vòng đời của một nick và các quy tắc thao tác đi kèm.
 *
 * Nguyên tắc: gặp captcha/checkpoint nghĩa là nick ĐÃ bị nghi ngờ. Không tự giải,
 * không thao tác tiếp — cách ly và để người xử lý. Tự giải để chui vào tiếp là cách
 * nhanh nhất biến cảnh báo mềm thành khóa vĩnh viễn.
 */

export const ACCOUNT_STATUSES = [
  "COLD_START",
  "ALIVE",
  "CHECKPOINT",
  "SHADOWBANNED",
  "DEAD",
] as const;

export type AccountStatus = (typeof ACCOUNT_STATUSES)[number];

interface StatusPresentation {
  label: string;
  /** Mức độ nghiêm trọng, dùng để sắp xếp: nick có vấn đề đẩy lên đầu danh sách. */
  severity: number;
  className: string;
  /** Có được phép mở profile không. */
  canLaunch: boolean;
  hint: string;
}

export const STATUS_PRESENTATION: Record<AccountStatus, StatusPresentation> = {
  DEAD: {
    label: "Đã chết",
    severity: 0,
    className: "bg-neutral-200 text-neutral-700 dark:bg-neutral-800 dark:text-neutral-400",
    canLaunch: false,
    hint: "Nick không dùng được nữa. Không mở profile.",
  },
  CHECKPOINT: {
    label: "Dính checkpoint",
    severity: 1,
    className: "bg-red-100 text-red-800 dark:bg-red-950 dark:text-red-300",
    canLaunch: false,
    hint: "Nền tảng đang nghi ngờ nick này. Cách ly, người xử lý tay. KHÔNG tự giải captcha.",
  },
  SHADOWBANNED: {
    label: "Bị ẩn",
    severity: 2,
    className: "bg-orange-100 text-orange-800 dark:bg-orange-950 dark:text-orange-300",
    canLaunch: false,
    hint: "Bài đăng không hiện với người ngoài. Dừng đăng, chờ hồi phục.",
  },
  COLD_START: {
    label: "Đang cold-start",
    severity: 3,
    className: "bg-amber-100 text-amber-800 dark:bg-amber-950 dark:text-amber-300",
    canLaunch: true,
    hint: "Chỉ đọc và tương tác nhẹ. Cấm đăng bài, cấm đổi thông tin hồ sơ.",
  },
  ALIVE: {
    label: "Khỏe",
    severity: 4,
    className: "bg-emerald-100 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-300",
    canLaunch: true,
    hint: "Hoạt động bình thường.",
  },
};

export function isAccountStatus(value: string): value is AccountStatus {
  return (ACCOUNT_STATUSES as readonly string[]).includes(value);
}

/**
 * Trạng thái mà `quarantineReason` còn có nghĩa.
 *
 * Nick ở COLD_START hay ALIVE thì KHÔNG bị cách ly, nên một lý do cách ly còn sót lại chỉ là
 * rác của lần trước. Đo thật 04/08/2026: nick `IllBlueberry5395` bị lượt dò đầu tiên cách ly
 * nhầm, người dùng sửa về ALIVE, nhưng lý do cũ nằm lại — trang chi tiết hiện đồng thời
 * "Khỏe — hoạt động bình thường" và một hộp đỏ "Dừng đăng bằng nick này ngay".
 *
 * Màn hình tự mâu thuẫn còn tệ hơn màn hình thiếu thông tin: người đọc phải đoán xem nên tin
 * dòng nào, và lần sau họ sẽ bỏ qua cả hai.
 */
const QUARANTINED_STATUSES: AccountStatus[] = ["CHECKPOINT", "SHADOWBANNED", "DEAD"];

export function isQuarantinedStatus(status: string): boolean {
  return (QUARANTINED_STATUSES as string[]).includes(status);
}

export function getStatusPresentation(status: string): StatusPresentation {
  return isAccountStatus(status) ? STATUS_PRESENTATION[status] : STATUS_PRESENTATION.DEAD;
}

/** Nick còn trong giai đoạn cold-start thì chưa được đăng bài. */
export function isInColdStart(coldStartUntil: Date | null, now: Date = new Date()): boolean {
  return coldStartUntil !== null && coldStartUntil.getTime() > now.getTime();
}

/** Số ngày còn lại của cold-start, làm tròn lên. 0 nghĩa là đã xong. */
export function coldStartDaysRemaining(
  coldStartUntil: Date | null,
  now: Date = new Date(),
): number {
  if (!isInColdStart(coldStartUntil, now)) return 0;
  const msRemaining = (coldStartUntil as Date).getTime() - now.getTime();
  return Math.ceil(msRemaining / 86_400_000);
}

/** Tuổi nick trên nền tảng, tính theo ngày. Dùng cho luật minAccountAgeDays ở Phase 02. */
export function accountAgeInDays(
  platformCreatedAt: Date | null,
  now: Date = new Date(),
): number | null {
  if (!platformCreatedAt) return null;
  return Math.floor((now.getTime() - platformCreatedAt.getTime()) / 86_400_000);
}
