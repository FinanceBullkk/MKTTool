/**
 * Đọc số đo băng thông thành câu tiếng Việt và thành một xếp hạng để tô màu.
 *
 * Tách khỏi `proxy-bandwidth-probe.ts` vì đây là phần thuần túy (không mạng, không database) —
 * nhờ vậy ngưỡng nhanh/chậm kiểm được bằng test, còn phần đo thì không cần test cũng không sao.
 */
import type { BandwidthOutcome, BandwidthReading } from "./proxy-bandwidth-probe";

/**
 * Ngưỡng đặt theo việc thật của công cụ này: mở trang mạng xã hội, tải ảnh, chờ trình duyệt
 * antidetect nạp xong một phiên.
 *
 * - Dưới 1 Mbps: mở trang đã đủ treo, không dùng để đăng bài được.
 * - Dưới 5 Mbps: chạy được nhưng chậm thấy rõ, nên để dành cho nick ít việc.
 *
 * Đây là ngưỡng thô, cố ý: số đo là `min(mạng nhà, proxy, máy chủ thử)` nên so tương đối giữa
 * các proxy đo cùng lúc mới đáng tin.
 */
export const VERY_SLOW_MBPS = 1;
export const SLOW_MBPS = 5;

export type BandwidthGrade = "FAST" | "SLOW" | "VERY_SLOW" | "UNKNOWN";

export const BANDWIDTH_LABEL: Record<BandwidthGrade, string> = {
  FAST: "fast",
  SLOW: "slow",
  VERY_SLOW: "very slow",
  UNKNOWN: "not measured",
};

export const BANDWIDTH_CLASS: Record<BandwidthGrade, string> = {
  FAST: "bg-emerald-100 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-300",
  SLOW: "bg-amber-100 text-amber-800 dark:bg-amber-950 dark:text-amber-300",
  VERY_SLOW: "bg-red-100 text-red-800 dark:bg-red-950 dark:text-red-300",
  UNKNOWN: "bg-neutral-200 text-neutral-600 dark:bg-neutral-800 dark:text-neutral-400",
};

export function gradeBandwidth(mbps: number): BandwidthGrade {
  if (mbps < VERY_SLOW_MBPS) return "VERY_SLOW";
  if (mbps < SLOW_MBPS) return "SLOW";
  return "FAST";
}

/** Dấu phẩy thập phân kiểu Việt, ghép tay thay vì dùng Intl — cùng lý do với format ngày giờ. */
function decimal(value: number, digits: number): string {
  return value.toFixed(digits);
}

export function formatMbps(mbps: number): string {
  return `${decimal(mbps, mbps >= 10 ? 0 : 1)} Mbps`;
}

/** Số quota proxy đã tiêu cho lượt đo — phải hiện ra vì nó là tiền thật. */
export function formatDataUsed(bytes: number): string {
  if (bytes < 102_400) return `${decimal(bytes / 1024, 0)} KB`;
  return `${decimal(bytes / 1_048_576, 1)} MB`;
}

/** Câu mô tả một lượt đo thành công. */
export function describeReading(reading: BandwidthReading): string {
  const grade = BANDWIDTH_LABEL[gradeBandwidth(reading.mbps)];
  const capped = reading.hitTimeCap ? ", stopped at the time limit before using the full data budget" : "";
  return (
    `${formatMbps(reading.mbps)} (${grade}) - downloaded ${formatDataUsed(reading.bytes)} through ` +
    `${reading.source}, time to first byte ${Math.round(reading.ttfbMs)} ms${capped}`
  );
}

export interface BandwidthSummary {
  /** Xanh chỉ khi đo được VÀ không chậm — cùng nguyên tắc với nút kiểm proxy còn sống. */
  ok: boolean;
  grade: BandwidthGrade;
  mbps: number | null;
  message: string;
}

export function summarizeBandwidth(outcome: BandwidthOutcome): BandwidthSummary {
  if (outcome.kind === "ok") {
    const grade = gradeBandwidth(outcome.reading.mbps);
    return {
      ok: grade === "FAST",
      grade,
      mbps: outcome.reading.mbps,
      message: describeReading(outcome.reading),
    };
  }

  // "Không đo được" phải nói rõ là chưa biết, không được để người đọc hiểu thành proxy chậm —
  // cùng nguyên tắc với bộ dò shadowban: không đo được thì không kết luận.
  const prefix =
    outcome.kind === "unreachable"
      ? "The test file could not be downloaded through this proxy"
      : "Speed was not measured because the test server or measurement failed; this is not yet a proxy failure";
  return { ok: false, grade: "UNKNOWN", mbps: null, message: `${prefix}: ${outcome.detail}` };
}
