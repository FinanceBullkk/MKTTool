import Link from "next/link";
import { AlertBanner } from "@/components/ui/alert-banner";
import { getStatusPresentation } from "@/lib/accounts/account-status";
import type { ClusterWarnings } from "@/lib/accounts/account-cluster-warnings";
import type { BackupFreshnessWarning } from "@/lib/backup/backup-freshness-warning";
import type { FacebookTokenWarnings } from "@/lib/facebook/facebook-token-warnings";
import type { HealthSetupWarning } from "@/lib/health/health-setup-warning";
import type { DuplicatePostedUrl } from "@/lib/queue/duplicate-posted-url-check";
import type { SuspectPostedUrl } from "@/lib/queue/posted-url-title-check";
import { PROXY_CHECK_LABEL } from "@/lib/proxies/proxy-liveness-verdict";

/**
 * Dải cảnh báo đầu trang "Hôm nay".
 *
 * ## Vì sao là một file riêng
 *
 * Không phải vì trang kia dài. Thứ tự dưới đây **là một quyết định nghiệp vụ**, và nó chỉ đọc
 * được khi mười khối cảnh báo nằm cạnh nhau: xếp theo **mức độ không gỡ lại được**, không theo
 * mức độ ồn ào.
 *
 * | Nhóm | Hỏng thì mất gì |
 * |---|---|
 * | Proxy chết, cụm hỏng | nick đi ra ngoài bằng IP sai — hỏng vĩnh viễn |
 * | Sao lưu | mất kho danh tính, thứ không mua lại được |
 * | Sổ sách (link trùng, link lệch) | bộ luật đếm sai rồi cho qua bài lẽ ra phải chặn |
 * | Token, dò shadowban, job bị chặn | chưa đăng được — phiền, nhưng gỡ lại được |
 *
 * Trộn lẫn thứ tự này thì một dòng "3 job bị chặn" đứng trên một dòng "proxy đang rò IP nhà", và
 * người đọc xử lý cái trên trước. Đó là lý do phần này không tách nhỏ thêm nữa: mỗi khối một file
 * thì thứ tự trở thành một danh sách import mà không ai đọc như một danh sách ưu tiên.
 *
 * Mọi dữ liệu vào đây đã tải sẵn ở `page.tsx` — component này không hỏi database và không gọi mạng.
 */

/** Một proxy có kết luận xấu ở lần kiểm gần nhất. Lấy từ `prisma.proxy.findMany` ở `page.tsx`. */
export interface BrokenProxyRow {
  id: string;
  label: string;
  lastCheckVerdict: string | null;
  lastCheckDetail: string | null;
}

/** Nick đang ở `CHECKPOINT` hoặc `SHADOWBANNED` — cần người xử lý tay. */
export interface AttentionAccountRow {
  id: string;
  username: string;
  status: string;
}

export interface OverviewAlertStackProps {
  brokenProxies: BrokenProxyRow[];
  clusterWarnings: ClusterWarnings;
  backupWarning: BackupFreshnessWarning | null;
  duplicatePostedUrls: DuplicatePostedUrl[];
  suspectPostedUrls: SuspectPostedUrl[];
  tokenWarnings: FacebookTokenWarnings;
  healthWarning: HealthSetupWarning | null;
  blockedJobCount: number;
  needsAttention: AttentionAccountRow[];
}

