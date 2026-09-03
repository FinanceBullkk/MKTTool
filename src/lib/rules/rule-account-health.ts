/**
 * Luật 1 — Sức khỏe nick. Luật 2 — Cold start.
 *
 * Hai luật rẻ nhất và cứng nhất: nick đang bị nghi ngờ hoặc chưa "chín" thì không đăng gì hết.
 * Đăng bằng nick dính checkpoint là cách nhanh nhất biến cảnh báo mềm thành khóa vĩnh viễn.
 */
import { getStatusPresentation } from "@/lib/accounts/account-status";
import { MS_PER_DAY, formatDayMonth } from "@/lib/format/vietnamese-date-format";
import { ALLOW, type RuleContext, type RuleVerdict, block, warn } from "./rule-types";

export function ruleAccountHealth(ctx: RuleContext): RuleVerdict {
  if (ctx.account.status === "ALIVE") return ALLOW;

  const presentation = getStatusPresentation(ctx.account.status);
  return block(
    `Nick status is "${presentation.label}". Only a healthy nick can publish. ${presentation.hint}`,
  );
}

export function ruleColdStart(ctx: RuleContext): RuleVerdict {
  const until = ctx.account.coldStartUntil;
  if (!until) return ALLOW;

  const msRemaining = until.getTime() - ctx.at.getTime();

  if (msRemaining > 0) {
    const days = Math.ceil(msRemaining / MS_PER_DAY);
    return block(
      `Nick has ${days} day${days === 1 ? "" : "s"} of cold start remaining (until ${formatDayMonth(until)}). ` +
        "During cold start, only reading and light interaction are allowed; do not publish posts.",
    );
  }

  // Vừa ra khỏi cold-start là lúc dễ chết nhất: nền tảng vẫn đang soi kỹ nick mới hoạt động lại.
  const daysSinceEnd = Math.abs(msRemaining) / MS_PER_DAY;
  if (daysSinceEnd < ctx.thresholds.coldStartWarnDays) {
    return warn(
      `Nick's cold start ended on ${formatDayMonth(until)}. Ease back in for the first few days; ` +
        "do not post in bursts.",
    );
  }

  return ALLOW;
}
