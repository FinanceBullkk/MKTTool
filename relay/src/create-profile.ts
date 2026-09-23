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
import {
  AntidetectRuntimeNotReadyError,
  type RelayAntidetect,
} from "./relay-antidetect";
import type { RelayResponseBody } from "./relay-http-server";
import { relayOperationDiagnostic } from "./operation-diagnostics";

/** Ruột vé tạo profile — thu hẹp từ union để chỗ gọi không phải ép kiểu. */
type CreatePayload = Extract<TicketPayload, { kind: typeof TICKET_KINDS.CREATE_PROFILE }>;

export async function createProfileFromTicket(
  payload: CreatePayload,
  antidetect: RelayAntidetect,
  operationId: string,
): Promise<RelayResponseBody> {
  const startedAt = Date.now();
  try {
    await antidetect.requireOperationalRuntime();
  } catch (error) {
    const code = error instanceof AntidetectRuntimeNotReadyError ? error.code : undefined;
    return {
      ok: false,
      message: error instanceof Error ? error.message : String(error),
      diagnostic: relayOperationDiagnostic({
        operationId,
        requestId: payload.requestId,
        startedAt,
        stage: "browser-health",
        code,
      }),
    };
  }
  const adapter = antidetect.getAdapter();

  let created;
  try {
    created = await adapter.createProfile({
      name: payload.profileName,
      notes: `Created by MKTTool for account ${payload.accountId}.`,
      tags: ["mkttool"],
      proxy: payload.proxy,
      fingerprint: payload.fingerprint,
      seed: payload.seed,
      externalRef: payload.accountId,
      requestId: payload.requestId,
      operationId,
    });
  } catch (error) {
    // A failed create is often the first sign that MKT Browser just stopped. Discard the cached
    // probe so the next check reports the current state, just like the launch path does.
    antidetect.forgetProbe();
    return {
      ok: false,
      message: `Could not create the profile. ${describe(error)}`,
      diagnostic: relayOperationDiagnostic({
        operationId,
        requestId: payload.requestId,
        startedAt,
        stage: "create-profile",
        code: error instanceof AntidetectError ? error.code : undefined,
        browser: error instanceof AntidetectError ? error.diagnostic : undefined,
      }),
    };
  }

  return {
    ok: true,
    profileId: created.profileId,
    diagnostic: relayOperationDiagnostic({
      operationId,
      requestId: payload.requestId,
      startedAt,
      stage: "complete",
      browser: created.diagnostic,
    }),
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
