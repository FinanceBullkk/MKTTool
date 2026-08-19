/**
 * Gộp các loại đích về "họ nền tảng".
 *
 * Bộ chặn trùng nội dung chỉ so sánh TRONG CÙNG một họ: các nền tảng không chia sẻ dữ liệu
 * với nhau nên đăng cùng một bài lên Reddit và Facebook là bình thường. Ngược lại,
 * Fanpage và Group đều là Facebook — đăng trùng giữa chúng vẫn bị Meta nhìn thấy.
 */

export const PLATFORM_FAMILIES = ["REDDIT", "FACEBOOK", "TIKTOK"] as const;
export type PlatformFamily = (typeof PLATFORM_FAMILIES)[number];

/**
 * Mọi loại đích đăng được. Dùng chung cho form và bộ luật để hai nơi không lệch nhau.
 *
 * TIKTOK **không** có mặt ở đây dù là một họ nền tảng hợp lệ: nó là nơi nick sống, không phải
 * đích mà pipeline đăng bài nhắm tới. Pipeline (hàng đợi, đích đăng, bộ luật) đang tạm gác từ
 * 19/08/2026 — xem `plans/260819-1059-tiktok-only-ui-rescope/`. Thêm TIKTOK vào danh sách này
 * là bật lại cả bộ luật giữ nhịp cho một nền tảng chưa có bộ đăng nào.
 */
export const TARGET_PLATFORMS = ["REDDIT", "FACEBOOK_PAGE", "FACEBOOK_GROUP"] as const;
export type TargetPlatform = (typeof TARGET_PLATFORMS)[number];

/**
 * Nền tảng cộng đồng — mình là KHÁCH trong nhà người khác: có mod, có luật riêng của
 * sub/group, có hàng xóm để ý xem nick nào ngày nào cũng xuất hiện.
 *
 * FACEBOOK_PAGE nằm ngoài danh sách này vì Fanpage là kênh của chính mình: đăng 5 bài một
 * ngày, đăng đều đặn, hay đăng toàn nội dung quảng cáo đều là chuyện bình thường và không
 * ai phạt. Mấy luật giữ nhịp cho nick đi xin phép chỉ đúng với nền tảng cộng đồng.
 */
export const COMMUNITY_PLATFORMS = ["REDDIT", "FACEBOOK_GROUP"] as const;

/**
 * Đích đăng được bằng API chính thức — hiện chỉ Fanpage (Graph API, xem facebook-page-publisher.ts).
 */
export const AUTO_PUBLISH_PLATFORMS = ["FACEBOOK_PAGE"] as const;

/**
 * Đích phải đăng tay: người mở profile, dán nội dung, tự bấm đăng.
 *
 * SUY RA từ hai hằng trên chứ không khai tay danh sách thứ ba — hai danh sách phải giữ khớp
 * bằng tay là chỗ sớm muộn cũng lệch. Cách suy này còn cho mặc định AN TOÀN: thêm một loại
 * đích mới mà chưa viết bộ đăng tự động cho nó thì nó rơi vào "đăng tay", tức vẫn hiện ở
 * nhắc việc — thay vì im lặng biến mất khỏi mọi màn hình.
 */
export const MANUAL_POST_PLATFORMS: readonly string[] = TARGET_PLATFORMS.filter(
  (platform) => !(AUTO_PUBLISH_PLATFORMS as readonly string[]).includes(platform),
);

/**
 * Dùng ở hai chỗ: bộ luật (rules-engine.ts) và form ghi tương tác tay
 * (interaction-actions.ts) — form đó gọi thẳng luật 8 chứ không đi qua engine.
 * Cả hai phải hỏi cùng một nguồn, lệch nhau là luật chặn ở đường này mà lọt ở đường kia.
 */
export function isCommunityPlatform(platform: string): boolean {
  return (COMMUNITY_PLATFORMS as readonly string[]).includes(platform);
}

export function platformFamily(platform: string): PlatformFamily | string {
  if (platform === "REDDIT") return "REDDIT";
  if (platform.startsWith("FACEBOOK")) return "FACEBOOK";
  if (platform === "TIKTOK") return "TIKTOK";
  return platform;
}

/** Nick Reddit không đăng được lên Fanpage — chặn ngay lúc chọn, không đợi rules engine. */
export function isPlatformCompatible(accountPlatform: string, targetPlatform: string): boolean {
  return platformFamily(accountPlatform) === platformFamily(targetPlatform);
}
