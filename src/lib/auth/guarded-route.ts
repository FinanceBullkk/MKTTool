/**
 * Bọc gác đăng nhập cho route handler trong `src/app/api/`.
 *
 * Tách khỏi `guarded-action.ts` vì hợp đồng lỗi khác hẳn: server action trả `ActionResult`
 * để hiện chữ lên màn hình, còn route handler phải trả **mã HTTP đúng** — 401 khi chưa đăng
 * nhập, 403 khi đã đăng nhập nhưng không đủ quyền. Nhét `{ ok: false }` kèm HTTP 200 vào đây
 * là nói dối mọi thứ đọc mã trạng thái, kể cả log của chính máy chủ.
 *
 * ## Quan hệ với `isSameOrigin` đang có
 *
 * Lớp `isSameOrigin` **giữ nguyên, không thay**. Hai lớp trả lời hai câu khác nhau:
 *
 * - `isSameOrigin` — *"request này có phải do chính trang của mình gửi không"* (chống CSRF).
 * - Gác đăng nhập — *"người gửi là ai và có quyền không"*.
 *
 * Một trang web độc hại không vượt được lớp một; một người lạ biết địa chỉ không vượt được
 * lớp hai. Bỏ lớp nào cũng để hở một nhóm tấn công khác nhau.
 */
import { NextResponse } from "next/server";
import { type Actor, AuthorizationError, requireActor, requireAdmin } from "./require-actor";

/** Đổi lỗi quyền thành Response kèm đúng mã HTTP. */
function toResponse(error: unknown): NextResponse {
  if (!(error instanceof AuthorizationError)) throw error;

  return NextResponse.json(
    { ok: false, message: error.message },
    { status: error.needsLogin ? 401 : 403 },
  );
}

/** Route handler cần đăng nhập. */
export function guardedRoute<TArgs extends unknown[]>(
  handler: (actor: Actor, ...args: TArgs) => Promise<Response>,
): (...args: TArgs) => Promise<Response> {
  return async (...args: TArgs) => {
    let actor: Actor;
    try {
      actor = await requireActor();
    } catch (error) {
      return toResponse(error);
    }

    return handler(actor, ...args);
  };
}

/** Route handler chỉ quản trị viên gọi được. */
export function adminRoute<TArgs extends unknown[]>(
  handler: (actor: Actor, ...args: TArgs) => Promise<Response>,
): (...args: TArgs) => Promise<Response> {
  return async (...args: TArgs) => {
    let actor: Actor;
    try {
      actor = await requireAdmin();
    } catch (error) {
      return toResponse(error);
    }

    return handler(actor, ...args);
  };
}
