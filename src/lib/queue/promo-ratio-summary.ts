/**
 * Bảng theo dõi tỷ lệ promo cho từng cặp (nick × đích).
 *
 * Cùng công thức với rule-promo-ratio.ts nhưng nhìn từ hướng ngược lại: thay vì trả lời
 * "bài này có đăng được không", nó trả lời "cặp này còn nợ mấy bài hữu ích".
 */
import { ACTIVE_JOB_STATUSES } from "@/lib/content/content-types";
import { prisma } from "@/lib/db/prisma-client";

export interface PromoRatioRow {
  accountUsername: string;
  targetName: string;
  valueCount: number;
  promoCount: number;
  ratio: number;
  /** Còn thiếu bao nhiêu bài hữu ích mới được đăng bài quảng cáo tiếp theo. */
  missingForNextPromo: number;
}

export async function loadPromoRatioRows(): Promise<PromoRatioRow[]> {
  const jobs = await prisma.postJob.findMany({
    where: { status: { in: ACTIVE_JOB_STATUSES } },
    select: {
      accountId: true,
      targetId: true,
      account: { select: { username: true } },
      target: { select: { name: true, promoRatio: true } },
      contentItem: { select: { type: true } },
    },
  });

  const byPair = new Map<string, PromoRatioRow>();

  for (const job of jobs) {
    const key = `${job.accountId}:${job.targetId}`;
    const row = byPair.get(key) ?? {
      accountUsername: job.account.username,
      targetName: job.target.name,
      valueCount: 0,
      promoCount: 0,
      ratio: job.target.promoRatio,
      missingForNextPromo: 0,
    };

    if (job.contentItem.type === "PROMO") row.promoCount += 1;
    else row.valueCount += 1;

    byPair.set(key, row);
  }

  for (const row of byPair.values()) {
    row.missingForNextPromo =
      row.ratio <= 0 ? 0 : Math.max(0, (row.promoCount + 1) * row.ratio - row.valueCount);
  }

  return [...byPair.values()].sort(
    (left, right) =>
      left.accountUsername.localeCompare(right.accountUsername) ||
      left.targetName.localeCompare(right.targetName),
  );
}
