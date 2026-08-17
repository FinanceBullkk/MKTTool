import type { IncomingMessage } from "node:http";
import type { BootstrapAuthorizationBroker } from "./bootstrap-authorization";
import type { RelayResponseBody } from "./relay-http-server";

export function handleAuthorizeBootstrap(
  request: IncomingMessage,
  body: string,
  allowedOrigin: string | null,
  broker: BootstrapAuthorizationBroker,
): RelayResponseBody {
  if (!allowedOrigin || request.headers.origin !== allowedOrigin) {
    return { ok: false, message: "Only the configured MKTTool web origin may authorize bootstrap." };
  }
  try {
    const parsed = JSON.parse(body) as { authorization?: unknown };
    if (typeof parsed.authorization !== "string") throw new Error("Bootstrap authorization is missing.");
    broker.authorize(parsed.authorization);
    return { ok: true, message: "Bootstrap authorized for five minutes." };
  } catch (error) {
    return { ok: false, message: (error as Error).message };
  }
}
