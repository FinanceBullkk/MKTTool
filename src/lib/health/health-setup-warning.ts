/**
 * Quyết định trang Hôm nay nên nói gì về bộ dò shadowban — hàm thuần, test được không cần DB.
 *
 * Trước đợt này trang Hôm nay chỉ có một câu duy nhất: *"N nick chưa được dò gần đây"*. Câu đó
 * ĐÚNG VỀ HIỆN TƯỢNG NHƯNG SAI VỀ NGUYÊN NHÂN khi kho chưa có proxy quan sát viên nào — lúc ấy
 * sự thật là "chưa từng chạy và KHÔNG THỂ chạy", còn câu kia lại gợi ý "lâu rồi chưa chạy, chạy
 * lại đi".
 *
 * Hậu quả: một dải cảnh báo hiện vĩnh viễn, không bao giờ tự tắt được dù người dùng làm gì trên
 * màn hình đó. Dải nào không bao giờ tắt thì trong một tuần sẽ được học cách phớt lờ — và tới
 * lúc nó nói chuyện thật thì cũng không ai còn nhìn.
 *
 * Nên tách ba tình huống, mỗi tình huống một câu và MỘT việc phải làm tiếp.
 */

export type HealthSetupWarningKind = "NO_OBSERVER_PROXY" | "NEVER_CHECKED" | "STALE";

export interface HealthSetupWarning {
  kind: HealthSetupWarningKind;
  message: string;
  /** Đường đi tiếp theo — cảnh báo không kèm việc phải làm là cảnh báo bị phớt lờ. */
  href: string;
  linkLabel: string;
  tone: "amber" | "red";
}

export interface HealthSetupInput {
  /** Số nick Reddit trong kho. Không có nick thì không có gì để dò. */
  redditAccountCount: number;
  /** Số proxy quan sát viên ĐANG BẬT. Tắt hết cũng như không có. */
  activeObserverProxyCount: number;
  /** Số nick chưa được dò lần nào. */
  neverCheckedCount: number;
  /** Số nick đã dò nhưng lần dò gần nhất đã quá cũ. */
  staleCount: number;
}

/**
 * Trả về đúng MỘT cảnh báo, hoặc `null` khi không có gì phải nói.
 *
 * Ba dải cùng lúc nói về cùng một chuyện là ba lần phiền cho một vấn đề, nên thứ tự ưu tiên
 * ở đây cũng chính là thứ tự người dùng phải xử lý.
 */
export function evaluateHealthSetup(input: HealthSetupInput): HealthSetupWarning | null {
  // Kho chưa có nick Reddit nào là trạng thái BÌNH THƯỜNG của một cài đặt mới, không phải lỗi.
  if (input.redditAccountCount === 0) return null;

  if (input.activeObserverProxyCount === 0) {
    return {
      kind: "NO_OBSERVER_PROXY",
      message:
        "The shadowban checker cannot run because the vault has no enabled observer proxy. " +
        "Without a check, nobody knows whether this nick's posts are still visible to public viewers; silence is not good news.",
      href: "/proxies",
      linkLabel: "configure an observer proxy",
      tone: "red",
    };
  }

  if (input.neverCheckedCount > 0) {
    return {
      kind: "NEVER_CHECKED",
      message:
        `${input.neverCheckedCount} nicks have never been checked, so their visibility to public viewers is unknown.`,
      href: "/health",
      linkLabel: 'click "Check all nicks"',
      tone: "amber",
    };
  }

  if (input.staleCount > 0) {
    return {
      kind: "STALE",
      message:
        `${input.staleCount} nicks have not been checked recently, so the dashboard data is no longer reliable.`,
      href: "/health",
      linkLabel: "run the checks again",
      tone: "amber",
    };
  }

  return null;
}
