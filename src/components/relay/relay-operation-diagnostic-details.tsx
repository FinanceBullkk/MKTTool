import type { RelayOperationDiagnostic } from "@/lib/relay/relay-endpoints";

export function RelayOperationDiagnosticDetails({
  diagnostic,
}: {
  diagnostic?: RelayOperationDiagnostic;
}) {
  if (!diagnostic) return null;

  return (
    <details className="text-xs text-neutral-500">
      <summary className="cursor-pointer">Operation support details</summary>
      <div className="mt-2 space-y-1 font-mono">
        <p>Operation: {diagnostic.operationId}</p>
        {diagnostic.requestId ? <p>Request: {diagnostic.requestId}</p> : null}
        <p>Stage: {diagnostic.stage}</p>
        {diagnostic.code ? <p>Code: {diagnostic.code}</p> : null}
        <p>Duration: {diagnostic.durationMs} ms</p>
        {diagnostic.runtime ? (
          <>
            <p>
              Browser: {diagnostic.runtime.appVersion} / contract {diagnostic.runtime.contractVersion}
            </p>
            <p>
              Engine: {diagnostic.runtime.engine.kind} / {diagnostic.runtime.engine.version ?? "unknown"} / {diagnostic.runtime.engine.status}
            </p>
          </>
        ) : null}
      </div>
    </details>
  );
}
