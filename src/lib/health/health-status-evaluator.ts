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
      `Không mở được trang profile: ${navigationError} ` +
        "Chưa biết gì về sức khỏe nick — đừng coi đây là tin tốt.",
    );
  }

  // Proxy quan sát viên bị chặn thì lần dò này vô giá trị, nhưng KHÔNG nói gì về nick.
  // Đây là nhánh dễ làm sai nhất: coi captcha của proxy là checkpoint của nick sẽ cách ly
  // nhầm cả đàn nick khỏe mỗi lần Reddit bóp proxy.
  if (checkpoint?.scope === "PROBE") {
    return conclude(
      "ERROR",
      `${checkpoint.reason} Lần dò này không kết luận được gì về nick. ` +
        "Giãn lịch dò hoặc đổi proxy quan sát viên rồi chạy lại.",
    );
  }

  if (checkpoint?.scope === "ACCOUNT") {
    return conclude(
      "CHECKPOINT",
      `${checkpoint.reason} Nick đã bị cách ly, mọi job của nó sẽ bị bộ luật chặn. ` +
        "Xử lý tay trên nền tảng, KHÔNG tự giải captcha.",
    );
  }

  if (!profile) {
    return conclude("ERROR", "Bộ dò không trả về kết quả đọc trang nào. Xem log của lần chạy.");
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
        ? "Reddit không còn tìm thấy trang profile này, dù lần dò trước vẫn đọc được nó. " +
            "Nick vừa biến mất khỏi mắt người ngoài — shadowban toàn cục, hoặc nick đã bị xóa. " +
            "Dừng đăng bằng nick này ngay; đăng tiếp chỉ tốn content."
        : "Reddit không tìm thấy trang profile này khi xem ở chế độ chưa đăng nhập. Bốn nguyên " +
            "nhân cho ra cùng một trang: nick bị ẩn toàn cục, username khai sai trong kho, nick " +
            "đã bị xóa, hoặc nick chưa từng tồn tại. Chưa có lượt dò nào từng đọc được profile " +
            "này nên chưa loại trừ được cái nào — KIỂM CHÍNH TẢ USERNAME trước đã. Nick vẫn bị " +
            "cách ly cho tới khi xác minh, vì để một nick đã bị ẩn đăng tiếp thì tốn content " +
            "mà không ai biết.",
    );
  }

  if (profile.kind === "UNPARSEABLE") {
    return conclude("ERROR", profile.reason);
  }

  // Không có bài nào để so thì lần dò này chỉ chứng minh nick còn tồn tại với người ngoài —
  // KHÔNG chứng minh bài của nó hiện ra. Đây từng trả "HEALTHY" và đó là chỗ duy nhất trong
  // bộ dò dịch "thiếu dữ liệu" thành "tin tốt": ai đó đăng đều mà quên bấm "Đã đăng" sẽ thấy
  // một bảng toàn màu xanh đúng vào lúc không ai còn canh gì cả.
  if (expectedPosts === 0) {
    return conclude(
      "NO_BASELINE",
      `Nick hiện ra bình thường với người ngoài, nhưng chưa bài nào được đánh dấu đã đăng ` +
        `trong ${windowDays} ngày qua nên không có gì để đối chiếu — ` +
        "đây mới là “nhìn thấy nick”, chưa phải “nhìn thấy bài của nick”. " +
        "Nick đang nghỉ thì bình thường; còn nếu vừa đăng thật thì vào /queue bấm “Đã đăng”, " +
        "vì không đánh dấu là bộ dò mù mà bảng vẫn xanh.",
    );
  }

  if (visiblePosts === null) {
    return conclude(
      "ERROR",
      "Đọc được trang profile nhưng không đọc được danh sách bài, nên không đối chiếu được " +
        `với ${expectedPosts} bài đã đăng. Mở tay old.reddit.com để đối chiếu.`,
    );
  }

  if (visiblePosts === 0) {
    return conclude(
      "SHADOWBANNED",
      `Nick hiện ra bình thường nhưng KHÔNG bài nào trong ${expectedPosts} bài đã đăng ` +
        `${windowDays} ngày qua nhìn thấy được từ ngoài. Đây là kiểu ẩn từng bài — ` +
        "nguy hiểm hơn shadowban toàn cục vì nhìn từ trong vẫn thấy đủ. " +
        "Cũng có thể mod đã xóa hết bài, nên mở tay một link bài ở chế độ ẩn danh để xác nhận " +
        "trước khi bỏ nick — nhưng cho tới lúc xác nhận thì cứ coi như đang bị ẩn.",
    );
  }

  if (visiblePosts < expectedPosts * VISIBLE_POST_WARN_RATIO) {
    return conclude(
      "WARN",
      `Chỉ thấy ${visiblePosts}/${expectedPosts} bài đã đăng trong ${windowDays} ngày qua. ` +
        "Có thể do mod xóa bài, cũng có thể là bị ẩn từng bài. Theo dõi thêm vài ngày; " +
        "tỷ lệ tụt tiếp thì dừng đăng.",
    );
  }

  return conclude(
    "HEALTHY",
    `Thấy ${visiblePosts}/${expectedPosts} bài đã đăng trong ${windowDays} ngày qua ` +
      "từ góc nhìn người ngoài.",
  );
}
