/**
 * Luật 9 — Chính sách link của đích đến.
 *
 * Nhiều sub cấm thẳng link ngoài, hoặc để AutoModerator gỡ im lặng bài có link.
 * Bài bị gỡ im lặng là tệ nhất: mình tưởng đã đăng, thật ra không ai thấy.
 */
import { ALLOW, type RuleContext, type RuleVerdict, block, warn } from "./rule-types";

const URL_PATTERN = /https?:\/\/[^\s<>"')\]]+/gi;

/** Bắt cả link người dùng gõ thẳng trong thân bài, không chỉ link khai ở ô riêng. */
export function extractUrls(text: string): string[] {
  return text.match(URL_PATTERN) ?? [];
}

export function ruleLinkPolicy(ctx: RuleContext): RuleVerdict {
  const linkCount = ctx.content.links.length;
  if (linkCount === 0) return ALLOW;

  if (!ctx.target.allowsLinks) {
    return block(
      `${ctx.target.name} cấm đăng link nhưng bài có ${linkCount} link. ` +
        "Bỏ link đi, hoặc để link ở bình luận sau khi bài đã sống.",
    );
  }

  if (linkCount >= ctx.thresholds.linkCountWarn) {
    return warn(
      `Bài có ${linkCount} link. Càng nhiều link càng dễ dính bộ lọc tự động — giữ 1 link thôi.`,
    );
  }

  return ALLOW;
}
