/**
 * Mọi thứ trang "Hôm nay" cần biết, gom về một lượt.
 *
 * ## Vì sao là một hàm chứ không phải mười lời gọi rải trong component
 *
 * Trang này hỏi mười lăm thứ, và chúng **phải chạy song song**. Rải ra thì mỗi lần thêm một cảnh
 * báo mới là một cơ hội để ai đó `await` tuần tự — hỏng theo kiểu không test nào bắt: trang vẫn
 * đúng, chỉ chậm dần, mỗi lần một chút. Gom vào một `Promise.all` thì hình dạng đó nhìn thấy được.
 *
 * Trang này **không gọi mạng**. Proxy chỉ đọc kết luận của lần kiểm gần nhất; muốn kiểm mới thì
 * bấm ở `/proxies`. Mở trang Hôm nay mà phải chờ mười lượt gọi proxy là biến màn hình xem-lướt
 * thành màn hình chờ.
 */

import { loadClusterWarnings } from "@/lib/accounts/account-cluster-warnings";
import { ACCOUNT_STATUSES, type AccountStatus } from "@/lib/accounts/account-status";
import { evaluateBackupFreshness } from "@/lib/backup/backup-freshness-warning";
import { readDailyBackupSchedule } from "@/lib/backup/daily-backup-scheduler";
import { prisma } from "@/lib/db/prisma-client";
import { loadFacebookTokenWarnings } from "@/lib/facebook/facebook-token-warnings";
import { loadAccountHealthRows } from "@/lib/health/health-dashboard-queries";
import { evaluateHealthSetup } from "@/lib/health/health-setup-warning";
import { loadDuplicatePostedUrls } from "@/lib/queue/duplicate-posted-url-check";
import { loadDueManualPostReminders } from "@/lib/queue/manual-post-reminders";
import { loadPostingLoopSummary } from "@/lib/queue/posting-loop-summary";
import { loadSuspectPostedUrls } from "@/lib/queue/posted-url-title-check";
import { PROBLEM_VERDICTS } from "@/lib/proxies/proxy-liveness-verdict";

/** Một ô đếm ở dải đầu trang, bấm vào đi thẳng tới danh sách tương ứng. */
export interface OverviewCounter {
  label: string;
  value: number;
  href: string;
}

export async function loadOverviewPageData() {
  const [
    accounts,
    proxyCount,
    targetCount,
    contentCount,
    pendingJobCount,
    blockedJobCount,
    manualReminders,
    healthRows,
    loopSummary,
    brokenProxies,
    tokenWarnings,
    activeObserverProxyCount,
    duplicatePostedUrls,
    suspectPostedUrls,
    clusterWarnings,
    backupSchedule,
  ] = await Promise.all([
    prisma.account.findMany({
      select: { id: true, username: true, status: true, coldStartUntil: true },
    }),
    prisma.proxy.count(),
    prisma.platformTarget.count(),
    prisma.contentItem.count(),
    prisma.postJob.count({ where: { status: "PENDING" } }),
    prisma.postJob.count({ where: { status: "BLOCKED" } }),
    loadDueManualPostReminders(),
    loadAccountHealthRows(),
    loadPostingLoopSummary(),
    // Chỉ đọc kết quả lần kiểm gần nhất — trang này không gọi mạng.
    prisma.proxy.findMany({
      where: { lastCheckVerdict: { in: PROBLEM_VERDICTS } },
      select: { id: true, label: true, lastCheckVerdict: true, lastCheckDetail: true },
      orderBy: { label: "asc" },
    }),
    loadFacebookTokenWarnings(),
    prisma.observerProxy.count({ where: { active: true } }),
    loadDuplicatePostedUrls(),
    loadSuspectPostedUrls(),
    loadClusterWarnings(),
    readDailyBackupSchedule(),
  ]);

  // "Chưa dò" và "dò lâu rồi" đều là KHÔNG BIẾT — nhưng là hai kiểu không biết khác nhau, cần
  // hai câu khác nhau và hai việc phải làm khác nhau. Xem health-setup-warning.ts.
  const healthWarning = evaluateHealthSetup({
    redditAccountCount: healthRows.length,
    activeObserverProxyCount,
    neverCheckedCount: healthRows.filter((row) => row.latest === null).length,
    staleCount: healthRows.filter((row) => row.latest !== null && row.stale).length,
  });

  // Một nếp sao lưu hỏng lặng lẽ tệ hơn không có nếp nào: người ta tin là mình đang được bảo vệ,
  // và điều đó chỉ được kiểm chứng vào đúng ngày mọi thứ khác đã cháy.
  const backupWarning = evaluateBackupFreshness({
    enabled: backupSchedule.at !== null && backupSchedule.r2Configured,
    lastRunAt: backupSchedule.lastRun?.lastRunAt ?? null,
    lastOutcome: backupSchedule.lastRun?.outcome ?? null,
    lastDetail: backupSchedule.lastRun?.detail ?? null,
    now: new Date(),
  });

  const byStatus = new Map<AccountStatus, number>();
  for (const status of ACCOUNT_STATUSES) byStatus.set(status, 0);
  for (const account of accounts) {
    const status = account.status as AccountStatus;
    byStatus.set(status, (byStatus.get(status) ?? 0) + 1);
  }

  const counters: OverviewCounter[] = [
    { label: "Chờ đăng", value: pendingJobCount, href: "/queue?status=PENDING" },
    { label: "Content", value: contentCount, href: "/content" },
    { label: "Tài khoản", value: accounts.length, href: "/accounts" },
    { label: "Proxy", value: proxyCount, href: "/proxies" },
    { label: "Đích đăng", value: targetCount, href: "/targets" },
  ];

  return {
    accounts,
    manualReminders,
    healthRows,
    loopSummary,
    byStatus,
    counters,
    // Đầu vào của dải cảnh báo — xem overview-alert-stack.tsx về thứ tự.
    brokenProxies,
    clusterWarnings,
    backupWarning,
    duplicatePostedUrls,
    suspectPostedUrls,
    tokenWarnings,
    healthWarning,
    blockedJobCount,
    needsAttention: accounts.filter((account) =>
      ["CHECKPOINT", "SHADOWBANNED"].includes(account.status),
    ),
  };
}
