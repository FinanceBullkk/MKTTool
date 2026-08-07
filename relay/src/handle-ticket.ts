/**
 * Nhận một tấm vé từ trình duyệt, xác minh, rồi làm việc nó cho phép.
 *
 * ## Cầu nối không tự quyết ai được đọc gì
 *
 * Toàn bộ phần "người này có quyền không" đã xảy ra trên máy chủ trước khi vé được ký. Ở đây
 * chỉ còn đúng hai câu hỏi: *chữ ký có thật không* và *vé còn dùng được không*. Ít logic thì ít
 * lỗ — và quan trọng hơn, không có chỗ nào ở đây để một quyết định phân quyền lệch với quyết
 * định đã ghi ở máy chủ.
 *
 * ## Đường này chỉ nhận vé THAO TÁC VỚI PROFILE
 *
 * `POST /ticket` là đường **gọi ngầm** (fetch), tức thứ nó làm được phải là việc không có gì
 * hiện ra cho người dùng xem — mở profile, và từ bản 6 là tạo profile. Vé bí mật đi đường khác
 * hẳn — `/secret`, mở thành một tab do chính cầu nối phục vụ (QĐ 3), để mật khẩu không bao giờ
 * đi vào trang web hosted. Nhận nhầm loại vé ở đây là mở một đường trả mật khẩu qua fetch, đúng
 * thứ QĐ 3 dựng ra để chặn.
 *
 * Danh sách loại được nhận khai thành hằng số ngay dưới, không rải `if` — thêm một loại vé thao
 * tác là thêm một dòng, còn vé bí mật thì không có đường nào lọt vào đây bằng cách quên.
 */
import { TICKET_KINDS } from "../../src/lib/tickets/ticket-types";
import { TicketRejected, verifyTicket } from "../../src/lib/tickets/ticket-verifier";
import type { RelayIdentity } from "../../src/lib/tickets/ticket-verifier";
import { AntidetectNotConfiguredError, type RelayAntidetect } from "./relay-antidetect";
import type { RelayResponseBody } from "./relay-http-server";
import { TicketPayloadError, reviewTicketPayload } from "./ticket-payload-schema";
import { launchProfileFromTicket } from "./launch-profile";
import { createProfileFromTicket } from "./create-profile";

/** Loại vé đường này nhận. Mọi loại khác bị từ chối **trước khi** ruột được mở ra. */
const LOAI_VE_NHAN_O_DAY: readonly string[] = [
  TICKET_KINDS.LAUNCH_PROFILE,
  TICKET_KINDS.CREATE_PROFILE,
];

/** Thân `POST /ticket` mà `relay-browser-client.ts` gửi lên. */
function readTicketField(body: string): string {
  let parsed: unknown;
  try {
    parsed = JSON.parse(body);
  } catch {
    throw new TicketPayloadError("Thân request không phải JSON.");
  }

  const ticket = (parsed as { ticket?: unknown })?.ticket;
  if (typeof ticket !== "string" || ticket === "") {
    throw new TicketPayloadError('Thân request thiếu trường "ticket".');
  }

  return ticket;
}

export interface TicketHandlerDeps {
  identity: RelayIdentity | null;
  antidetect: RelayAntidetect;
  /** Câu nói thiếu gì, dùng khi cấu hình chưa đủ nên chưa dựng nổi danh tính. */
  notConfiguredMessage: string;
}

/**
 * Xử lý `POST /ticket`.
 *
 * Không bao giờ ném: mọi đường hỏng đều thành một `ok:false` kèm câu người dùng đọc được. Chỗ
 * gọi là một nút bấm trên web, và một lỗi ném trần ở đây chỉ làm nút chết lặng — đúng kiểu hỏng
 * mà `guardedAction` bên máy chủ đã phải sửa một lần rồi.
 */
export async function handleTicketRequest(
  body: string,
  deps: TicketHandlerDeps,
): Promise<RelayResponseBody> {
  if (!deps.identity) {
    return { ok: false, message: deps.notConfiguredMessage };
  }

  let ticket: string;
  try {
    ticket = readTicketField(body);
  } catch (error) {
    return { ok: false, message: (error as Error).message };
  }

  let verified;
  try {
    verified = verifyTicket(ticket, deps.identity);
  } catch (error) {
    if (error instanceof TicketRejected) {
      // `TicketRejected` đã mang sẵn câu viết cho người đọc, kèm mã để phân biệt. Đừng viết lại.
      return { ok: false, message: error.message, rejectionCode: error.code };
    }
    throw error;
  }

  if (!LOAI_VE_NHAN_O_DAY.includes(verified.envelope.kind)) {
    return {
      ok: false,
      message:
        `Vé loại "${verified.envelope.kind}" không đi đường này. Bí mật của nick hiện ở tab ` +
        `riêng của cầu nối, không đi qua trang web.`,
    };
  }

  let payload;
  try {
    payload = reviewTicketPayload(verified.envelope.kind, verified.payload);
  } catch (error) {
    return { ok: false, message: (error as Error).message };
  }

  try {
    if (payload.kind === TICKET_KINDS.LAUNCH_PROFILE) {
      return await launchProfileFromTicket(payload, deps.antidetect);
    }
    if (payload.kind === TICKET_KINDS.CREATE_PROFILE) {
      return await createProfileFromTicket(payload, deps.antidetect);
    }
    // Không tới được: `reviewTicketPayload` soi theo đúng `kind` đã lọc ở trên. Có mặt để
    // TypeScript thu hẹp kiểu mà không phải ép kiểu — ép kiểu ở đây là bỏ đúng lớp bảo vệ vừa dựng.
    return { ok: false, message: "Ruột vé không khớp loại vé." };
  } catch (error) {
    if (error instanceof AntidetectNotConfiguredError) {
      return { ok: false, message: error.message };
    }
    throw error;
  }
}
