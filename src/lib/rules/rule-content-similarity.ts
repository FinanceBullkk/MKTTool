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
      `Giống ${percent}% với bài "${match.candidate.label}" trên cùng nền tảng. ` +
        "Đăng nội dung na ná giữa nhiều nick cùng nền tảng là nguyên nhân shadowban số 1 — " +
        "viết lại hẳn hoặc đổi sang nền tảng khác.",
    );
  }

  if (match.score >= similarityWarn) {
    return warn(
      `Giống ${percent}% với bài "${match.candidate.label}". Chưa tới ngưỡng chặn nhưng nên ` +
        "đổi mở bài và ví dụ cho khác đi.",
    );
  }

  return ALLOW;
}
