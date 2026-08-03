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
import { normalizeThreadUrl } from "@/lib/rules/rule-thread-collision";
import { statusForcedBy } from "./health-verdict";
import type { ProbeResult } from "./reddit-shadowban-prober";

/** Ảnh có thể chứa tên nick và nội dung bài — thư mục này đã nằm trong .gitignore. */
export const SCREENSHOT_DIR = path.join("data", "screenshots");

export interface AccountToCheck {
  id: string;
  username: string;
  status: string;
}

/**
 * Số bài KHÁC NHAU đã đánh dấu đã đăng trong cửa sổ quan sát — mẫu số để đối chiếu với số
 * bài người ngoài thấy được.
 *
 * Đếm URL khác nhau chứ KHÔNG đếm số job, và đây là chỗ từng sai. Đo thật 04/08/2026: một nick
 * có hai job `POSTED` dán trùng đúng một link, nên mẫu số thành 2 trong khi ngoài đời chỉ có
 * một bài. Người ngoài thấy đủ 1/1 mà bảng hiện "1/2" — vừa đúng sát ngưỡng cảnh báo (thấy dưới
 * một nửa). Thêm một job trùng nữa là nick sạch bị báo "Nghi ngờ".
 *
 * Mẫu số phải đếm thứ bộ dò CÓ THỂ NHÌN THẤY trên trang profile, mà trang đó liệt kê bài chứ
 * không liệt kê job.
 */
export async function countExpectedPosts(
  accountId: string,
  windowDays: number,
  now: Date = new Date(),
): Promise<number> {
  const jobs = await prisma.postJob.findMany({
    where: {
      accountId,
      status: "POSTED",
      postedAt: { gte: new Date(now.getTime() - windowDays * MS_PER_DAY) },
    },
    select: { postedUrl: true },
  });

  return countDistinctPostedUrls(jobs);
}

/**
 * Gộp job theo bài thật. Hàm thuần, tách ra để test không cần database.
 *
 * Job chưa dán link thì không gộp được với ai — đếm riêng từng cái. Chọn hướng này thay vì bỏ
 * qua chúng vì bài không có link vẫn là bài có thật trên trang profile; bỏ qua là thu nhỏ mẫu
 * số và làm một nick đang bị ẩn trông khỏe hơn thực tế.
 */
export function countDistinctPostedUrls(jobs: { postedUrl: string | null }[]): number {
  const distinctThreads = new Set<string>();
  let withoutUrl = 0;

  for (const job of jobs) {
    const url = job.postedUrl?.trim();
    if (!url) {
      withoutUrl += 1;
      continue;
    }
    // Dùng lại đúng bộ chuẩn hóa của luật 8 — cùng một bài Reddit có vô số dạng URL, và hai
    // nơi tự rút gọn theo kiểu riêng là hai nơi cho ra hai câu trả lời khác nhau.
    distinctThreads.add(normalizeThreadUrl(url));
  }

  return distinctThreads.size + withoutUrl;
}

/**
 * Đã từng có lượt dò nào ĐỌC ĐƯỢC trang profile của nick này chưa.
 *
 * Dùng `visiblePosts` chứ không dùng `verdict`: cột đó chỉ khác `null` đúng khi bộ dò đọc
 * được danh sách bài trên trang (xem `probeRedditAccount`), nên nó là dấu hiệu chính xác của
 * "trang profile có thật và đọc được". Còn `verdict` thì không phân biệt được — kết luận
 * SHADOWBANNED sinh ra từ cả trang 404 lẫn trang đọc được mà không thấy bài nào.
 *
 * Đây là mảnh bằng chứng duy nhất tách "nick bị ẩn" khỏi "username khai sai" ở nhánh 404.
 */
export async function hasEverSeenProfile(accountId: string): Promise<boolean> {
  const seen = await prisma.healthCheck.findFirst({
    where: { accountId, visiblePosts: { not: null } },
    select: { id: true },
  });
  return seen !== null;
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
