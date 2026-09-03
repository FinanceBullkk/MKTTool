/**
 * @parked 19/08/2026 — cảnh báo của phần đã gác (pipeline đăng bài, token
 * Facebook, dò shadowban Reddit, hàng đợi).
 *
 * Gác chứ không xóa. Nguồn dữ liệu ở `overview-page-data.ts` vẫn tính đủ các
 * trường này; chỉ có chỗ vẽ là ngừng gọi. Khi nào TikTok cần một pipeline thì
 * đây là chỗ mở lại, và lịch sử `git blame` của từng dải vẫn còn nguyên.
 *
 * Không import file này ở đâu cả — đó là chủ ý.
 */
import Link from "next/link";

import { AlertBanner } from "@/components/ui/alert-banner";

import type { OverviewAlertStackProps } from "./overview-alert-stack";

type ParkedProps = Pick<
  OverviewAlertStackProps,
  "duplicatePostedUrls" | "suspectPostedUrls" | "tokenWarnings" | "healthWarning" | "blockedJobCount"
>;

export function ParkedOverviewAlerts({
  duplicatePostedUrls,
  suspectPostedUrls,
  tokenWarnings,
  healthWarning,
  blockedJobCount,
}: ParkedProps) {
  return (
    <>
        {/* Lỗi sổ sách, không phải lỗi nick — nhưng nó làm bộ luật đếm sai nên phải hiện sớm. */}
        {duplicatePostedUrls.length > 0 ? (
          <AlertBanner tone="amber">
            <p className="font-medium">
              {duplicatePostedUrls.length} links were assigned to multiple jobs. A job was probably
              marked &quot;Posted&quot; with the wrong link:
            </p>
            <ul className="mt-2 space-y-1">
              {duplicatePostedUrls.map((conflict) => (
                <li key={conflict.threadKey}>
                  <a href={conflict.sampleUrl} target="_blank" rel="noreferrer" className="underline">
                    {conflict.threadKey}
                  </a>{" "}
                  <span className="text-neutral-600 dark:text-neutral-400">
                    — {conflict.jobs.map((job) => `“${job.contentTitle}”`).join(" and ")}
                  </span>
                </li>
              ))}
            </ul>
            <p className="mt-2">
              If a job was not actually posted,{" "}
              <Link href="/queue?status=POSTED" className="underline">
                return it to Pending
              </Link>{" "}
              . Otherwise, rule 7 treats that content as already used and blocks the real post.
            </p>
          </AlertBanner>
        ) : null}
  
        {/* Bổ cho cảnh báo trên: nó cần HAI job trùng link mới lên tiếng, còn cái này bắt được
            cả khi link dán nhầm trỏ về một bài không có job nào — không có cặp nào để so. */}
        {suspectPostedUrls.length > 0 ? (
          <AlertBanner tone="amber">
            <p className="font-medium">
              {suspectPostedUrls.length} assigned links point to posts whose titles differ sharply
              from the stored content:
            </p>
            <ul className="mt-2 space-y-1">
              {suspectPostedUrls.map((suspect) => (
                <li key={suspect.jobId}>
                  <a href={suspect.postedUrl} target="_blank" rel="noreferrer" className="underline">
                    {suspect.postedUrl}
                  </a>{" "}
                  <span className="text-neutral-600 dark:text-neutral-400">
                    — job for {suspect.accountUsername}, content “{suspect.contentTitle}”
                  </span>
                </li>
              ))}
            </ul>
            <p className="mt-2">
              Editing the title while posting can also trigger this warning, so inspect the link
              first. If the wrong link was pasted,{" "}
              <Link href="/queue?status=POSTED" className="underline">
                return the job to Pending
              </Link>
              .
            </p>
          </AlertBanner>
        ) : null}
  
        {tokenWarnings.broken.length > 0 ? (
          <AlertBanner tone="red">
            <p className="font-medium">
              {tokenWarnings.broken.length} Facebook Pages cannot post because their tokens are invalid:
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
                reconnect them on the Facebook page
              </Link>
            </p>
          </AlertBanner>
        ) : null}
  
        {tokenWarnings.expiringSoon.length > 0 ? (
          <AlertBanner tone="amber">
            {tokenWarnings.expiringSoon.length} Facebook Pages have expiring tokens. If a token
            expires mid-operation, every Page under the same nick stops posting at once.{" "}
            <Link href="/facebook" className="underline">
              Reconnect now
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
            {blockedJobCount} jobs were blocked when the posting rules rechecked them -{" "}
            <Link href="/queue?status=BLOCKED" className="underline">
              view the reasons
            </Link>
            .
          </AlertBanner>
        ) : null}
    </>
  );
}
