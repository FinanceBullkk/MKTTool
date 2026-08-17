import type { KeyObject } from "node:crypto";
import {
  assertGrantAuthorizationActive,
  isGrantAuthorizationActive,
  verifyGrantAuthorization,
  type GrantAuthorizationEnvelope,
} from "../../src/lib/relay/enrollment/grant-authorization";
import { openSealedPayload } from "../../src/lib/tickets/ticket-sealed-box";

export interface BootstrapCompletion {
  grantId: string;
  generation: number;
  grantHash: string;
  proof: string;
}

export class BootstrapAuthorizationBroker {
  private current: GrantAuthorizationEnvelope | null = null;

  constructor(
    private readonly deviceId: () => string | null,
    private readonly devicePublicKey: string,
    private readonly devicePrivateKey: KeyObject,
    private readonly serverPublicKey: () => KeyObject | null,
    private readonly now: () => number = Date.now,
    private readonly consumedGeneration: () => number | null = () => null,
  ) {}

  authorize(signed: string): void {
    const serverKey = this.serverPublicKey();
    if (!serverKey || !this.deviceId()) throw new Error("This Relay is not enrolled yet.");
    const authorization = verifyGrantAuthorization(signed, serverKey, this.now());
    if (authorization.kind !== "bootstrap") throw new Error("This is not a bootstrap authorization.");
    if (authorization.deviceId !== this.deviceId() || authorization.recipientPublicKey !== this.devicePublicKey) {
      throw new Error("Bootstrap authorization belongs to a different device.");
    }
    if (authorization.generation <= (this.consumedGeneration() ?? 0)) {
      throw new Error("Bootstrap authorization has already been consumed.");
    }
    this.current = authorization;
  }

  isAuthorized(): boolean {
    return Boolean(this.current && isGrantAuthorizationActive(this.current, this.now()));
  }

  consume(): BootstrapCompletion {
    const authorization = this.current;
    this.current = null;
    if (!authorization) throw new Error("Bootstrap authorization is missing or expired.");
    assertGrantAuthorizationActive(authorization, this.now());
    const opened = openSealedPayload(
      { ephemeralPublicKey: authorization.completionEphemeralPublicKey, sealed: authorization.completionSealed },
      this.devicePrivateKey,
    ) as { proof?: unknown };
    if (typeof opened.proof !== "string") throw new Error("Bootstrap completion proof is invalid.");
    return {
      grantId: authorization.grantId,
      generation: authorization.generation,
      grantHash: authorization.grantHash,
      proof: opened.proof,
    };
  }
}
