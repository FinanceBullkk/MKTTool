/**
 * Quy mọi thứ dò được về một kết luận kèm lý do đọc được bằng tiếng Việt.
 *
 * Hàm thuần — đây là chỗ chứa toàn bộ phán đoán của Phase 03, nên nó phải test được hết
 * nhánh mà không cần proxy, không cần mạng, không cần nick.
 *
 * Thứ tự xét có chủ ý và không đảo được: thứ chặn đường phải xét TRƯỚC nội dung trang, vì
 * một trang captcha vẫn có thể chứa vài chữ trông như trang profile.
 */
import type { CheckpointSignal } from "./checkpoint-detector";
import type { RedditProfile } from "./reddit-profile-parser";
import type { HealthVerdict } from "./health-verdict";

/**
 * Thấy dưới ngần này so với số bài đã đăng thì nghi bị ẩn từng bài.
 * Không đặt cao hơn: mod xóa bài là chuyện thường ngày, và báo động giả nhiều lần thì
 * người dùng sẽ ngừng đọc cảnh báo — lúc đó cảnh báo thật cũng trôi qua.
 */
export const VISIBLE_POST_WARN_RATIO = 0.5;

export interface HealthEvaluationInput {
  /** Tín hiệu chặn đường bắt được ở trang vừa mở, nếu có. */
  checkpoint: CheckpointSignal | null;
  /** Kết quả đọc trang profile. `null` khi chưa mở được trang. */
  profile: RedditProfile | null;
  /** Lỗi mạng hoặc lỗi mở trang, nếu có. */
  navigationError?: string | null;
  /** Số bài đã đánh dấu POSTED trong cửa sổ quan sát. */
  expectedPosts: number;
  /** Số bài người ngoài thấy được trong cùng cửa sổ. `null` khi không đọc được danh sách. */
  visiblePosts: number | null;
  windowDays: number;
  /**
   * Đã từng có lượt dò nào ĐỌC ĐƯỢC trang profile của nick này chưa.
   *
   * Chỉ dùng cho nhánh 404, và nó là mảnh bằng chứng duy nhất phân biệt được "nick bị ẩn"
   * với "username khai sai" — hai thứ Reddit trả về y hệt nhau. Từng thấy rồi mà giờ mất
   * thì loại trừ được khả năng gõ sai; chưa thấy bao giờ thì không loại trừ được gì.
   */
  profileSeenBefore?: boolean;
  /**
   * Bài thấy được trên profile mà KHÔNG khớp job nào trong kho.
   *
   * Đây là chiều so sánh mà bộ dò từng mù hoàn toàn. Thiếu nó thì một bài đăng ngoài công cụ
   * sẽ không bao giờ lộ ra, mà bài không được ghi làm bốn luật giữ nhịp đếm thiếu: hạn mức
   * ngày, giãn cách cùng đích, tỷ lệ promo và chặn đụng độ thread đều dễ dãi hơn thực tế.
   * Tức là lỗi sổ sách âm thầm biến bộ luật thành thứ tạo ra chính cái nó phải ngăn.
   */
  untrackedPostKeys?: readonly string[];
  /**
   * Job đã đánh dấu đăng nhưng KHÔNG tìm thấy bài tương ứng trên profile.
   *
   * Không tự thành một kết luận riêng — nó chỉ làm rõ thêm cho các nhánh "thấy ít hơn dự
   * kiến" bằng cách chỉ đúng link nào không thấy, thay vì chỉ nói thiếu mấy bài.
   */
  missingPostKeys?: readonly string[];
}

/** Liệt kê vài khóa đầu, còn lại gộp thành "và N nữa" — câu cảnh báo phải đọc được. */
function listKeys(keys: readonly string[], limit = 3): string {
  const shown = keys.slice(0, limit).join(", ");
  return keys.length > limit ? `${shown} and ${keys.length - limit} more` : shown;
}

