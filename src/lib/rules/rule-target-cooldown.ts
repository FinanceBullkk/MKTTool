/**
 * Luật 5 — Nghỉ giữa hai lần đăng cùng một đích. CHỈ ÁP CHO NỀN TẢNG CỘNG ĐỒNG.
 *
 * Nhiều sub có luật cứng "1 bài / 24h / người". Kể cả sub không ghi luật, mod vẫn để ý
 * nick nào ngày nào cũng xuất hiện ở trang chủ sub.
 *
 * Không áp cho Fanpage: đích chính là trang của mình, đăng hằng ngày mới là đúng việc.
 */
import { ALLOW, type RuleContext, type RuleVerdict, block, warn } from "./rule-types";

export function ruleTargetCooldown(ctx: RuleContext): RuleVerdict {
  const hours = ctx.hoursToNearestPostSameTarget;
  if (hours === null) return ALLOW;

  const { targetCooldownHours, targetCooldownWarnHours } = ctx.thresholds;
  const rounded = Math.round(hours);

  if (hours < targetCooldownHours) {
    return block(
      `Nick has another post on ${ctx.target.name} only ${rounded} hours from this one; ` +
        `posts must be at least ${targetCooldownHours} hours apart.`,
    );
  }

  if (hours < targetCooldownWarnHours) {
    return warn(
      `The nick's nearest post on ${ctx.target.name} is only ${rounded} hours away. ` +
        `For a safer cadence, keep at least ${targetCooldownWarnHours} hours between posts.`,
    );
  }

  return ALLOW;
}
