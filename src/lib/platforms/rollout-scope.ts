/**
 * Nền tảng nào còn nằm trong phạm vi bàn giao cho team — và cách chặn khi không.
 *
 * ## Vì sao cần file này
 *
 * Quyết định 02/09/2026 rút Reddit và Facebook khỏi phạm vi bàn giao. Code không xóa, dịch vụ
 * vẫn deploy, `TARGET_PLATFORMS` vẫn liệt kê đủ ba loại đích. Cái thay đổi là **operator được
 * yêu cầu dùng cái gì**.
 *
 * Trước file này, ranh giới đó giữ bằng thỏa thuận giữa người với nhau: năm trang đăng bài đã
 * rút khỏi thanh điều hướng và có `ParkedScopeBanner`, nhưng route vẫn mở, màn hình vẫn render,
 * và **nút vẫn đăng thật**. Người thứ năm vào tuần sau không dự cuộc họp nào cả; họ mở bookmark,
 * thấy một cái nút, và bấm. Với `publishJobToPage` thì cú bấm đó là một bài thật trên Fanpage
 * thật, không có gì gỡ lại được ngoài xóa tay.
 *
 * Chú thích trong `parked-scope-banner.tsx` nói thẳng ý định lúc đó: *"rút khỏi thanh điều
 * hướng, không phải xóa code"*. Đúng cho việc khám phá — sai cho việc chặn. Banner giải thích,
 * nó không từ chối. File này bổ sung phần từ chối.
 *
 * ## Vì sao mặc định là RỖNG
 *
 * Mặc định an toàn phải là "không nền tảng nào mở", không phải "mở trừ khi ai đó nhớ đóng".
 * Thêm một loại đích mới vào `TARGET_PLATFORMS` mà quên nghĩ tới phạm vi thì nó rơi vào trạng
 * thái bị chặn — ồn ào và sửa được — thay vì lặng lẽ mở một đường đăng ra thế giới.
 *
 * Đây là cùng một lối nghĩ với `MANUAL_POST_PLATFORMS` trong `platform-family.ts`: suy ra chứ
 * không khai tay, và suy theo hướng an toàn.
 *
 * ## Mở lại là quyết định của chủ dự án, không phải mặc định
 *
 * Đặt biến môi trường `ROLLOUT_PLATFORMS` (danh sách ngăn bằng dấu phẩy) để mở lại. Cố ý bắt
 * đi qua biến môi trường chứ không phải sửa hằng số trong code: mở lại một nền tảng kéo theo
 * mọi mục còn treo của nền tảng đó — với Fanpage là đường publish cross-operator chưa ai nhận —
 * nên nó cần một hành động có chủ đích của người vận hành, ghi lại được trong lịch sử deploy.
 *
 * `ROLLOUT_PLATFORMS=FACEBOOK_PAGE` mở lại đúng Fanpage. `ROLLOUT_PLATFORMS=` hoặc không đặt
 * thì mọi đường đăng đều đóng.
 */
import { TARGET_PLATFORMS } from "./platform-family";

/** Tên biến môi trường mở lại nền tảng. Ở đây để test và tài liệu cùng đọc một chỗ. */
export const ROLLOUT_SCOPE_ENV = "ROLLOUT_PLATFORMS";

const PLATFORM_LABELS: Record<string, string> = {
  REDDIT: "Reddit",
  FACEBOOK_PAGE: "Facebook Fanpage",
  FACEBOOK_GROUP: "Facebook Group",
};

/** Nhãn dành cho operator; enum kỹ thuật không đi thẳng ra thông báo. */
export function rolloutPlatformLabel(platform: string): string {
  return PLATFORM_LABELS[platform.toUpperCase()] ?? "Nền tảng này";
}

/**
 * Đọc phạm vi từ môi trường ở **thời điểm gọi**, không phải lúc nạp module.
 *
 * Đọc một lần lúc nạp thì test không đổi được biến môi trường giữa các trường hợp, và cái giá
 * thật của nó là test sẽ phải mock module thay vì kiểm hành vi thật — kiểu test xanh mà không
 * chứng minh gì.
 */
function scopedPlatforms(): readonly string[] {
  const raw = process.env[ROLLOUT_SCOPE_ENV];
  if (!raw) return [];
  return raw
    .split(",")
    .map((entry) => entry.trim().toUpperCase())
    .filter((entry) => entry.length > 0);
}

/**
 * Nền tảng này có nằm trong phạm vi bàn giao không?
 *
 * Nhận `string` chứ không phải `TargetPlatform` vì chỗ gọi thật cầm giá trị đọc từ cơ sở dữ
 * liệu — một job cũ có thể mang loại đích đã bị gỡ khỏi hằng số. Giá trị lạ thì trả `false`:
 * không biết là không mở.
 */
export function isPlatformInRolloutScope(platform: string): boolean {
  return scopedPlatforms().includes(platform.toUpperCase());
}

/** Mọi loại đích đang bị chặn — dùng cho màn hình muốn liệt kê, không dùng để quyết định. */
export function parkedPlatforms(): readonly string[] {
  return TARGET_PLATFORMS.filter((platform) => !isPlatformInRolloutScope(platform));
}

/** Không còn nền tảng nào mở, tức công cụ đang thuần là kho danh tính dùng chung. */
export function isPostingFullyParked(): boolean {
  return parkedPlatforms().length === TARGET_PLATFORMS.length;
}

/**
 * Câu từ chối hiện thẳng cho người bấm nút.
 *
 * Nói ba điều, theo đúng quy ước của `ActionResult`: chuyện gì vừa xảy ra, vì sao, và ai mở
 * được. Không nói "lỗi" vì đây không phải lỗi — người bấm không làm gì sai, họ chỉ đang ở một
 * trang mà quyết định phạm vi đã bỏ lại phía sau.
 */
export function parkedPlatformMessage(platform: string): string {
  const label = rolloutPlatformLabel(platform);
  return (
    `${label} đã ra khỏi phạm vi bàn giao từ 02/09/2026 nên không đăng được. ` +
    `Trang này chỉ dùng để xem lịch sử. Quay lại kho nick tại /accounts để tiếp tục; ` +
    `nếu nghiệp vụ này được mở lại, liên hệ chủ dự án.`
  );
}
