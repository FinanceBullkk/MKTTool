/**
 * Luật 5 — Nghỉ giữa hai lần đăng cùng một đích.
 *
 * Nhiều sub có luật cứng "1 bài / 24h / người". Kể cả sub không ghi luật, mod vẫn để ý
 * nick nào ngày nào cũng xuất hiện ở trang chủ sub.
 */
import { ALLOW, type RuleContext, type RuleVerdict, block, warn } from "./rule-types";

export function ruleTargetCooldown(ctx: RuleContext): RuleVerdict {
  const hours = ctx.hoursToNearestPostSameTarget;
  if (hours === null) return ALLOW;

  const { targetCooldownHours, targetCooldownWarnHours } = ctx.thresholds;
  const rounded = Math.round(hours);

  if (hours < targetCooldownHours) {
    return block(
      `Nick có bài khác ở ${ctx.target.name} cách bài này ${rounded} tiếng — ` +
        `cần cách ít nhất ${targetCooldownHours} tiếng.`,
    );
  }

  if (hours < targetCooldownWarnHours) {
    return warn(
      `Bài gần nhất của nick ở ${ctx.target.name} chỉ cách ${rounded} tiếng. ` +
        `Thoải mái nhất là để cách ${targetCooldownWarnHours} tiếng.`,
    );
  }

  return ALLOW;
}
