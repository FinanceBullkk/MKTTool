import { createHash } from "node:crypto";
import type { SealedOperatorKeyGrant } from "../relay-endpoints";

export function hashOperatorKeyGrant(grant: SealedOperatorKeyGrant): string {
  return sha256(`${grant.ephemeralPublicKey}\n${grant.sealed}`);
}

export function hashGrantCompletionProof(proof: string): string {
  return sha256(proof);
}

function sha256(value: string): string {
  return createHash("sha256").update(value, "utf8").digest("hex");
}
