/**
 * Ngưỡng của bộ luật.
 *
 * Bắt đầu CHẶT rồi nới dần theo số liệu thật (Phase 03), chứ không đoán từ đầu.
 * Sửa ngưỡng bằng cách thêm dòng vào bảng RuleConfig (`npm run db:studio`),
 * không cần sửa code, không cần build lại.
 */

export interface RuleThresholds {
  /** Số bài tối đa một nick được đăng trong một ngày. */
  maxPostsPerDay: number;
  /** Đăng tới bài thứ mấy trong ngày thì cảnh báo. */
  warnPostsPerDay: number;
  /** Khoảng nghỉ tối thiểu giữa 2 bài cùng một đích (giờ). */
  targetCooldownHours: number;
  /** Dưới mốc này thì cảnh báo (giờ). */
  targetCooldownWarnHours: number;
  /** Jaccard từ mức này trở lên là chặn. */
  similarityBlock: number;
  /** Jaccard từ mức này trở lên là cảnh báo. */
  similarityWarn: number;
  /** Chỉ so trùng với bài trong ngần này ngày trở lại. */
  similarityWindowDays: number;
  /** Karma dư dưới ngần này phần trăm so với mức tối thiểu của sub thì cảnh báo. */
  karmaWarnMarginPercent: number;
  /** Vừa hết cold-start trong ngần này ngày thì vẫn cảnh báo. */
  coldStartWarnDays: number;
  /** Nick khác hoạt động cùng đích trong ngần này giờ thì cảnh báo đụng độ. */
  threadCollisionWarnHours: number;
  /** Bài có từ ngần này link trở lên thì cảnh báo (dễ dính bộ lọc tự động). */
  linkCountWarn: number;
  /** Kết quả dò sức khỏe cũ hơn ngần này ngày thì coi như chưa biết gì (Phase 03). */
  healthCheckStaleDays: number;
}

export const DEFAULT_RULE_THRESHOLDS: RuleThresholds = {
  maxPostsPerDay: 2,
  warnPostsPerDay: 1,
  targetCooldownHours: 24,
  targetCooldownWarnHours: 48,
  similarityBlock: 0.7,
  similarityWarn: 0.5,
  similarityWindowDays: 30,
  karmaWarnMarginPercent: 20,
  coldStartWarnDays: 2,
  threadCollisionWarnHours: 1,
  linkCountWarn: 2,
  healthCheckStaleDays: 3,
};

/**
 * Ghi đè mặc định bằng các dòng lấy từ bảng RuleConfig.
 * Key lạ hoặc giá trị không phải số thì bỏ qua — cấu hình hỏng không được phép
 * làm sập bộ luật, tệ nhất là quay về mặc định (vốn chặt hơn).
 */
export function applyThresholdOverrides(
  rows: { key: string; value: string }[],
  base: RuleThresholds = DEFAULT_RULE_THRESHOLDS,
): RuleThresholds {
  const result: RuleThresholds = { ...base };

  for (const row of rows) {
    if (!(row.key in result)) continue;
    const parsed = Number(row.value);
    if (!Number.isFinite(parsed) || parsed < 0) continue;
    result[row.key as keyof RuleThresholds] = parsed;
  }

  return result;
}
