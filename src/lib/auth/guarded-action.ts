/**
 * Bọc gác đăng nhập thành **hình dạng bắt buộc của định nghĩa** server action.
 *
 * ## Vì sao bọc ngoài chứ không đặt một dòng `await requireActor()` ở đầu thân hàm
 *
 * Một dòng ở đầu thân hàm là thứ **quên được** và **lách được**:
 *
 * - Thêm action mới mà quên dòng đó thì không có gì đỏ — lối vào đó lặng lẽ mở toang.
 * - Dòng đó có thể nằm trong một nhánh `if`, và không phép kiểm tự động nào phân biệt nổi
 *   "gọi luôn" với "gọi khi biến X đúng". Test chỉ quét được chuỗi ký tự trong thân hàm,
 *   tức là một phép kiểm gần như luôn xanh — kiểu hỏng tệ nhất của một phép kiểm an toàn.
 *
 * Bọc ngoài thì gác nằm ở **chữ ký**, không nằm trong thân hàm. Không có nhánh nào bỏ qua
 * được nó, và `guarded-entry-points.test.ts` kiểm được bằng hình dạng: mọi export trong file
 * `"use server"` phải là `export const X = guardedAction(...)`. Viết `export async function`
 * là test đỏ ngay, kể cả khi thân hàm có gọi `requireActor()`.
 *
 * Đây là lý do 42 lối vào của dự án được gác bằng một quy tắc kiểm được, thay vì bằng 42 lần
 * nhớ không quên.
 *
 * ## Vì sao trả `ActionResult` thay vì để lỗi ném ra
 *
 * Quy ước sẵn có của dự án (xem `action-result.ts` và chú thích trong `vault-credential-actions.ts`):
 * lỗi ném ra khỏi server action thì trình duyệt chỉ thấy một promise reject chung chung, nút
 * trông như hỏng mà không có chữ nào giải thích. Người dùng bị từ chối quyền cần biết **vì sao**
 * và **làm gì tiếp** — nhất là câu "nick này do người khác phụ trách", vốn không phải lỗi mà là
 * thông tin.
 */
import type { ActionResult } from "../actions/action-result";
import { type Actor, AuthorizationError, requireActor, requireAdmin } from "./require-actor";

/**
 * Đổi lỗi quyền thành câu tiếng Việt hiện thẳng cho người dùng.
 *
 * Chỉ nuốt `AuthorizationError`. Mọi lỗi khác vẫn ném tiếp — nuốt hết là biến lỗi lập trình
 * thành thông báo "không có quyền", và người đi sửa sẽ đi sai hướng hoàn toàn.
 */
function toActionResult(error: unknown): ActionResult {
  if (!(error instanceof AuthorizationError)) throw error;

  return {
    ok: false,
    message: error.needsLogin
      ? `${error.message} Tải lại trang để đăng nhập.`
      : error.message,
  };
}

/**
 * Server action cần đăng nhập. Vai trò nào cũng gọi được.
 *
 * `actor` được tiêm vào tham số đầu, nên thân hàm dùng được ngay để đính `actorId` vào
 * `AuditLog` mà không phải tự đi lấy phiên lần nữa.
 *
 * Chữ ký nhìn từ phía gọi **không đổi**: `guardedAction(async (actor, id) => ...)` trả về
 * một hàm nhận đúng `(id)`. Nhờ vậy không phải sửa chỗ gọi nào trong components.
 */
export function guardedAction<TArgs extends unknown[], TResult>(
  handler: (actor: Actor, ...args: TArgs) => Promise<TResult>,
): (...args: TArgs) => Promise<TResult | ActionResult> {
  return async (...args: TArgs) => {
    let actor: Actor;
    try {
      actor = await requireActor();
    } catch (error) {
      return toActionResult(error);
    }

    return handler(actor, ...args);
  };
}

/**
 * Server action chỉ quản trị viên gọi được — phân công nick, và các việc đụng tới cả đàn.
 *
 * Tách hẳn thành wrapper riêng thay vì thêm tham số `{ adminOnly: true }` vào `guardedAction`:
 * tham số thì đọc lướt qua rất dễ bỏ sót, còn tên hàm khác nhau thì nhìn một cái là biết lối
 * vào này thuộc loại nào. Test quét cũng phân biệt được hai loại mà không phải đọc tham số.
 */
export function adminAction<TArgs extends unknown[], TResult>(
  handler: (actor: Actor, ...args: TArgs) => Promise<TResult>,
): (...args: TArgs) => Promise<TResult | ActionResult> {
  return async (...args: TArgs) => {
    let actor: Actor;
    try {
      actor = await requireAdmin();
    } catch (error) {
      return toActionResult(error);
    }

    return handler(actor, ...args);
  };
}
