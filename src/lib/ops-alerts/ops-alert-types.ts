/**
 * Hợp đồng chung của khay cảnh báo vận hành.
 *
 * ## Khay này KHÁC gì các dải cảnh báo ở trang Hôm nay
 *
 * Dải ở trang Hôm nay nói về **dữ liệu**: proxy chết, token Facebook sắp hết hạn, nick lâu chưa
 * dò. Người đọc xử lý xong thì dải tắt, và trang Hôm nay là đúng chỗ vì đó là việc của một buổi
 * làm việc.
 *
 * Khay này nói về **cấu hình hệ thống đang sai** — thứ khiến cả một tính năng mất tác dụng mà
 * mọi màn hình vẫn trông bình thường. Nó phải hiện ở MỌI trang, vì người đọc không có lý do gì
 * để ghé trang Hôm nay trước khi làm việc, và vì thứ đang hỏng không nằm ở trang nào cả.
 *
 * ## Vì sao một vùng nhiều mục, thay vì mỗi cảnh báo một dải riêng
 *
 * Chốt 05/08/2026 (kế hoạch GĐ3). Sẽ có ít nhất ba nguồn cảnh báo loại này: hai vùng khóa chung
 * nhau (đây), cầu nối chạy bản cũ (GĐ4), và cảnh báo môi trường chạy thật (GĐ5). Gộp tất cả vào
 * một câu thì người đọc phải tự đoán phần nào dành cho mình; để rời ba chỗ thì cái thứ hai và
 * thứ ba bị bỏ qua theo cách khác. Một vùng cố định + mỗi vấn đề một dòng có hành động riêng
 * giải cả hai, và cảnh báo thứ tư chỉ là thêm một mục chứ không phải quyết lại chỗ đặt.
 */

/**
 * Ai nhìn thấy mục này.
 *
 * Lọc theo **ai sửa được**, không theo "ai quan tâm". Cảnh báo tới tay người không có đường sửa
 * là thứ họ học cách phớt lờ, và thói quen phớt lờ đó dính sang cả những mục họ sửa được.
 */
export type OpsAlertAudience = "ADMIN" | "EVERYONE";

/** Mức nặng nhẹ — dùng lại đúng bảng màu của `AlertBanner`. */
export type OpsAlertTone = "amber" | "red";

export interface OpsAlert {
  /**
   * Khóa ổn định của loại cảnh báo. Dùng làm `key` khi vẽ danh sách và làm mỏ neo trong test —
   * đừng đổi khi chỉ sửa câu chữ.
   */
  id: string;
  tone: OpsAlertTone;
  audience: OpsAlertAudience;
  /** Một câu nói ĐANG SAI CÁI GÌ. Không viết lời khuyên vào đây — đó là việc của `action`. */
  message: string;
  /**
   * Việc phải làm tiếp, viết ở dạng người đọc gõ/bấm được.
   *
   * Bắt buộc: cảnh báo không kèm đường đi tiếp là cảnh báo bị phớt lờ. Cùng lý do với
   * `HealthSetupWarning.href` ở trang Hôm nay.
   */
  action: string;
}
