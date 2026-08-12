/**
 * Đọc ra **cái gì vừa đổi** khi phân công lại cụm của một nick, rồi dựng hàng `AuditLog` và
 * câu báo cho người bấm.
 *
 * ## Vì sao tách khỏi server action
 *
 * Đây là phần duy nhất có nhánh: hai ô, mỗi ô bốn khả năng chuyển trạng thái. Nằm trong
 * `assignAccountCluster` thì muốn kiểm nó phải dựng database, dựng phiên ADMIN, dựng người
 * dùng — mười dòng chuẩn bị cho một phép so chuỗi. Tách ra thì nó là hàm thuần, và bảng
 * chuyển trạng thái được kiểm hết bằng test thường.
 *
 * Hàm này **không** kiểm tính hợp lệ (máy có thuộc chủ không, chủ còn trong team không) — việc
 * đó xong trước khi tới đây. Nó chỉ trả lời "vừa đổi gì".
 */
import { AUDIT_ACTIONS, type AuditAction } from "@/lib/audit/audit-log-actions";

/** Hai ô của cụm. `null` = chưa gán. */
export interface ClusterState {
  ownerId: string | null;
  deviceId: string | null;
}

export interface ClusterChangeInput {
  before: ClusterState;
  after: ClusterState;
  /** Email của `after.ownerId`, hoặc `null` khi đang gỡ chủ. */
  ownerEmail: string | null;
  /** Tên máy của `after.deviceId`, hoặc `null` khi đang gỡ ghim. */
  deviceName: string | null;
  /** Tên máy cũ — cần cho câu "chuyển từ X sang Y". */
  previousDeviceName: string | null;
}

export interface ClusterChange {
  /** Mỗi thứ vừa đổi một hàng. Rỗng nghĩa là bấm lưu mà không đổi gì. */
  auditActions: { action: AuditAction; detail: string }[];
  /** Câu hiện cho người vừa bấm, đã ghép cả hai vế. */
  message: string;
}

/**
 * Câu nhắc khi một nick chuyển từ máy này sang máy khác.
 *
 * Ba bước, và bước thứ ba là bước luôn bị bỏ. Bỏ nó thì nick sống ở hai máy cùng lúc: một
 * phiên đăng nhập, hai bộ tín hiệu thiết bị, và hai người có thể cùng đăng một bài mà bộ dò
 * không phân biệt được.
 *
 * Cảnh báo chứ không chặn: chuyển hẳn sang máy mới rồi xóa bản cũ là chuyện người thật vẫn làm.
 * Thứ giết nick là *xoay vòng giữa hai máy* và *quên xóa bản cũ* — cả hai đều nằm ngoài tầm với
 * của database, nên chỗ đúng để can thiệp là câu chữ cộng dấu vết trong sổ.
 */
export const DEVICE_MOVE_WARNING =
  "MKT Browser profiles DO NOT move automatically: export on the old machine -> import on the new machine -> **delete the copy on the old machine**. " +
  "Skipping the last step leaves the account active on two machines at once, which is one of the easiest ways to lose it.";

export function describeClusterChange(input: ClusterChangeInput): ClusterChange {
  const { before, after, ownerEmail, deviceName, previousDeviceName } = input;

  const auditActions: ClusterChange["auditActions"] = [];
  const parts: string[] = [];

  if (before.ownerId !== after.ownerId) {
    if (after.ownerId === null) {
      auditActions.push({
        action: AUDIT_ACTIONS.ACCOUNT_OWNER_CLEARED,
        detail: "gỡ chủ của nick",
      });
      parts.push(
        "đã gỡ chủ — từ giờ chỉ quản trị viên lấy được mật khẩu và OTP, vì nick không có chủ " +
          "thì OPERATOR nào cũng bị từ chối",
      );
    } else {
      auditActions.push({
        action: AUDIT_ACTIONS.ACCOUNT_OWNER_ASSIGNED,
        detail: `giao nick cho ${ownerEmail}`,
      });
      parts.push(`đã giao cho ${ownerEmail}`);
    }
  }

  if (before.deviceId !== after.deviceId) {
    if (after.deviceId === null) {
      auditActions.push({
        action: AUDIT_ACTIONS.ACCOUNT_DEVICE_UNPINNED,
        detail: `gỡ ghim khỏi máy "${previousDeviceName}"`,
      });
      parts.push(
        `đã gỡ ghim khỏi máy "${previousDeviceName}" — chưa ghim máy nào thì không mở profile ` +
          `và không lấy được bí mật của nick`,
      );
    } else if (before.deviceId === null) {
      auditActions.push({
        action: AUDIT_ACTIONS.ACCOUNT_DEVICE_PINNED,
        detail: `ghim nick vào máy "${deviceName}"`,
      });
      parts.push(`đã ghim vào máy "${deviceName}"`);
    } else {
      auditActions.push({
        action: AUDIT_ACTIONS.ACCOUNT_DEVICE_MOVED,
        detail: `chuyển nick từ máy "${previousDeviceName}" sang máy "${deviceName}"`,
      });
      parts.push(
        `đã chuyển từ máy "${previousDeviceName}" sang máy "${deviceName}". ${DEVICE_MOVE_WARNING}`,
      );
    }
  }

  return { auditActions, message: parts.join("; ") };
}
