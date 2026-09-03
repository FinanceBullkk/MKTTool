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
      `${ctx.target.name} does not allow links, but this post contains ${linkCount}. ` +
        "Remove the links, or add one in a comment after the post is live.",
    );
  }

  if (linkCount >= ctx.thresholds.linkCountWarn) {
    return warn(
      `This post contains ${linkCount} links. More links increase the risk of automated filtering; keep only one.`,
    );
  }

  return ALLOW;
}