// Dải của phần đã gác sống ở `overview-alert-stack-parked.tsx` và không được
// gọi ở đây: phạm vi hiện tại là TikTok, và một cảnh báo về pipeline hay token
// Facebook không có đường sửa nào cho người đang vận hành kênh TikTok. Cảnh báo
// không sửa được là cảnh báo người ta học cách phớt lờ — và thói quen đó dính
// sang cả những mục họ sửa được.
export function OverviewAlertStack({
  brokenProxies,
  clusterWarnings,
  backupWarning,
  needsAttention,
}: OverviewAlertStackProps) {
  return (
    <>
      {/* Proxy đứng trước mọi cảnh báo khác: nick chạy bằng IP sai là hỏng không gỡ lại được,
          còn job bị chặn hay token hết hạn thì chỉ là chưa đăng được. */}
      {brokenProxies.length > 0 ? (
        <AlertBanner tone="red">
          <p className="font-medium">
            {brokenProxies.length} unusable {brokenProxies.length === 1 ? "proxy" : "proxies"}:
          </p>
          <ul className="mt-2 space-y-1">
            {brokenProxies.map((proxy) => (
              <li key={proxy.id}>
                <Link href={`/proxies/${proxy.id}`} className="underline">
                  {proxy.label}
                </Link>{" "}
                <span className="text-neutral-600 dark:text-neutral-400">
                  — {PROXY_CHECK_LABEL[proxy.lastCheckVerdict as "DEAD"] ?? proxy.lastCheckVerdict}
                  {proxy.lastCheckDetail ? `: ${proxy.lastCheckDetail}` : ""}
                </span>
              </li>
            ))}
          </ul>
        </AlertBanner>
      ) : null}

      {/* Cụm hỏng đứng cạnh proxy vì cùng một họ: cả hai đều trông bình thường cho tới lúc bấm
          nút, và cả hai đều làm nick đi ra ngoài bằng thứ không phải của nó. */}
      {clusterWarnings.broken.length > 0 ? (
        <AlertBanner tone="red">
          <p className="font-medium">
            {clusterWarnings.broken.length} {clusterWarnings.broken.length === 1 ? "nick has" : "nicks have"} a
            broken assignment — this should not be possible:
          </p>
          <ul className="mt-2 space-y-1">
            {clusterWarnings.broken.map((row) => (
              <li key={row.id}>
                <Link href={`/accounts/${row.id}`} className="underline">
                  {row.username}
                </Link>{" "}
                <span className="text-neutral-600 dark:text-neutral-400">
                  — {row.readiness.summary}
                </span>
              </li>
            ))}
          </ul>
          <p className="mt-2">An administrator reassigns the nick on its detail page.</p>
        </AlertBanner>
      ) : null}

      {clusterWarnings.incomplete.length > 0 ? (
        <AlertBanner tone="amber">
          <p className="font-medium">
            {clusterWarnings.incomplete.length}{" "}
            {clusterWarnings.incomplete.length === 1 ? "nick is" : "nicks are"} not ready because
            configuration is missing:
          </p>
          <ul className="mt-2 space-y-1">
            {clusterWarnings.incomplete.map((row) => (
              <li key={row.id}>
                <Link href={`/accounts/${row.id}`} className="underline">
                  {row.username}
                </Link>{" "}
                <span className="text-neutral-600 dark:text-neutral-400">
                  — {row.readiness.summary}
                </span>
              </li>
            ))}
          </ul>
          <p className="mt-2">
            Open the nick detail page to see what each one is missing, or see the{" "}
            <Link href="/setup" className="underline">
              Setup page
            </Link>{" "}
            if you are building the vault for the first time.
          </p>
        </AlertBanner>
      ) : null}

      {/* Đứng ngay sau proxy: mất kho danh tính là mất thứ không mua lại được, và bản sao lưu là
          thứ duy nhất chặn được ca đó. Kêu ở đây vì hàng trong ScheduledJobRun thì không ai mở ra
          xem. */}
      {backupWarning ? (
        <AlertBanner tone={backupWarning.tone}>
          <p className="font-medium">Off-Railway backup</p>
          <p className="mt-1">{backupWarning.message}</p>
        </AlertBanner>
      ) : null}


      {needsAttention.length > 0 ? (
        <AlertBanner tone="red">
          <p className="font-medium">
            {needsAttention.length} {needsAttention.length === 1 ? "nick needs" : "nicks need"} manual
            attention:
          </p>
          <ul className="mt-2 space-y-1">
            {needsAttention.map((account) => (
              <li key={account.id}>
                <Link href={`/accounts/${account.id}`} className="underline">
                  {account.username}
                </Link>{" "}
                <span className="text-neutral-600 dark:text-neutral-400">
                  — {getStatusPresentation(account.status).label}
                </span>
              </li>
            ))}
          </ul>
        </AlertBanner>
      ) : null}
    </>
  );
}
