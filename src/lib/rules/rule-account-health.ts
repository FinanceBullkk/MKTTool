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
    `Nick đang ở trạng thái "${presentation.label}" — chỉ nick khỏe mới được đăng. ${presentation.hint}`,
  );
}

export function ruleColdStart(ctx: RuleContext): RuleVerdict {
  const until = ctx.account.coldStartUntil;
  if (!until) return ALLOW;

  const msRemaining = until.getTime() - ctx.at.getTime();

  if (msRemaining > 0) {
    const days = Math.ceil(msRemaining / MS_PER_DAY);
    return block(
      `Nick còn ${days} ngày cold-start (tới ${formatDayMonth(until)}). ` +
        "Trong cold-start chỉ đọc và tương tác nhẹ, cấm đăng bài.",
    );
  }

  // Vừa ra khỏi cold-start là lúc dễ chết nhất: nền tảng vẫn đang soi kỹ nick mới hoạt động lại.
  const daysSinceEnd = Math.abs(msRemaining) / MS_PER_DAY;
  if (daysSinceEnd < ctx.thresholds.coldStartWarnDays) {
    return warn(
      `Nick vừa hết cold-start ngày ${formatDayMonth(until)} — đi nhẹ vài hôm đầu, ` +
        "đừng đăng dồn.",
    );
  }

  return ALLOW;
}
