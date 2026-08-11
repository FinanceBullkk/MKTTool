import type { AntidetectOperationDiagnostic } from "../../src/lib/antidetect/antidetect-browser-adapter";
import type { RelayOperationDiagnostic } from "../../src/lib/relay/relay-endpoints";

export function relayOperationDiagnostic(input: {
  operationId: string;
  requestId?: string;
  startedAt: number;
  stage: string;
  code?: string;
  browser?: AntidetectOperationDiagnostic;
}): RelayOperationDiagnostic {
  const browser =
    input.browser?.operationId === input.operationId &&
    (input.requestId === undefined || input.browser.requestId === input.requestId)
      ? input.browser
      : undefined;

  return {
    operationId: input.operationId,
    ...(input.requestId ? { requestId: input.requestId } : {}),
    stage: browser?.stage ?? input.stage,
    ...(browser?.code || input.code ? { code: browser?.code ?? input.code } : {}),
    durationMs: Date.now() - input.startedAt,
    runtime: browser?.runtime ?? null,
  };
}
