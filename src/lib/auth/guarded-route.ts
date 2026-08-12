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

/**
 * Route handler mà **máy** gọi được bằng một chìa riêng, còn người thì vẫn phải đăng nhập.
 *
 * Sinh ra cho một tình huống có thật: máy dựng installer không có trình duyệt và không có phiên
 * Google, nhưng nó cần tải một bản Relay đã phát hành. Cách cũ là dán cookie phiên của một người
 * thật vào biến môi trường — một tấm chìa mở cả kho danh tính, cho một việc cần đúng một file.
 *
 * ## Vì sao chìa sai lại rơi xuống lớp đăng nhập
 *
 * Trả lời khác đi cho "chìa sai" và "không có chìa" là dựng sẵn một máy đoán: người dò chỉ cần
 * nhìn mã trạng thái đổi là biết mình đang đoán gần đúng. Cả hai đường ở đây kết thúc giống hệt
 * nhau — 401 của lớp đăng nhập.
 *
 * ## Handler KHÔNG nhận `Actor`
 *
 * Cố ý, và đây là phần quan trọng nhất: máy không phải một con người, nên không có `Actor` nào để
 * đưa. Handler nào cần biết ai đang gọi thì phải dùng `guardedRoute` chứ không phải hàm này —
 * kiểu dữ liệu ở đây làm điều đó thành lỗi biên dịch chứ không phải một chỗ quên.
 *
 * Phần "chìa nào là hợp lệ" nằm ở chỗ gọi, không nằm ở đây: module xác thực giữ **quyết định**,
 * còn việc một token phát hành trông ra sao là chuyện của tầng nghiệp vụ.
 */
export function machineOrGuardedRoute<TRest extends unknown[]>(
  isMachineCaller: (request: Request) => boolean,
  handler: (request: Request, ...rest: TRest) => Promise<Response>,
): (request: Request, ...rest: TRest) => Promise<Response> {
  return async (request, ...rest) => {
    if (isMachineCaller(request)) return handler(request, ...rest);

    try {
      await requireActor();
    } catch (error) {
      return toResponse(error);
    }

    return handler(request, ...rest);
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
