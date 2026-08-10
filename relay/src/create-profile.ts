/**
 * Tạo một profile antidetect mới từ vé đã xác minh.
 *
 * ## Vì sao việc này phải nằm ở cầu nối
 *
 * A profile exists on **one machine only** — MKT Browser does not sync profiles between machines,
 * and its `id` is the primary key of a SQLite file beside the app. A remote server can neither
 * create nor inspect it, so creation must happen on the machine that will use the profile.
 *
 * Phụ phẩm đáng giá: **tạo profile ở đâu thì nick thuộc về máy đó**. Không phải khai thêm, không
 * khai sai được.
 *
 * ## Proxy và vân tay đi CÙNG lời gọi tạo
 *
 * The correct MKT Browser workflow is `attach proxy → align fingerprint with proxy → perform the
 * first login`, and the middle step is easy to miss (observed 02/08/2026: an `sv-SE` profile on a
 * UK IP). A single call enforces that order and leaves no opportunity to launch the profile
 * between the two configuration steps.
 *
 * MKT Browser validates consistency and rejects contradictory combinations (`INVALID_INPUT`). Its
 * error lists the valid values, so pass that message through instead of rewriting it.
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
    // A failed create is often the first sign that MKT Browser just stopped. Discard the cached
    // probe so the next check reports the current state, just like the launch path does.
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
