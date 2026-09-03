/**
 * Các truy vấn nạp dữ liệu cho bộ luật, tách khỏi rule-context-builder.ts để mỗi file
 * chỉ lo một việc: file này hỏi database, file kia lắp thành RuleContext.
 */
import { ACTIVE_JOB_STATUSES } from "@/lib/content/content-types";
import { prisma } from "@/lib/db/prisma-client";
import {
  MS_PER_DAY,
  MS_PER_HOUR,
  endOfLocalDay,
  formatDayMonth,
  startOfLocalDay,
} from "@/lib/format/vietnamese-date-format";
import { platformFamily } from "@/lib/platforms/platform-family";
import type { ComparableContent, OtherAccountActivity } from "./rule-types";
import { combineContentText } from "./text-normalizer";

export interface OwnJob {
  targetId: string;
  scheduledAt: Date;
  contentItem: { type: string };
}

/** Bài đang chiếm chỗ trong lịch của chính nick này — nguồn cho 3 luật đếm số. */
export function loadOwnJobs(accountId: string, excludeJobId?: string): Promise<OwnJob[]> {
  return prisma.postJob.findMany({
    where: {
      accountId,
      status: { in: ACTIVE_JOB_STATUSES },
      ...(excludeJobId ? { id: { not: excludeJobId } } : {}),
    },
    select: { targetId: true, scheduledAt: true, contentItem: { select: { type: true } } },
  });
}

export function countPostsSameDay(jobs: OwnJob[], at: Date): number {
  const dayStart = startOfLocalDay(at).getTime();
  const dayEnd = endOfLocalDay(at).getTime();

  return jobs.filter((job) => {
    const time = job.scheduledAt.getTime();
    return time >= dayStart && time < dayEnd;
  }).length;
}

/** Khoảng cách gần nhất tính cả hai chiều — bài đã xếp ở tương lai cũng phải giữ khoảng nghỉ. */
export function hoursToNearestSameTarget(jobs: OwnJob[], targetId: string, at: Date): number | null {
  let nearest: number | null = null;

  for (const job of jobs) {
    if (job.targetId !== targetId) continue;
    const hours = Math.abs(job.scheduledAt.getTime() - at.getTime()) / MS_PER_HOUR;
    if (nearest === null || hours < nearest) nearest = hours;
  }

  return nearest;
}

export function tallyPromoRatio(
  jobs: OwnJob[],
  targetId: string,
): { valueCount: number; promoCount: number } {
  let valueCount = 0;
  let promoCount = 0;

  for (const job of jobs) {
    if (job.targetId !== targetId) continue;
    if (job.contentItem.type === "PROMO") promoCount += 1;
    else valueCount += 1;
  }

  return { valueCount, promoCount };
}

/**
 * Đối chứng để so trùng: bài của MỌI nick trong cùng họ nền tảng.
 * Lọc họ nền tảng bằng JS chứ không bằng truy vấn: "họ nền tảng" (FACEBOOK_PAGE và
 * FACEBOOK_GROUP tính là một) là quy ước của tầng luật, không phải quan hệ có trong dữ liệu.
 * Đẩy nó xuống SQL là chép cùng một quy ước ra hai nơi.
 */
export async function loadComparableContent(
  targetPlatform: string,
  at: Date,
  windowDays: number,
  excludeJobId?: string,
): Promise<ComparableContent[]> {
  const since = new Date(at.getTime() - windowDays * MS_PER_DAY);
  const family = platformFamily(targetPlatform);

  const jobs = await prisma.postJob.findMany({
    where: {
      status: { in: ACTIVE_JOB_STATUSES },
      scheduledAt: { gte: since },
      ...(excludeJobId ? { id: { not: excludeJobId } } : {}),
    },
    select: {
      scheduledAt: true,
      contentItem: { select: { title: true, body: true } },
      account: { select: { username: true } },
      target: { select: { name: true, platform: true } },
    },
    orderBy: { scheduledAt: "desc" },
  });

  return jobs
    .filter((job) => platformFamily(job.target.platform) === family)
    .map((job) => ({
      label: `${job.account.username} on ${job.target.name}, ${formatDayMonth(job.scheduledAt)}`,
      text: combineContentText(job.contentItem.title, job.contentItem.body),
    }));
}

/** Lần dò sức khỏe gần nhất của nick (Phase 03). `null` khi chưa dò lần nào. */
export function loadLatestHealthCheck(
  accountId: string,
): Promise<{ verdict: string; checkedAt: Date } | null> {
  return prisma.healthCheck.findFirst({
    where: { accountId },
    orderBy: { checkedAt: "desc" },
    select: { verdict: true, checkedAt: true },
  });
}

/** Nick KHÁC của mình đã chạm đúng thread này — bất kể lâu tới đâu, dấu vết vẫn còn đó. */
export async function loadThreadCollisions(
  threadKey: string | null,
  accountId: string,
): Promise<OtherAccountActivity[]> {
  if (!threadKey) return [];

  const interactions = await prisma.interaction.findMany({
    where: { threadKey, accountId: { not: accountId } },
    select: { kind: true, at: true, account: { select: { username: true } } },
    orderBy: { at: "desc" },
  });

  return interactions.map((interaction) => ({
    accountUsername: interaction.account.username,
    kind: interaction.kind,
    at: interaction.at,
  }));
}

/** Nick khác của mình hoạt động cùng đích quanh mốc `at` — tương tác đã ghi lẫn job đã xếp. */
export async function loadSameTargetNeighbors(
  targetId: string,
  accountId: string,
  at: Date,
  warnHours: number,
  excludeJobId?: string,
): Promise<OtherAccountActivity[]> {
  const from = new Date(at.getTime() - warnHours * MS_PER_HOUR);
  const to = new Date(at.getTime() + warnHours * MS_PER_HOUR);

  const [interactions, jobs] = await Promise.all([
    prisma.interaction.findMany({
      where: { targetId, accountId: { not: accountId }, at: { gte: from, lte: to } },
      select: { kind: true, at: true, account: { select: { username: true } } },
    }),
    prisma.postJob.findMany({
      where: {
        targetId,
        accountId: { not: accountId },
        status: { in: ACTIVE_JOB_STATUSES },
        scheduledAt: { gte: from, lte: to },
        ...(excludeJobId ? { id: { not: excludeJobId } } : {}),
      },
      select: { scheduledAt: true, account: { select: { username: true } } },
    }),
  ]);

  return [
    ...interactions.map((row) => ({
      accountUsername: row.account.username,
      kind: row.kind,
      at: row.at,
    })),
    ...jobs.map((row) => ({
      accountUsername: row.account.username,
      kind: "POST",
      at: row.scheduledAt,
    })),
  ].sort((left, right) => right.at.getTime() - left.at.getTime());
}
