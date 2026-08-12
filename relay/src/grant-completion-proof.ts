import { hashGrantCompletionProof } from "../../src/lib/relay/enrollment/grant-digests";

export interface GrantCompletionProof {
  grantId: string;
  generation: number;
  proof: string;
}

export function verifyCompletionProofHash(proof: string, expectedHash: string): boolean {
  return hashGrantCompletionProof(proof) === expectedHash;
}
