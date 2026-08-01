/**
 * Gộp các loại đích về "họ nền tảng".
 *
 * Bộ chặn trùng nội dung chỉ so sánh TRONG CÙNG một họ: các nền tảng không chia sẻ dữ liệu
 * với nhau nên đăng cùng một bài lên Reddit và Facebook là bình thường. Ngược lại,
 * Fanpage và Group đều là Facebook — đăng trùng giữa chúng vẫn bị Meta nhìn thấy.
 */

export const PLATFORM_FAMILIES = ["REDDIT", "FACEBOOK"] as const;
export type PlatformFamily = (typeof PLATFORM_FAMILIES)[number];

export function platformFamily(platform: string): PlatformFamily | string {
  if (platform === "REDDIT") return "REDDIT";
  if (platform.startsWith("FACEBOOK")) return "FACEBOOK";
  return platform;
}

/** Nick Reddit không đăng được lên Fanpage — chặn ngay lúc chọn, không đợi rules engine. */
export function isPlatformCompatible(accountPlatform: string, targetPlatform: string): boolean {
  return platformFamily(accountPlatform) === platformFamily(targetPlatform);
}
