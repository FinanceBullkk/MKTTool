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
import { AntidetectError } from "../../src/lib/antidetect/antidetect-browser-adapter";
import { TICKET_KINDS, type TicketPayload } from "../../src/lib/tickets/ticket-types";
import type { RelayAntidetect } from "./relay-antidetect";
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
  try {
    await antidetect.requireOperationalRuntime();
  } catch (error) {
    return {
      ok: false,
      message: error instanceof Error ? error.message : String(error),
      diagnostic: relayOperationDiagnostic({ operationId, startedAt, stage: "browser-health" }),
    };
  }
  const adapter = antidetect.getAdapter();

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
      return {
        ok: false,
        message:
          `Could not safely open the profile with proxy "${payload.proxyLabel}". ` +
          `${describe(error)}`,
        diagnostic: relayOperationDiagnostic({
          operationId,
          startedAt,
          stage: "launch-profile",
          code: error instanceof AntidetectError ? error.code : undefined,
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
    };
  }

  try {
    await adapter.launchProfile(payload.antidetectProfileId);
  } catch (error) {
    antidetect.forgetProbe();
    return {
      ok: false,
      message: `Proxy "${payload.proxyLabel}" was applied, but the profile could not open. ${describe(error)}`,
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
  ENGINE_UNAVAILABLE:
    "The browser engine is not ready. Open MKT Browser, wait for the engine to finish, then retry.",
  PROXY_REJECTED: "The local proxy path could not start. Check whether the account proxy is alive.",
  PROFILE_NOT_FOUND:
    "This PC does not have that profile. Ask an ADMIN before creating or moving it.",
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
