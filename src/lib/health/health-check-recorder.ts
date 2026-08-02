/**
 * Ghi kết quả một lần dò xuống database: bản ghi HealthCheck, ảnh màn hình, và — chỉ khi
 * thật sự cần — trạng thái mới của nick.
 *
 * Tách khỏi runner để chỗ chạm database gom về một file, đúng như cách rule-context-queries.ts
 * tách khỏi rules-engine.ts.
 */
import { mkdirSync, writeFileSync } from "node:fs";
import path from "node:path";
import type { Prisma } from "@prisma/client";
import { STATUS_PRESENTATION, getStatusPresentation } from "@/lib/accounts/account-status";
import { prisma } from "@/lib/db/prisma-client";
import { MS_PER_DAY } from "@/lib/format/vietnamese-date-format";
import { statusForcedBy } from "./health-verdict";
import type { ProbeResult } from "./reddit-shadowban-prober";

/** Ảnh có thể chứa tên nick và nội dung bài — thư mục này đã nằm trong .gitignore. */
export const SCREENSHOT_DIR = path.join("data", "screenshots");

export interface AccountToCheck {
  id: string;
  username: string;
  status: string;
}

/** Số bài đã đánh dấu đã đăng trong cửa sổ quan sát — mẫu số để đối chiếu với số thấy được. */
export function countExpectedPosts(
  accountId: string,
  windowDays: number,
  now: Date = new Date(),
): Promise<number> {
  return prisma.postJob.count({
    where: {
      accountId,
      status: "POSTED",
      postedAt: { gte: new Date(now.getTime() - windowDays * MS_PER_DAY) },
    },
  });
}

/** `<accountId>-<mốc thời gian>.png`. Trả về đường dẫn tương đối để lưu vào DB. */
export function saveScreenshot(accountId: string, image: Buffer, now: Date = new Date()): string {
  mkdirSync(SCREENSHOT_DIR, { recursive: true });
  const fileName = `${accountId}-${now.toISOString().replace(/[:.]/g, "-")}.png`;
  const filePath = path.join(SCREENSHOT_DIR, fileName);
  writeFileSync(filePath, image);
  return filePath;
}

/**
 * Trạng thái mới của nick, hoặc `null` nếu không đụng tới.
 *
 * CHỈ leo xuống, không bao giờ tự gỡ cách ly. Một lần dò khỏe sau khi dính shadowban không
 * chứng minh nick đã hồi phục — nó chỉ chứng minh lần dò đó không thấy vấn đề. Gỡ cách ly là
 * quyết định của người, và người phải chủ động đổi trạng thái ở trang chi tiết nick.
 */
export function nextAccountStatus(currentStatus: string, verdict: string): string | null {
  const forced = statusForcedBy(verdict as Parameters<typeof statusForcedBy>[0]);
  if (!forced) return null;
  if (forced === currentStatus) return null;

  // `severity` nhỏ hơn = nặng hơn (xem account-status.ts).
  const isWorse = STATUS_PRESENTATION[forced].severity < getStatusPresentation(currentStatus).severity;
  return isWorse ? forced : null;
}

export interface RecordedCheck {
  verdict: string;
  /** Trạng thái nick vừa bị đổi sang, `null` nếu giữ nguyên. */
  statusChangedTo: string | null;
}

export async function recordHealthCheck(
  account: AccountToCheck,
  result: ProbeResult,
  now: Date = new Date(),
): Promise<RecordedCheck> {
  const { evaluation, karma, visiblePosts, expectedPosts, screenshot } = result;

  const screenshotPath = screenshot ? saveScreenshot(account.id, screenshot, now) : null;
  const statusChangedTo = nextAccountStatus(account.status, evaluation.verdict);

  // Gom mọi thao tác ghi vào một transaction: ghi được bản ghi dò mà không đổi được trạng thái
  // nick là tình trạng tệ nhất — bảng báo nick bị ẩn còn bộ luật vẫn cho nó đăng tiếp.
  const writes: Prisma.PrismaPromise<unknown>[] = [
    prisma.healthCheck.create({
      data: {
        accountId: account.id,
        checkedAt: now,
        verdict: evaluation.verdict,
        shadowbanned: evaluation.shadowbanned,
        karma,
        visiblePosts,
        expectedPosts,
        detail: evaluation.detail,
        screenshotPath,
      },
    }),
  ];

  // Karma chỉ ghi khi thật sự đọc được. Ghi 0 khi không đọc được là bịa ra một cú tụt karma
  // mà biểu đồ 30 ngày sẽ vẽ ra y như thật.
  if (karma !== null) {
    writes.push(prisma.account.update({ where: { id: account.id }, data: { karma } }));
  }

  if (statusChangedTo) {
    writes.push(
      prisma.account.update({
        where: { id: account.id },
        data: { status: statusChangedTo, quarantineReason: evaluation.detail },
      }),
      prisma.auditLog.create({
        data: {
          accountId: account.id,
          action: "HEALTH_STATUS_FORCED",
          detail: `Bộ dò đổi trạng thái sang ${statusChangedTo}: ${evaluation.detail}`.slice(0, 500),
        },
      }),
    );
  }

  await prisma.$transaction(writes);

  return { verdict: evaluation.verdict, statusChangedTo };
}
