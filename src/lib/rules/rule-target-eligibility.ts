/**
 * Luật 3 — Đủ điều kiện đích đến.
 *
 * Sub ngách giờ hầu hết đòi karma và tuổi nick tối thiểu. Bài không đủ điều kiện bị AutoModerator
 * gỡ ngay — vô hại một lần, nhưng lặp lại là mod người thật bắt đầu soi cả cụm nick.
 */
import { accountAgeInDays } from "@/lib/accounts/account-status";
import { ALLOW, type RuleContext, type RuleVerdict, block, warn } from "./rule-types";

export function ruleTargetEligibility(ctx: RuleContext): RuleVerdict {
  const { minKarma, minAccountAgeDays, name } = ctx.target;
  const { karma, platformCreatedAt } = ctx.account;

  if (minKarma > 0 && karma < minKarma) {
    return block(`${name} đòi tối thiểu ${minKarma} karma, nick mới có ${karma}.`);
  }

  if (minAccountAgeDays > 0) {
    const age = accountAgeInDays(platformCreatedAt, ctx.at);

    if (age === null) {
      return warn(
        `${name} đòi nick tối thiểu ${minAccountAgeDays} ngày tuổi nhưng nick chưa nhập ` +
          "ngày tạo trên nền tảng — không kiểm tra được.",
      );
    }

    if (age < minAccountAgeDays) {
      return block(`${name} đòi nick ${minAccountAgeDays} ngày tuổi, nick này mới ${age} ngày.`);
    }
  }

  if (minKarma > 0) {
    const marginPercent = ((karma - minKarma) / minKarma) * 100;
    if (marginPercent < ctx.thresholds.karmaWarnMarginPercent) {
      return warn(
        `Karma ${karma} chỉ dư ${Math.round(marginPercent)}% so với mức ${minKarma} của ${name}. ` +
          "Một bài bị downvote là tụt xuống dưới ngưỡng.",
      );
    }
  }

  return ALLOW;
}
