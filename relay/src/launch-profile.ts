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
 * Người bấm nút không nhìn thấy gì ngoài một dòng chữ — profile mở ra ở cửa sổ khác. Nhắc đúng
 * nhãn proxy vừa đẩy là cách duy nhất họ đối chiếu được "đúng nick, đúng IP" mà không phải mở
 * cài đặt MultiZen ra dò.
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
    // Hỏng ở bước đẩy proxy thì DỪNG. Quên kết quả kiểm MultiZen đã nhớ, vì "đẩy proxy hỏng"
    // rất hay là triệu chứng đầu tiên của việc MultiZen vừa tắt.
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
 * Câu mô tả lỗi cho người dùng.
 *
 * `AntidetectError` đã được viết cho người đọc nên dùng nguyên văn. Lỗi lạ thì chỉ lấy
 * `message` — **không** kèm stack, vì cấu hình proxy vừa đi qua đúng những hàm này và một
 * stack trace là chỗ mật khẩu proxy rất dễ lọt ra.
 */
function describe(error: unknown): string {
  if (error instanceof AntidetectError) return error.message;
  return error instanceof Error ? error.message : String(error);
}
