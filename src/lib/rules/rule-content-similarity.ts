/**
 * Luật 7 — Trùng nội dung trong cùng một họ nền tảng.
 *
 * Đây là nguyên nhân shadowban số 1. Reddit gọi thẳng tên nó là "coordinated inauthentic
 * behavior": nhiều nick đăng nội dung na ná nhau. Nền tảng không cần biết bạn là ai —
 * chỉ cần thấy văn bản giống nhau.
 *
 * Khác nền tảng thì không sao, nên đối chứng đã được lọc theo họ nền tảng ở context builder.
 */
import { findMostSimilar } from "./content-similarity-calculator";
import { ALLOW, type RuleContext, type RuleVerdict, block, warn } from "./rule-types";
import { combineContentText } from "./text-normalizer";

export function ruleContentSimilarity(ctx: RuleContext): RuleVerdict {
  const text = combineContentText(ctx.content.title, ctx.content.body);
  const match = findMostSimilar(text, ctx.recentContentSamePlatform);
  if (!match) return ALLOW;

  const { similarityBlock, similarityWarn } = ctx.thresholds;
  const percent = Math.round(match.score * 100);

  if (match.score >= similarityBlock) {
    return block(
      `${percent}% similar to "${match.candidate.label}" on the same platform. ` +
        "Publishing similar content through multiple nicks on one platform is a major shadowban risk. " +
        "Rewrite it completely or use another platform.",
    );
  }

  if (match.score >= similarityWarn) {
    return warn(
      `${percent}% similar to "${match.candidate.label}". It is below the blocking threshold, but ` +
        "change the opening and examples to make the post more distinct.",
    );
  }

  return ALLOW;
}
