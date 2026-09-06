/**
 * Ô "tốc độ" trong bảng proxy.
 *
 * Ba trạng thái phải phân biệt được bằng mắt, vì chúng dẫn tới ba hành động khác nhau:
 * chưa đo (đi đo), đo rồi mà không ra số (proxy hoặc máy chủ thử có vấn đề), đo ra số (đọc số).
 * Gộp hai cái đầu thành một ô trống là cách nhanh nhất để quên mất proxy nào đã đo.
 */
import { StatusBadge } from "@/components/ui/page-section";
import { formatDayMonthTime } from "@/lib/format/vietnamese-date-format";
import {
  BANDWIDTH_CLASS,
  BANDWIDTH_LABEL,
  formatMbps,
  gradeBandwidth,
} from "@/lib/proxies/proxy-bandwidth-report";

export function ProxySpeedCell({
  measuredAt,
  mbps,
  detail,
}: {
  measuredAt: Date | null;
  mbps: number | null;
  detail: string | null;
}) {
  if (!measuredAt) {
    return <span className="text-sm text-neutral-400">Never measured</span>;
  }

  const grade = mbps === null ? "UNKNOWN" : gradeBandwidth(mbps);

  return (
    <div className="space-y-0.5" title={detail ?? undefined}>
      <StatusBadge
        label={mbps === null ? BANDWIDTH_LABEL.UNKNOWN : formatMbps(mbps)}
        className={BANDWIDTH_CLASS[grade]}
      />
      <div className="text-sm text-neutral-400">
        {formatDayMonthTime(measuredAt)}
        {mbps === null ? "" : ` · ${BANDWIDTH_LABEL[grade]}`}
      </div>
    </div>
  );
}
