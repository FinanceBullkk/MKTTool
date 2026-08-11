/**
 * Mở một profile antidetect từ vé đã xác minh.
 *
 * ## Đẩy proxy hỏng thì KHÔNG mở profile
 *
 * Luật này có từ `antidetect-browser-adapter.ts` và không được nới ở đây: profile mở ra mà proxy
 * chưa vào là nick đăng nhập bằng IP nhà, và **mất nick là mất hẳn** — không có thao tác nào gỡ
 * lại được sau đó. Thà không mở còn hơn mở sai IP.
 *
 * Thứ tự vì vậy là bắt buộc: `applyProxy` xong mới `launchProfile`. Adapter đã viết đúng thứ tự
 * đó; việc của file này là **không** thêm đường nào đi vòng qua nó.
 *
 * ## Vì sao câu trả lời nhắc tên proxy
 *
 * The operator sees only one status line because the profile opens in another window. Naming the
 * proxy that was just applied lets them confirm "right nick, right IP" without inspecting MKT
 * Browser settings.
 */
import { AntidetectError } from "../../src/lib/antidetect/antidetect-browser-adapter";
import { TICKET_KINDS, type TicketPayload } from "../../src/lib/tickets/ticket-types";
import type { RelayAntidetect } from "./relay-antidetect";
import type { RelayResponseBody } from "./relay-http-server";

/** Ruột vé mở profile — thu hẹp từ union để chỗ gọi không phải ép kiểu. */
type LaunchPayload = Extract<TicketPayload, { kind: typeof TICKET_KINDS.LAUNCH_PROFILE }>;

export async function launchProfileFromTicket(
  payload: LaunchPayload,
  antidetect: RelayAntidetect,
): Promise<RelayResponseBody> {
  const adapter = antidetect.getAdapter();

  try {
    await adapter.applyProxy(payload.antidetectProfileId, payload.proxy);
  } catch (error) {
    // STOP when applying the proxy fails. Forget the cached MKT Browser probe because a failed
    // proxy update is often the first sign that MKT Browser just stopped.
    antidetect.forgetProbe();
    return {
      ok: false,
      message:
        `Không đẩy được proxy "${payload.proxyLabel}" vào profile, nên KHÔNG mở profile — mở ra ` +
        `lúc này là nick chạy bằng IP nhà. ${describe(error)}`,
    };
  }

  try {
    await adapter.launchProfile(payload.antidetectProfileId);
  } catch (error) {
    antidetect.forgetProbe();
    return {
      ok: false,
      message: `Đã đẩy proxy "${payload.proxyLabel}" nhưng không mở được profile. ${describe(error)}`,
    };
  }

  return {
    ok: true,
    message: `Đã mở profile với proxy "${payload.proxyLabel}". Cửa sổ trình duyệt hiện ở màn hình của bạn.`,
  };
}

/**
 * Việc cần làm, tra theo **mã lỗi** của MKT Browser.
 *
 * Mã là phần nằm trong hợp đồng; câu chữ bên desktop được phép đổi bất cứ lúc nào nên không được
 * so khớp nó. Bản desktop cũ chưa gửi mã — khi đó rơi về `describe()`.
 */
const REMEDY_BY_CODE: Record<string, string> = {
  ENGINE_UNAVAILABLE:
    "Nhân trình duyệt trên máy này chưa sẵn sàng. Mở MKT Browser và đợi nó tải xong nhân, rồi thử lại.",
  PROXY_REJECTED: "Máy không dựng được đường proxy nội bộ. Kiểm tra proxy của nick còn sống không.",
  PROFILE_NOT_FOUND:
    "Máy này không có profile đó. Nick có thể đã được ghim sang máy khác — hỏi ADMIN trước khi tạo lại.",
  PROFILE_NOT_RUNNING: "Profile chưa mở. Bấm mở profile trước khi thao tác lên trang.",
  UNKNOWN_TOOL: "Bản MKT Browser trên máy này quá cũ so với web. Cập nhật MKT Browser rồi thử lại.",
  FORBIDDEN: "Thao tác bị chặn bởi luật an toàn của MKT Browser.",
};

/**
 * Câu mô tả lỗi cho người dùng.
 *
 * Có mã thì trả về việc cần làm đã soạn sẵn. Không có mã thì `AntidetectError` đã được viết cho
 * người đọc nên dùng nguyên văn; lỗi lạ thì chỉ lấy `message` — **không** kèm stack, vì cấu hình
 * proxy vừa đi qua đúng những hàm này và một stack trace là chỗ mật khẩu proxy rất dễ lọt ra.
 */
function describe(error: unknown): string {
  if (error instanceof AntidetectError) {
    const remedy = error.code ? REMEDY_BY_CODE[error.code] : undefined;
    return remedy ?? error.message;
  }
  return error instanceof Error ? error.message : String(error);
}
