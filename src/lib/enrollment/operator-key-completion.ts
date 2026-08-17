import { hashGrantCompletionProof } from "@/lib/relay/enrollment/grant-digests";

export interface CompletionRecord {
  operatorKeyGrantId: string | null;
  operatorKeyGrantGeneration: number;
  operatorKeyCompletionHash: string | null;
  operatorKeyCompletedGrantId: string | null;
  operatorKeyCompletedGeneration: number | null;
}

export interface CompletionInput {
  grantId: string;
  generation: number;
  proof: string;
}

export type CompletionDecision =
  | { ok: true; already: boolean }
  | { ok: false; message: string };

export function decideOperatorKeyCompletion(
  record: CompletionRecord,
  input: CompletionInput,
  beforeCommit?: () => void,
): CompletionDecision {
  if (
    record.operatorKeyCompletedGrantId === input.grantId &&
    record.operatorKeyCompletedGeneration === input.generation
  ) return { ok: true, already: true };
  if (
    record.operatorKeyGrantId !== input.grantId ||
    record.operatorKeyGrantGeneration !== input.generation ||
    !record.operatorKeyCompletionHash ||
    hashGrantCompletionProof(input.proof) !== record.operatorKeyCompletionHash
  ) return { ok: false, message: "Relay completion proof is invalid." };
  beforeCommit?.();
  return { ok: true, already: false };
}
