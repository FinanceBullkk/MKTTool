/**
 * Ô "lần kiểm gần nhất" — dùng chung cho bảng proxy của nick và bảng proxy quan sát viên.
 *
 * Chưa kiểm lần nào KHÔNG được hiện như một ô trống hiền lành: proxy chưa đo là proxy chưa
 * biết còn sống không, và đó chính là trạng thái mặc định của mọi proxy vừa nhập.
 */
import { StatusBadge } from "@/components/ui/page-section";
import { formatDayMonthTime } from "@/lib/format/vietnamese-date-format";
import {
  PROXY_CHECK_CLASS,
  PROXY_CHECK_LABEL,
  type ProxyCheckVerdict,
} from "@/lib/proxies/proxy-liveness-verdict";

export function ProxyLastCheckCell({
  verdict,
  checkedAt,
  exitIp,
}: {
  verdict: string | null;
  checkedAt: Date | null;
  exitIp: string | null;
}) {
  if (!verdict || !checkedAt) {
    return <span className="text-sm text-neutral-400">Never checked</span>;
  }

  const known = (PROXY_CHECK_LABEL as Record<string, string>)[verdict] !== undefined;
  const key = verdict as ProxyCheckVerdict;

  return (
    <div className="space-y-0.5">
      <StatusBadge
        label={known ? PROXY_CHECK_LABEL[key] : verdict}
        className={known ? PROXY_CHECK_CLASS[key] : PROXY_CHECK_CLASS.UNKNOWN}
      />
      <div className="text-sm text-neutral-400">
        {formatDayMonthTime(checkedAt)}
        {exitIp ? ` · ra ${exitIp}` : ""}
      </div>
    </div>
  );
}
