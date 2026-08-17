import type { IncomingMessage } from "node:http";
import type { RelayResponseBody } from "./relay-http-server";
import { readOperatorGrantState } from "./operator-grant-state";
import type { SecureStore } from "./secure-store";

export function handleReadBootstrapCompletion(
  request: IncomingMessage,
  allowedOrigin: string | null,
  secureStore: SecureStore,
): RelayResponseBody {
  if (!allowedOrigin || request.headers.origin !== allowedOrigin) {
    return { ok: false, message: "Only the configured MKTTool web origin may read bootstrap completion." };
  }
  const state = readOperatorGrantState(secureStore);
  if (!state || state.kind !== "bootstrap") {
    return { ok: false, message: "No cached bootstrap completion exists." };
  }
  return {
    ok: true,
    message: "Cached bootstrap completion found.",
    grantId: state.grantId,
    generation: state.generation,
    proof: state.completionProof,
  };
}
