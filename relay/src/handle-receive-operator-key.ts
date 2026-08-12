import type { KeyObject } from "node:crypto";
import type { IncomingMessage } from "node:http";
import {
  assertGrantAuthorizationActive,
  GrantAuthorizationError,
  verifyGrantAuthorization,
} from "../../src/lib/relay/enrollment/grant-authorization";
import { hashOperatorKeyGrant } from "../../src/lib/relay/enrollment/grant-digests";
import type { OperatorKeyDeliveryRequest } from "../../src/lib/relay/relay-endpoints";
import { SealedBoxError, openSealedPayload } from "../../src/lib/tickets/ticket-sealed-box";
import { verifyCompletionProofHash } from "./grant-completion-proof";
import {
  readOperatorGrantState,
  retireLegacyOperatorKey,
  writeOperatorGrantState,
} from "./operator-grant-state";
import type { SecureStore } from "./secure-store";
import type { RelayResponseBody } from "./relay-http-server";

type DeliveryResponse = RelayResponseBody & { grantId?: string; generation?: number; proof?: string };
type Parsed<T> = { ok: true; value: T } | { ok: false; response: DeliveryResponse };

export interface ReceiveOperatorKeyDeps {
  allowedOrigin: string | null;
  deviceId: string | null;
  devicePublicKey: string;
  devicePrivateKey: KeyObject;
  serverPublicKey: KeyObject | null;
  secureStore: SecureStore;
  now?: () => number;
  afterStore?: () => void;
  afterProof?: () => void;
  onConfigured: () => { ok: boolean; message: string };
}

export function handleReceiveOperatorKey(
  request: IncomingMessage,
  body: string,
  deps: ReceiveOperatorKeyDeps,
): DeliveryResponse {
  if (!deps.allowedOrigin || request.headers.origin !== deps.allowedOrigin) {
    return failure("Only the configured MKTTool web origin may deliver an operator key.");
  }
  const parsed = parseRequest(body);
  if (!parsed.ok) return parsed.response;
  if (!deps.deviceId || !deps.serverPublicKey) return failure("This Relay is not enrolled yet.");

  let authorization;
  try {
    authorization = verifyGrantAuthorization(
      parsed.value.authorization,
      deps.serverPublicKey,
      deps.now?.() ?? Date.now(),
      false,
    );
  } catch (error) {
    return failure(error instanceof GrantAuthorizationError ? error.message : "Authorization verification failed.");
  }
  if (authorization.kind !== "delivery") return failure("This authorization cannot deliver a grant.");
  if (authorization.deviceId !== deps.deviceId || authorization.recipientPublicKey !== deps.devicePublicKey) {
    return failure("Grant authorization belongs to a different recipient.");
  }
  const grantHash = hashOperatorKeyGrant(parsed.value.grant);
  if (grantHash !== authorization.grantHash) return failure("The sealed grant was changed after authorization.");

  const existing = readOperatorGrantState(deps.secureStore);
  if (
    existing?.kind === "delivery" &&
    existing.grantId === authorization.grantId &&
    existing.grantHash === grantHash &&
    existing.generation === authorization.generation
  ) {
    retireLegacyOperatorKey(deps.secureStore);
    return success(existing.grantId, existing.generation, existing.completionProof);
  }
  try {
    assertGrantAuthorizationActive(authorization, deps.now?.() ?? Date.now());
  } catch (error) {
    return failure(error instanceof GrantAuthorizationError ? error.message : "Authorization time check failed.");
  }
  if (existing && authorization.generation <= existing.generation) {
    return failure("This grant generation has already been superseded or consumed.");
  }

  const key = openOperatorKey(parsed.value.grant, deps.devicePrivateKey);
  if (!key.ok) return key.response;
  const proof = openCompletionProof(authorization, deps.devicePrivateKey);
  if (!proof.ok) return proof.response;
  deps.afterProof?.();

  writeOperatorGrantState(deps.secureStore, {
    v: 1,
    kind: "delivery",
    operatorKey: key.value,
    generation: authorization.generation,
    grantId: authorization.grantId,
    grantHash,
    completionProof: proof.value,
  });
  deps.afterStore?.();
  deps.onConfigured();
  return success(authorization.grantId, authorization.generation, proof.value);
}

function parseRequest(body: string): Parsed<OperatorKeyDeliveryRequest> {
  try {
    const raw = JSON.parse(body) as Partial<OperatorKeyDeliveryRequest>;
    if (!raw.grant || typeof raw.authorization !== "string") throw new Error();
    if (typeof raw.grant.ephemeralPublicKey !== "string" || typeof raw.grant.sealed !== "string") throw new Error();
    return { ok: true, value: raw as OperatorKeyDeliveryRequest };
  } catch {
    return { ok: false, response: failure("Operator key delivery request is not valid JSON.") };
  }
}

function openOperatorKey(grant: OperatorKeyDeliveryRequest["grant"], privateKey: KeyObject) {
  try {
    const opened = openSealedPayload(grant, privateKey) as { vaultKeyOperator?: unknown };
    const key = typeof opened.vaultKeyOperator === "string" ? opened.vaultKeyOperator.toLowerCase() : "";
    return isHex(key, 64)
      ? { ok: true as const, value: key }
      : { ok: false as const, response: failure("The sealed operator key is invalid.") };
  } catch (error) {
    return {
      ok: false as const,
      response: failure(error instanceof SealedBoxError ? "The sealed grant belongs to a different device." : "Cannot open the sealed grant."),
    };
  }
}

function openCompletionProof(authorization: ReturnType<typeof verifyGrantAuthorization>, privateKey: KeyObject) {
  try {
    const opened = openSealedPayload(
      { ephemeralPublicKey: authorization.completionEphemeralPublicKey, sealed: authorization.completionSealed },
      privateKey,
    ) as { proof?: unknown };
    const proof = typeof opened.proof === "string" ? opened.proof : "";
    return verifyCompletionProofHash(proof, authorization.completionHash)
      ? { ok: true as const, value: proof }
      : { ok: false as const, response: failure("Completion proof does not match the authorization.") };
  } catch {
    return { ok: false as const, response: failure("Completion proof cannot be opened by this device.") };
  }
}

function success(grantId: string, generation: number, proof: string): DeliveryResponse {
  return { ok: true, message: "Operator key stored.", grantId, generation, proof };
}

function failure(message: string): DeliveryResponse {
  return { ok: false, message };
}

function isHex(value: string, length: number): boolean {
  return value.length === length && /^[0-9a-f]+$/.test(value);
}
