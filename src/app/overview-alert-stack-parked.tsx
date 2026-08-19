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
    </>
  );
}
