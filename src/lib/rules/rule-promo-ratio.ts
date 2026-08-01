/**
 * Luật 6 — Tỷ lệ 9:1.
 *
 * Một trong hai luật không nền tảng nào tha thứ. Hầu hết sub ngách áp tỷ lệ
 * 9 đóng góp hữu ích : 1 bài có nhắc sản phẩm. Vi phạm thì mod (người thật) để ý,
 * mà mod để ý thì soi cả cụm nick chứ không chỉ bài đó.
 *
 * Cách đếm là TỶ LỆ TRƯỢT, không phải "đủ 9 bài một lần rồi thôi": bài quảng cáo thứ N
 * đòi N × ratio bài hữu ích. Đăng quảng cáo xong thì phải nuôi tiếp mới được quảng cáo nữa.
 */
import { ALLOW, type RuleContext, type RuleVerdict, block, warn } from "./rule-types";

export function rulePromoRatio(ctx: RuleContext): RuleVerdict {
  if (ctx.content.type !== "PROMO") return ALLOW;

  const ratio = ctx.target.promoRatio;
  if (ratio <= 0) return ALLOW; // đích không áp tỷ lệ (Fanpage của mình chẳng hạn)

  const { valueCount, promoCount } = ctx.promoTally;
  const required = (promoCount + 1) * ratio;
  const missing = required - valueCount;
  const tally = `${valueCount} bài hữu ích / ${promoCount} bài quảng cáo`;

  if (missing > 0) {
    return block(
      `Luật ${ratio}:1 — ở ${ctx.target.name} nick mới có ${tally}. ` +
        `Còn thiếu ${missing} bài hữu ích nữa mới được đăng bài quảng cáo này.`,
    );
  }

  if (missing === 0) {
    return warn(
      `Vừa đủ hạn mức ${ratio}:1 ở ${ctx.target.name} (${tally}). Đăng xong là hết quota — ` +
        `phải có thêm ${ratio} bài hữu ích mới được quảng cáo lần nữa.`,
    );
  }

  return ALLOW;
}
