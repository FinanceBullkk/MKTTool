/**
 * Open an antidetect profile from an already verified ticket.
 *
 * A proxy failure must stop launch: opening on the operator's home IP can burn the account. MKT
 * Browser contract v2 owns persistence, verification, and launch as one atomic operation. Older
 * providers keep the strict `applyProxy` then `launchProfile` fallback, where a failed first step
 * always prevents the second.
 *
 * The response names the assigned proxy label so the operator can confirm the intended identity
 * without opening technical MKT Browser settings.
 */
import {
  AntidetectError,
  type AntidetectAdapter,
} from "../../src/lib/antidetect/antidetect-browser-adapter";
import { TICKET_KINDS, type TicketPayload } from "../../src/lib/tickets/ticket-types";
import {
  AntidetectRuntimeNotReadyError,
  type RelayAntidetect,
} from "./relay-antidetect";
import type { RelayResponseBody } from "./relay-http-server";
import type { RelayOperationDiagnostic } from "../../src/lib/relay/relay-endpoints";
import { relayOperationDiagnostic } from "./operation-diagnostics";

/** Narrow the ticket union once so callers never cast launch payloads. */
type LaunchPayload = Extract<TicketPayload, { kind: typeof TICKET_KINDS.LAUNCH_PROFILE }>;

export async function launchProfileFromTicket(
  payload: LaunchPayload,
  antidetect: RelayAntidetect,
  operationId: string,
): Promise<RelayResponseBody> {
  const startedAt = Date.now();
  let adapter: AntidetectAdapter;
  try {
    adapter = await antidetect.requireOperationalAdapter();
  } catch (error) {
    const code = error instanceof AntidetectRuntimeNotReadyError ? error.code : undefined;
    return {
      ok: false,
      message: error instanceof Error ? error.message : String(error),
      ...(code ? { code } : {}),
      diagnostic: relayOperationDiagnostic({
        operationId,
        startedAt,
        stage: "browser-health",
        code,
      }),
    };
  }
  if (adapter.launchProfileWithProxy) {
    let launched;
    try {
      launched = await adapter.launchProfileWithProxy(
        payload.antidetectProfileId,
        payload.proxy,
        { operationId },
      );
    } catch (error) {
      antidetect.forgetProbe();
      const code = error instanceof AntidetectError ? error.code : undefined;
      return {
        ok: false,
        message:
          `Could not safely open the profile with proxy "${payload.proxyLabel}". ` +
          `${describe(error)}`,
        ...(code ? { code } : {}),
        diagnostic: relayOperationDiagnostic({
          operationId,
          startedAt,
          stage: "launch-profile",
          code,
          browser: error instanceof AntidetectError ? error.diagnostic : undefined,
        }),
      };
    }

    return launchSuccess(
      payload.proxyLabel,
      relayOperationDiagnostic({
        operationId,
        startedAt,
        stage: "complete",
        browser: launched.diagnostic,
      }),
    );
  }

  try {
    await adapter.applyProxy(payload.antidetectProfileId, payload.proxy);
  } catch (error) {
    // STOP when applying the proxy fails. Forget the cached MKT Browser probe because a failed
    // proxy update is often the first sign that MKT Browser just stopped.
    antidetect.forgetProbe();
    return {
      ok: false,
      message:
        `Could not apply proxy "${payload.proxyLabel}", so the profile was NOT opened. ` +
        `${describe(error)}`,
      ...(error instanceof AntidetectError && error.code ? { code: error.code } : {}),
    };
  }

  try {
    await adapter.launchProfile(payload.antidetectProfileId);
  } catch (error) {
    antidetect.forgetProbe();
    return {
      ok: false,
      message: `Proxy "${payload.proxyLabel}" was applied, but the profile could not open. ${describe(error)}`,
      ...(error instanceof AntidetectError && error.code ? { code: error.code } : {}),
    };
  }

  return launchSuccess(
    payload.proxyLabel,
    relayOperationDiagnostic({ operationId, startedAt, stage: "complete" }),
  );
}

function launchSuccess(proxyLabel: string, diagnostic: RelayOperationDiagnostic): RelayResponseBody {
  return {
    ok: true,
    message: `Opened the profile with proxy "${proxyLabel}". The browser window is on this PC.`,
    diagnostic,
  };
}

/**
 * Operator remedy selected by the stable MKT Browser error code.
 *
 * The code is contractual; desktop wording may change. Legacy builds without a code fall back to
 * the already-redacted adapter message.
 */
const REMEDY_BY_CODE: Record<string, string> = {
  // Một mã, nhiều nguyên nhân. Câu cũ đoán luôn nguyên nhân — và đoán sai thì nó cử người đi chờ
  // một thứ không chạy. ENGINE_UNAVAILABLE cũng nổ khi KHÔNG có licence key nào: chờ engine "xong"
  // là chờ mãi, vì chẳng có gì đang tải. PROXY_REJECTED cũng nổ khi chốt chặn WebRTC không xác minh
  // được, lúc đó proxy vẫn sống nguyên. Gặp thật ngày 14/09/2026, cả hai trong cùng một lượt chạy.
  // Nên: nói đúng thứ đã xảy ra và chỉ đúng chỗ để xem, KHÔNG khẳng định nguyên nhân.
  ENGINE_UNAVAILABLE:
    "MKT Browser could not give this launch a browser engine. Open MKT Browser on this PC and " +
    "check the engine and licence state in Settings.",
  PROXY_REJECTED:
    "MKT Browser refused the proxied launch. Open MKT Browser on this PC to see which proxy or " +
    "protection check refused it.",
  // Câu cũ là "Ask an ADMIN before creating or moving it." — sai đường ra. `requestCreateProfileTicket`
  // là `guardedAction`, nên chính người vừa bị từ chối bấm được nút "Tạo profile trên máy này" ngay
  // trên trang nick họ đang đứng. Gặp thật ngày 19/08/2026, ở đúng bước đầu tiên của lượt onboard
  // một chiếc máy mới, và nó cử người đi hỏi một người không cần hỏi.
  //
  // Nói ra hệ quả thay vì giấu: tạo profile ở đây **ghim nick vào máy này** — profile chỉ tồn tại
  // cục bộ, nên máy này thành máy duy nhất mở được nick đó. Đó là thứ đáng cân nhắc một nhịp, và là
  // lý do đúng đắn duy nhất để hỏi ai đó trước.
  PROFILE_NOT_FOUND:
    'This PC does not have that profile. Open the account page and press "Create profile on this PC" ' +
    "— you can do it yourself. It pins the account to this PC, because the profile only exists here.",
  PROFILE_NOT_RUNNING: "The profile is not open. Launch it before controlling the page.",
  PROFILE_ALREADY_RUNNING:
    "This profile is already running with a different proxy. Close it, then try again.",
  UNKNOWN_TOOL: "MKT Browser on this PC is too old for this Web build. Update it, then retry.",
  FORBIDDEN: "MKT Browser blocked this operation under its safety policy.",
};

/**
 * Return reviewed copy for known codes. Unknown or legacy failures use only the redacted message,
 * never a stack trace that could expose proxy configuration.
 */
function describe(error: unknown): string {
  if (error instanceof AntidetectError) {
    const remedy = error.code ? REMEDY_BY_CODE[error.code] : undefined;
    return remedy ?? error.message;
  }
  return error instanceof Error ? error.message : String(error);
}
