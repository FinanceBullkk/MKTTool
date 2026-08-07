/**
 * Tạo một profile antidetect mới từ vé đã xác minh.
 *
 * ## Vì sao việc này phải nằm ở cầu nối
 *
 * Profile chỉ tồn tại trên **một chiếc máy** — MultiZen không đồng bộ giữa các máy, và `id` của
 * nó là khóa chính của một file SQLite cạnh app. Máy chủ ở xa không tạo được, cũng không nhìn
 * thấy. Nên chỗ duy nhất tạo được là chương trình chạy trên chính chiếc máy sẽ dùng profile đó.
 *
 * Phụ phẩm đáng giá: **tạo profile ở đâu thì nick thuộc về máy đó**. Không phải khai thêm, không
 * khai sai được.
 *
 * ## Proxy và vân tay đi CÙNG lời gọi tạo
 *
 * Quy trình đúng của MultiZen là `gắn proxy → căn vân tay theo proxy → rồi mới đăng nhập lần
 * đầu`, và bước giữa là bước hay bị quên (đo 02/08/2026: profile `sv-SE` chạy trên IP Anh).
 * Gộp vào một lời gọi thì thứ tự đó không còn là thứ phải nhớ, và cũng không còn khe hở để ai đó
 * mở profile vào giữa hai bước.
 *
 * MultiZen tự kiểm tính nhất quán và từ chối tổ hợp mâu thuẫn (`INVALID_INPUT`) — câu lỗi của nó
 * còn liệt kê giá trị hợp lệ, nên ta chuyển nguyên văn cho người đọc thay vì viết lại.
 */
import { AntidetectError } from "../../src/lib/antidetect/antidetect-browser-adapter";
import { TICKET_KINDS, type TicketPayload } from "../../src/lib/tickets/ticket-types";
import type { RelayAntidetect } from "./relay-antidetect";
import type { RelayResponseBody } from "./relay-http-server";

/** Ruột vé tạo profile — thu hẹp từ union để chỗ gọi không phải ép kiểu. */
type CreatePayload = Extract<TicketPayload, { kind: typeof TICKET_KINDS.CREATE_PROFILE }>;

export async function createProfileFromTicket(
  payload: CreatePayload,
  antidetect: RelayAntidetect,
): Promise<RelayResponseBody> {
  const adapter = antidetect.getAdapter();

  let profileId: string;
  try {
    profileId = await adapter.createProfile({
      name: payload.profileName,
      notes: `Tạo bởi MKTTool cho nick ${payload.accountId}.`,
      tags: ["mkttool"],
      proxy: payload.proxy,
      fingerprint: payload.fingerprint,
      seed: payload.seed,
    });
  } catch (error) {
    // "Tạo hỏng" rất hay là triệu chứng đầu tiên của việc MultiZen vừa tắt — quên kết quả dò đã
    // nhớ để lần hỏi sau nói đúng hiện trạng, giống hệt nhánh mở profile.
    antidetect.forgetProbe();
    return { ok: false, message: `Không tạo được profile. ${describe(error)}` };
  }

  return {
    ok: true,
    profileId,
    message:
      `Đã tạo profile "${payload.profileName}" với proxy và vân tay ` +
      `${payload.fingerprint.localeId} / ${payload.fingerprint.timezone}. ` +
      `Mở profile rồi đăng nhập nick lần đầu ngay trong đó.`,
  };
}

/** Xem chú thích cùng tên ở `launch-profile.ts` — không kèm stack, vì mật khẩu proxy vừa đi qua đây. */
function describe(error: unknown): string {
  if (error instanceof AntidetectError) return error.message;
  return error instanceof Error ? error.message : String(error);
}