export interface HealthEvaluation {
  verdict: HealthVerdict;
  shadowbanned: boolean;
  detail: string;
}

function conclude(verdict: HealthVerdict, detail: string): HealthEvaluation {
  return { verdict, shadowbanned: verdict === "SHADOWBANNED", detail };
}

export function evaluateHealth(input: HealthEvaluationInput): HealthEvaluation {
  const { checkpoint, profile, navigationError, expectedPosts, visiblePosts, windowDays } = input;

  if (navigationError) {
    return conclude(
      "ERROR",
      `Could not open the profile page: ${navigationError}. ` +
        "Nick health is unknown. Fix the error and run the check again; do not treat this as good news.",
    );
  }

  // Proxy quan sát viên bị chặn thì lần dò này vô giá trị, nhưng KHÔNG nói gì về nick.
  // Đây là nhánh dễ làm sai nhất: coi captcha của proxy là checkpoint của nick sẽ cách ly
  // nhầm cả đàn nick khỏe mỗi lần Reddit bóp proxy.
  if (checkpoint?.scope === "PROBE") {
    return conclude(
      "ERROR",
      `${checkpoint.reason} This check says nothing about the nick. ` +
        "Space out checks or change the observer proxy, then run it again.",
    );
  }

  if (checkpoint?.scope === "ACCOUNT") {
    return conclude(
      "CHECKPOINT",
      `${checkpoint.reason} The nick is quarantined, so the posting rules will block all of its jobs. ` +
        "Handle the checkpoint manually on the platform; do not automate CAPTCHA solving.",
    );
  }

  if (!profile) {
    return conclude(
      "ERROR",
      "The checker returned no readable page result. Review the run log, fix the failure, and run the check again.",
    );
  }

  // Reddit trả về ĐÚNG MỘT trang cho bốn tình huống khác nhau: nick bị ẩn toàn cục, username
  // khai sai, nick đã bị xóa, nick chưa từng tồn tại. Bản đầu của nhánh này khẳng định luôn là
  // "shadowban toàn cục" — và ngay lượt dò thật đầu tiên (04/08/2026) nó đã cách ly nhầm một
  // nick khỏe chỉ vì username trong kho là nhãn tự đặt chứ không phải tên thật trên Reddit.
  //
  // Vẫn giữ kết luận SHADOWBANNED cho cả hai nhánh, có chủ ý: cách ly nhầm một nick khỏe thì
  // ồn ào và sửa được bằng tay, còn để một nick đã bị ẩn tiếp tục đăng thì im lặng và tốn
  // content mỗi ngày. Thứ sửa ở đây là ĐỘ CHẮC CHẮN của câu chữ, không phải hành động.
  if (profile.kind === "MISSING") {
    return conclude(
      "SHADOWBANNED",
      input.profileSeenBefore
        ? "Reddit can no longer find this profile page, although an earlier check could read it. " +
            "The nick has disappeared from public view: it may be globally shadowbanned or deleted. " +
            "Stop posting with this nick now; continuing would only waste content."
        : "Reddit cannot find this profile page while signed out. The same page can mean one of four things: " +
            "the nick is globally shadowbanned, the username is wrong in the vault, the nick was deleted, or it never existed. " +
            "No earlier check has successfully read this profile, so none of those causes can be ruled out. " +
            "Check the username spelling first. Keep the nick quarantined until it is verified, because continuing to post with a hidden nick would waste content without anyone noticing.",
    );
  }

  if (profile.kind === "UNPARSEABLE") {
    return conclude("ERROR", profile.reason);
  }

  // Xét trước mọi nhánh đếm: không đọc được danh sách thì không so được gì, kể cả khi kho
  // trống. "Kho trống" không phải lý do để nói nhẹ đi một lượt dò mù.
  if (visiblePosts === null) {
    return conclude(
      "ERROR",
      "The profile page loaded, but the post list could not be read, so the checker cannot compare it " +
        `with the ${expectedPosts} recorded posts. Open old.reddit.com manually to verify the page, then run the check again.`,
    );
  }

  // Chiều so sánh mà bộ dò từng mù hoàn toàn: NGOÀI ĐỜI CÓ MÀ KHO KHÔNG BIẾT.
  //
  // Xét TRƯỚC nhánh "chưa có gì để so", vì nick có 0 job trong kho mà 3 bài trên profile chính
  // là ca lệch nặng nhất — mà nhánh dưới lại trả "chưa có gì để đối chiếu" đúng lúc đang có
  // rất nhiều thứ để đối chiếu.
  //
  // Có khóa thì chỉ đích danh từng bài; không có khóa thì vẫn kết luận được bằng số lượng.
  // Đừng bỏ nhánh đếm: nick nào bộ dò không đọc được `data-permalink` sẽ im lặng trở lại.
  const untracked = input.untrackedPostKeys ?? [];
  const untrackedByCount = visiblePosts - expectedPosts;

  if (untracked.length > 0 || untrackedByCount > 0) {
    const howMany = untracked.length > 0 ? untracked.length : untrackedByCount;
    return conclude(
      "UNTRACKED_POSTS",
      `Public viewers can see ${visiblePosts} posts from the last ${windowDays} days, but the vault records only ` +
        `${expectedPosts}; ${howMany} posts have no matching job` +
        (untracked.length > 0 ? ` (${listKeys(untracked)})` : "") +
        ". The posting rules count jobs, so every unrecorded post makes the daily cap, same-target cooldown, " +
        "promotional ratio, and thread-collision checks more permissive than reality. Record the missing posts in /queue. " +
        "Include manual nurturing posts and posts from a previous owner; the rules know only what has been recorded.",
    );
  }

  // Không có bài nào để so thì lần dò này chỉ chứng minh nick còn tồn tại với người ngoài —
  // KHÔNG chứng minh bài của nó hiện ra. Đây từng trả "HEALTHY" và đó là chỗ duy nhất trong
  // bộ dò dịch "thiếu dữ liệu" thành "tin tốt": ai đó đăng đều mà quên bấm "Đã đăng" sẽ thấy
  // một bảng toàn màu xanh đúng vào lúc không ai còn canh gì cả.
  if (expectedPosts === 0) {
    return conclude(
      "NO_BASELINE",
      `The nick is publicly visible, but no posts were marked as posted in the last ${windowDays} days, so there is no comparison baseline. ` +
        "This proves only that the nick is visible, not that its posts are visible. An inactive nick is fine; " +
        'if it posted recently, open /queue and click "Mark as posted" so the checker is not blind while the dashboard still looks healthy.',
    );
  }

  if (visiblePosts === 0) {
    return conclude(
      "SHADOWBANNED",
      `The nick is publicly visible, but none of its ${expectedPosts} recorded posts from the last ${windowDays} days are visible from outside. ` +
        "This suggests per-post hiding, which is more dangerous than a global shadowban because the posts still look normal when signed in. " +
        "Moderators may also have removed every post, so open one post link in a private window to confirm before retiring the nick. " +
        "Until confirmed, treat the nick as shadowbanned and stop posting.",
    );
  }

  const missing = input.missingPostKeys ?? [];

  if (visiblePosts < expectedPosts * VISIBLE_POST_WARN_RATIO) {
    return conclude(
      "WARN",
      `Only ${visiblePosts}/${expectedPosts} recorded posts from the last ${windowDays} days are publicly visible. ` +
        (missing.length > 0 ? `Not found: ${listKeys(missing)}. ` : "") +
        "Moderators may have removed posts, or individual posts may be hidden. Monitor for a few more days; " +
        "if the ratio keeps falling, stop posting.",
    );
  }

  return conclude(
    "HEALTHY",
    `${visiblePosts}/${expectedPosts} recorded posts from the last ${windowDays} days are visible to public viewers.`,
  );
}
