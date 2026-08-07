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

export function OverviewAlertStack({
  brokenProxies,
  clusterWarnings,
  backupWarning,
  duplicatePostedUrls,
  suspectPostedUrls,
  tokenWarnings,
  healthWarning,
  blockedJobCount,
  needsAttention,
}: OverviewAlertStackProps) {
  return (
    <>
      {/* Proxy đứng trước mọi cảnh báo khác: nick chạy bằng IP sai là hỏng không gỡ lại được,
          còn job bị chặn hay token hết hạn thì chỉ là chưa đăng được. */}
      {brokenProxies.length > 0 ? (
        <AlertBanner tone="red">
          <p className="font-medium">{brokenProxies.length} proxy không dùng được:</p>
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
            {clusterWarnings.broken.length} nick có cụm đã hỏng — đáng lẽ không xảy ra được:
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
          <p className="mt-2">Quản trị viên gán lại cụm ở trang chi tiết từng nick.</p>
        </AlertBanner>
      ) : null}

      {clusterWarnings.incomplete.length > 0 ? (
        <AlertBanner tone="amber">
          <p className="font-medium">
            {clusterWarnings.incomplete.length} nick chưa dùng được vì còn thiếu cấu hình:
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
            Mở trang chi tiết nick để xem từng việc còn thiếu, hoặc xem{" "}
            <Link href="/setup" className="underline">
              trang Chuẩn bị
            </Link>{" "}
            nếu đang dựng kho lần đầu.
          </p>
        </AlertBanner>
      ) : null}

      {/* Đứng ngay sau proxy: mất kho danh tính là mất thứ không mua lại được, và bản sao lưu là
          thứ duy nhất chặn được ca đó. Kêu ở đây vì hàng trong ScheduledJobRun thì không ai mở ra
          xem. */}
      {backupWarning ? (
        <AlertBanner tone={backupWarning.tone}>
          <p className="font-medium">Sao lưu ra ngoài Railway</p>
          <p className="mt-1">{backupWarning.message}</p>
        </AlertBanner>
      ) : null}

      {/* Lỗi sổ sách, không phải lỗi nick — nhưng nó làm bộ luật đếm sai nên phải hiện sớm. */}
      {duplicatePostedUrls.length > 0 ? (
        <AlertBanner tone="amber">
          <p className="font-medium">
            {duplicatePostedUrls.length} link bị dán cho nhiều bài khác nhau — nhiều khả năng bấm
            &quot;Đã đăng&quot; nhầm link:
          </p>
          <ul className="mt-2 space-y-1">
            {duplicatePostedUrls.map((conflict) => (
              <li key={conflict.threadKey}>
                <a href={conflict.sampleUrl} target="_blank" rel="noreferrer" className="underline">
                  {conflict.threadKey}
                </a>{" "}
                <span className="text-neutral-600 dark:text-neutral-400">
                  — {conflict.jobs.map((job) => `“${job.contentTitle}”`).join(" và ")}
                </span>
              </li>
            ))}
          </ul>
          <p className="mt-2">
            Bài nào chưa đăng thật thì{" "}
            <Link href="/queue?status=POSTED" className="underline">
              trả job đó về Chờ đăng
            </Link>{" "}
            — để nguyên là luật 7 coi content đó đã dùng rồi và sẽ chặn khi bạn đăng nó thật.
          </p>
        </AlertBanner>
      ) : null}

      {/* Bổ cho cảnh báo trên: nó cần HAI job trùng link mới lên tiếng, còn cái này bắt được
          cả khi link dán nhầm trỏ về một bài không có job nào — không có cặp nào để so. */}
      {suspectPostedUrls.length > 0 ? (
        <AlertBanner tone="amber">
          <p className="font-medium">
            {suspectPostedUrls.length} link đã gán trỏ về bài có tiêu đề khác hẳn content:
          </p>
          <ul className="mt-2 space-y-1">
            {suspectPostedUrls.map((suspect) => (
              <li key={suspect.jobId}>
                <a href={suspect.postedUrl} target="_blank" rel="noreferrer" className="underline">
                  {suspect.postedUrl}
                </a>{" "}
                <span className="text-neutral-600 dark:text-neutral-400">
                  — job của {suspect.accountUsername}, content “{suspect.contentTitle}”
                </span>
              </li>
            ))}
          </ul>
          <p className="mt-2">
            Sửa tiêu đề lúc đăng cũng ra thế này, nên mở link kiểm trước. Đúng là dán nhầm thì{" "}
            <Link href="/queue?status=POSTED" className="underline">
              trả job về Chờ đăng
            </Link>
            .
          </p>
        </AlertBanner>
      ) : null}

      {tokenWarnings.broken.length > 0 ? (
        <AlertBanner tone="red">
          <p className="font-medium">
            {tokenWarnings.broken.length} Fanpage không đăng được vì token hỏng:
          </p>
          <ul className="mt-2 space-y-1">
            {tokenWarnings.broken.map((warning) => (
              <li key={warning.pageId}>
                {warning.pageName}{" "}
                <span className="text-neutral-600 dark:text-neutral-400">— {warning.message}</span>
              </li>
            ))}
          </ul>
          <p className="mt-2">
            <Link href="/facebook" className="underline">
              kết nối lại ở trang Facebook
            </Link>
          </p>
        </AlertBanner>
      ) : null}

      {tokenWarnings.expiringSoon.length > 0 ? (
        <AlertBanner tone="amber">
          {tokenWarnings.expiringSoon.length} Fanpage có token sắp hết hạn — hết giữa chừng là mọi
          Page dưới cùng một nick ngừng đăng được cùng lúc.{" "}
          <Link href="/facebook" className="underline">
            kết nối lại
          </Link>
          .
        </AlertBanner>
      ) : null}

      {healthWarning ? (
        <AlertBanner tone={healthWarning.tone}>
          {healthWarning.message}{" "}
          <Link href={healthWarning.href} className="underline">
            {healthWarning.linkLabel}
          </Link>
          .
        </AlertBanner>
      ) : null}

      {blockedJobCount > 0 ? (
        <AlertBanner tone="amber">
          {blockedJobCount} job bị bộ luật chặn khi kiểm tra lại —{" "}
          <Link href="/queue?status=BLOCKED" className="underline">
            xem lý do
          </Link>
          .
        </AlertBanner>
      ) : null}

      {needsAttention.length > 0 ? (
        <AlertBanner tone="red">
          <p className="font-medium">{needsAttention.length} nick cần xử lý tay:</p>
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
