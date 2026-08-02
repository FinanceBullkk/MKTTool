/**
 * Truy vấn cho bảng sức khỏe và trang lịch sử dò.
 *
 * Tách khỏi component để trang chỉ lo trình bày — cùng lý do rule-context-queries.ts tách
 * khỏi rules-engine.ts.
 */
import { prisma } from "@/lib/db/prisma-client";
import { MS_PER_DAY } from "@/lib/format/vietnamese-date-format";
import { getVerdictPresentation } from "./health-verdict";

/** Cửa sổ vẽ biểu đồ karma. */
export const KARMA_TREND_DAYS = 30;

/**
 * Quá ngần này chưa dò lại thì con số trên bảng không còn đáng tin.
 * Lịch chạy là mỗi ngày một lần, nên 3 ngày là đã bỏ lỡ hai lượt.
 */
export const STALE_CHECK_DAYS = 3;

export interface AccountHealthRow {
  id: string;
  username: string;
  status: string;
  karma: number;
  /** `null` khi nick chưa được dò lần nào. */
  latest: {
    verdict: string;
    detail: string | null;
    checkedAt: Date;
    visiblePosts: number | null;
    expectedPosts: number | null;
  } | null;
  /** Số ngày kể từ lần dò gần nhất; `null` nếu chưa dò lần nào. */
  daysSinceCheck: number | null;
  stale: boolean;
}

/**
 * Mỗi nick Reddit một dòng, nick đáng lo đẩy lên đầu.
 *
 * Nick CHƯA dò lần nào cũng phải nổi lên trên, ngang với nick có vấn đề: "chưa biết gì" và
 * "biết là ổn" là hai chuyện hoàn toàn khác nhau, và bảng nào trộn chúng lại thì người đọc
 * sẽ tin nhầm.
 */
export async function loadAccountHealthRows(now: Date = new Date()): Promise<AccountHealthRow[]> {
  const accounts = await prisma.account.findMany({
    where: { platform: "REDDIT" },
    select: {
      id: true,
      username: true,
      status: true,
      karma: true,
      healthChecks: {
        take: 1,
        orderBy: { checkedAt: "desc" },
        select: {
          verdict: true,
          detail: true,
          checkedAt: true,
          visiblePosts: true,
          expectedPosts: true,
        },
      },
    },
  });

  const rows = accounts.map((account): AccountHealthRow => {
    const latest = account.healthChecks[0] ?? null;
    const daysSinceCheck = latest
      ? Math.floor((now.getTime() - latest.checkedAt.getTime()) / MS_PER_DAY)
      : null;

    return {
      id: account.id,
      username: account.username,
      status: account.status,
      karma: account.karma,
      latest,
      daysSinceCheck,
      stale: daysSinceCheck === null || daysSinceCheck >= STALE_CHECK_DAYS,
    };
  });

  return rows.sort((left, right) => {
    // Chưa dò lần nào xếp ngang mức nặng nhất.
    const leftWeight = left.latest ? getVerdictPresentation(left.latest.verdict).severity : -1;
    const rightWeight = right.latest ? getVerdictPresentation(right.latest.verdict).severity : -1;
    if (leftWeight !== rightWeight) return leftWeight - rightWeight;
    return left.username.localeCompare(right.username);
  });
}

/** Điểm karma đọc được trong 30 ngày, để vẽ xu hướng. Bỏ lần dò không đọc được karma. */
export async function loadKarmaTrend(
  accountId: string,
  now: Date = new Date(),
): Promise<{ at: Date; karma: number }[]> {
  const checks = await prisma.healthCheck.findMany({
    where: {
      accountId,
      karma: { not: null },
      checkedAt: { gte: new Date(now.getTime() - KARMA_TREND_DAYS * MS_PER_DAY) },
    },
    select: { checkedAt: true, karma: true },
    orderBy: { checkedAt: "asc" },
  });

  return checks.map((check) => ({ at: check.checkedAt, karma: check.karma as number }));
}

/** Lịch sử dò gần đây của mọi nick, cho trang /health. */
export function loadRecentChecks(limit = 100) {
  return prisma.healthCheck.findMany({
    take: limit,
    orderBy: { checkedAt: "desc" },
    select: {
      id: true,
      verdict: true,
      detail: true,
      checkedAt: true,
      karma: true,
      visiblePosts: true,
      expectedPosts: true,
      screenshotPath: true,
      account: { select: { id: true, username: true } },
    },
  });
}
