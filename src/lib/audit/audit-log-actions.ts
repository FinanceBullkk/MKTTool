/**
 * Tên các loại thao tác ghi vào `AuditLog.action`.
 *
 * ## Vì sao gom về một chỗ
 *
 * `action` là cột chuỗi tự do, nên gõ sai một chữ **không hỏng gì cả** — hàng vẫn ghi, request
 * vẫn xanh, không test nào đỏ. Thứ duy nhất mất là câu truy vấn đi tìm nó sau này: đếm số lần
 * lộ credential mà một hàng ghi `CREDENTIAL_REVEAL` thay vì `CREDENTIAL_REVEALED` thì hàng đó
 * biến mất khỏi mọi báo cáo, im lặng, mãi mãi.
 *
 * Kiểu hỏng đó chỉ lộ ra vào đúng ngày cần nhật ký nhất — ngày đi dựng lại xem một chiếc máy
 * đã mất từng lấy được gì. Gom về đây thì gõ sai là TypeScript đỏ ngay lúc gõ.
 *
 * ## Giá trị là hằng số vĩnh viễn
 *
 * Đây là dữ liệu **đã nằm trong database**. Đổi giá trị một dòng ở đây không đổi các hàng ghi
 * trước đó, nên hàng cũ và hàng mới sẽ đếm thành hai loại khác nhau. Muốn đổi tên hiển thị thì
 * đổi ở chỗ hiển thị, đừng đổi ở đây. Thêm dòng mới thì thoải mái.
 */
export const AUDIT_ACTIONS = {
  // Kho danh tính
  ACCOUNT_UPDATED: "ACCOUNT_UPDATED",
  ACCOUNT_OWNER_ASSIGNED: "ACCOUNT_OWNER_ASSIGNED",
  ACCOUNT_OWNER_CLEARED: "ACCOUNT_OWNER_CLEARED",

  // Nick được ghim vào một chiếc máy — xem `Account.deviceId`.
  //
  // Ba loại rời nhau chứ không gộp thành một `ACCOUNT_DEVICE_CHANGED`, vì câu hỏi sẽ phải trả
  // lời vào ngày một nick chết không rõ lý do là *"nick này từng nằm ở máy nào, từ ngày nào"*.
  // Một loại chung thì phải đọc `detail` mới phân biệt nổi, mà `detail` là chuỗi tự do.
  ACCOUNT_DEVICE_PINNED: "ACCOUNT_DEVICE_PINNED",
  ACCOUNT_DEVICE_UNPINNED: "ACCOUNT_DEVICE_UNPINNED",
  /** Đổi từ máy này sang máy khác — ca đáng soi nhất, xem `assignAccountCluster`. */
  ACCOUNT_DEVICE_MOVED: "ACCOUNT_DEVICE_MOVED",
  /**
   * Công cụ tự dựng profile antidetect cho nick, thay vì người dùng chép id vào.
   *
   * Loại riêng vì nó là lần đầu MKTTool **sinh ra** một mảnh danh tính chứ không chỉ ghi lại thứ
   * người ta đã tạo. Ngày cần dựng lại lai lịch một nick, phân biệt được hai chuyện đó là đáng.
   */
  ACCOUNT_PROFILE_CREATED: "ACCOUNT_PROFILE_CREATED",
  /**
   * Lần đầu có người đăng nhập được nick vào profile của nó — xem `Account.firstLoginAt`.
   *
   * Đáng một loại riêng vì đây là mốc **nick bắt đầu tồn tại thật**: trước nó, cái profile chỉ là
   * một trình duyệt rỗng mang proxy. Ngày một nick chết sớm, khoảng cách giữa hàng này và
   * `ACCOUNT_PROFILE_CREATED` là thứ nói được nick đã nằm không bao lâu trước khi ai đó chạm vào.
   */
  ACCOUNT_FIRST_LOGIN: "ACCOUNT_FIRST_LOGIN",

  // Bí mật rời kho — nhóm quan trọng nhất của cả bảng
  CREDENTIAL_REVEALED: "CREDENTIAL_REVEALED",
  OTP_GENERATED: "OTP_GENERATED",

  // Mở profile antidetect
  //
  // Từ GĐ3, máy chủ chỉ phát vé chứ không tự mở profile nữa (xem route launch), nên nó ghi
  // `PROFILE_LAUNCH_TICKET_ISSUED` — thứ nó biết chắc. Hai dòng dưới do bản cũ ghi và **vẫn nằm
  // trong database**: giữ lại để câu truy vấn lịch sử còn đọc được chúng.
  PROFILE_LAUNCH_TICKET_ISSUED: "PROFILE_LAUNCH_TICKET_ISSUED",
  PROFILE_LAUNCHED: "PROFILE_LAUNCHED",
  PROFILE_LAUNCH_FAILED: "PROFILE_LAUNCH_FAILED",
  PROFILE_LAUNCH_BLOCKED_PROXY: "PROFILE_LAUNCH_BLOCKED_PROXY",

  // Sổ đăng ký máy chạy cầu nối
  RELAY_DEVICE_REGISTERED: "RELAY_DEVICE_REGISTERED",
  RELAY_DEVICE_REVOKED: "RELAY_DEVICE_REVOKED",
  RELAY_DEVICE_RETIREMENT_STARTED: "RELAY_DEVICE_RETIREMENT_STARTED",
  RELAY_DEVICE_RETIREMENT_COMPLETED: "RELAY_DEVICE_RETIREMENT_COMPLETED",
  COMPATIBILITY_UPDATE_AUTHORIZED: "COMPATIBILITY_UPDATE_AUTHORIZED",
  COMPATIBILITY_ROLLBACK_AUTHORIZED: "COMPATIBILITY_ROLLBACK_AUTHORIZED",
  /** ADMIN bọc khóa vùng operator cho một máy. Ghi ai cấp, cho máy nào, của ai. */
  RELAY_OPERATOR_KEY_GRANTED: "RELAY_OPERATOR_KEY_GRANTED",

  // Hàng đợi và bộ luật
  RULE_OVERRIDDEN: "RULE_OVERRIDDEN",

  // Facebook
  FACEBOOK_PAGE_PUBLISHED: "FACEBOOK_PAGE_PUBLISHED",
  FACEBOOK_PAGE_PUBLISH_FAILED: "FACEBOOK_PAGE_PUBLISH_FAILED",

  // Bộ dò sức khỏe
  HEALTH_STATUS_FORCED: "HEALTH_STATUS_FORCED",
  HEALTH_AUTO_LINKED_POST: "HEALTH_AUTO_LINKED_POST",
} as const;

export type AuditAction = (typeof AUDIT_ACTIONS)[keyof typeof AUDIT_ACTIONS];
