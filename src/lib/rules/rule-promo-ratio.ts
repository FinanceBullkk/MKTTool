/**
 * Luật 6 — Tỷ lệ 9:1. CHỈ ÁP CHO NỀN TẢNG CỘNG ĐỒNG.
 *
 * Một trong hai luật không cộng đồng nào tha thứ. Hầu hết sub ngách áp tỷ lệ
 * 9 đóng góp hữu ích : 1 bài có nhắc sản phẩm. Vi phạm thì mod (người thật) để ý,
 * mà mod để ý thì soi cả cụm nick chứ không chỉ bài đó.
 *
 * Cách đếm là TỶ LỆ TRƯỢT, không phải "đủ 9 bài một lần rồi thôi": bài quảng cáo thứ N
 * đòi N × ratio bài hữu ích. Đăng quảng cáo xong thì phải nuôi tiếp mới được quảng cáo nữa.
 *
 * Không áp cho Fanpage: kênh thương hiệu vốn dĩ để bán hàng, bắt 9 bài hữu ích mới cho
 * quảng cáo một lần là chặn gần hết nội dung hợp lệ.
 */
import { ALLOW, type RuleContext, type RuleVerdict, block, warn } from "./rule-types";

export function rulePromoRatio(ctx: RuleContext): RuleVerdict {
  if (ctx.content.type !== "PROMO") return ALLOW;

  const ratio = ctx.target.promoRatio;
  if (ratio <= 0) return ALLOW; // đích không áp tỷ lệ (Fanpage của mình chẳng hạn)

  const { valueCount, promoCount } = ctx.promoTally;
  const required = (promoCount + 1) * ratio;
  const missing = required - valueCount;
  const tally = `${valueCount} value posts / ${promoCount} promotional posts`;

  if (missing > 0) {
    return block(
      `${ctx.target.name} uses a ${ratio}:1 rule; this nick currently has ${tally}. ` +
        `Add ${missing} more value post${missing === 1 ? "" : "s"} before publishing this promotion.`,
    );
  }

  if (missing === 0) {
    return warn(
      `The nick only just meets the ${ratio}:1 ratio on ${ctx.target.name} (${tally}). ` +
        `After this post, add ${ratio} more value posts before the next promotion.`,
    );
  }

  return ALLOW;
}
