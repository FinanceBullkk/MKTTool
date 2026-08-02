/**
 * Kiểu dữ liệu chung của bộ luật an toàn.
 *
 * Mỗi luật là một HÀM THUẦN `(ctx: RuleContext) => RuleVerdict`. Toàn bộ việc hỏi database
 * nằm ở rule-context-builder.ts. Nhờ vậy mỗi luật test được bằng object dựng tay,
 * không cần database, và chạy trong vài micro giây.
 */
import type { ContentType } from "@/lib/content/content-types";
import type { RuleThresholds } from "./rule-thresholds";

export const RULE_LEVELS = ["ALLOW", "WARN", "BLOCK"] as const;
export type RuleLevel = (typeof RULE_LEVELS)[number];

export type RuleVerdict =
  | { level: "ALLOW" }
  | { level: "WARN"; reason: string }
  | { level: "BLOCK"; reason: string };

export const ALLOW: RuleVerdict = { level: "ALLOW" };

export function warn(reason: string): RuleVerdict {
  return { level: "WARN", reason };
}

export function block(reason: string): RuleVerdict {
  return { level: "BLOCK", reason };
}

/** Mức nào nặng hơn — dùng khi gộp nhiều verdict thành một kết luận. */
export const LEVEL_SEVERITY: Record<RuleLevel, number> = { ALLOW: 0, WARN: 1, BLOCK: 2 };

export interface RuleContextAccount {
  id: string;
  username: string;
  platform: string;
  status: string;
  karma: number;
  coldStartUntil: Date | null;
  platformCreatedAt: Date | null;
}

export interface RuleContextTarget {
  id: string;
  name: string;
  platform: string;
  minKarma: number;
  minAccountAgeDays: number;
  promoRatio: number;
  allowsLinks: boolean;
}

export interface RuleContextContent {
  type: ContentType;
  title: string;
  body: string;
  /** Link trong trường links CỘNG link tìm thấy trong thân bài. */
  links: string[];
}

/** Một bài đã có trong hệ thống, dùng làm đối chứng khi so trùng. */
export interface ComparableContent {
  /** Mô tả đọc được để nêu trong lý do chặn, ví dụ: u/anna ở r/selfhosted ngày 28/07. */
  label: string;
  text: string;
}

/** Hoạt động của một nick KHÁC — dùng cho luật đụng độ. */
export interface OtherAccountActivity {
  accountUsername: string;
  kind: string;
  at: Date;
}

export interface RuleContext {
  /**
   * Mốc thời gian được xét: giờ dự kiến đăng, không phải "bây giờ".
   * Xếp một bài vào sau khi cold-start kết thúc thì phải được cho qua.
   */
  at: Date;
  account: RuleContextAccount;
  target: RuleContextTarget;
  content: RuleContextContent;
  /** Số bài khác của chính nick này trong cùng ngày với `at`. */
  postsSameDay: number;
  /** Số giờ tới bài gần nhất của nick này ở ĐÚNG đích này. null = chưa có bài nào. */
  hoursToNearestPostSameTarget: number | null;
  /** Đếm bài theo cặp (nick × đích), phục vụ luật tỷ lệ promo. */
  promoTally: { valueCount: number; promoCount: number };
  /** Bài cùng họ nền tảng trong cửa sổ so trùng. */
  recentContentSamePlatform: ComparableContent[];
  /** Nick khác của mình đã chạm đúng thread này. */
  threadCollisions: OtherAccountActivity[];
  /** Nick khác của mình hoạt động ở cùng đích quanh mốc `at`. */
  sameTargetNeighbors: OtherAccountActivity[];
  /**
   * Lần dò sức khỏe gần nhất của nick (Phase 03). `null` = chưa dò lần nào.
   *
   * Cố ý tách khỏi `account.status`: status là thứ mình tự đặt, còn cái này là thứ người
   * ngoài nhìn thấy. Luật 10 sống nhờ đúng chỗ hai thứ đó lệch nhau.
   */
  latestHealthCheck: { verdict: string; checkedAt: Date } | null;
  thresholds: RuleThresholds;
}

export type RuleEvaluator = (ctx: RuleContext) => RuleVerdict;
