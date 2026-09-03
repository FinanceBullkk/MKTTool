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
    return block(`${name} requires at least ${minKarma} karma; this nick has ${karma}.`);
  }

  if (minAccountAgeDays > 0) {
    const age = accountAgeInDays(platformCreatedAt, ctx.at);

    if (age === null) {
      return warn(
        `${name} requires nicks to be at least ${minAccountAgeDays} days old, but this nick has no ` +
          "platform creation date, so its age cannot be checked.",
      );
    }

    if (age < minAccountAgeDays) {
      return block(
        `${name} requires nicks to be ${minAccountAgeDays} days old; this nick is only ${age} days old.`,
      );
    }
  }

  if (minKarma > 0) {
    const marginPercent = ((karma - minKarma) / minKarma) * 100;
    if (marginPercent < ctx.thresholds.karmaWarnMarginPercent) {
      return warn(
        `Karma ${karma} is only ${Math.round(marginPercent)}% above ${name}'s minimum of ${minKarma}. ` +
          "One downvoted post could put the nick below the threshold.",
      );
    }
  }

  return ALLOW;
}
