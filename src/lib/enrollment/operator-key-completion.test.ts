import { describe, expect, it, vi } from "vitest";
import { hashGrantCompletionProof } from "@/lib/relay/enrollment/grant-digests";
import { decideOperatorKeyCompletion } from "./operator-key-completion";

const record = {
  operatorKeyGrantId: "grant-1", operatorKeyGrantGeneration: 2,
  operatorKeyCompletionHash: hashGrantCompletionProof("proof"),
  operatorKeyCompletedGrantId: null, operatorKeyCompletedGeneration: null,
};

describe("decideOperatorKeyCompletion", () => {
  it("accepts the recipient proof and runs the pre-commit seam", () => {
    const beforeCommit = vi.fn();
    expect(decideOperatorKeyCompletion(record, { grantId: "grant-1", generation: 2, proof: "proof" }, beforeCommit)).toEqual({ ok: true, already: false });
    expect(beforeCommit).toHaveBeenCalledOnce();
  });

  it("leaves the decision uncommitted when the pre-commit fault fires", () => {
    expect(() => decideOperatorKeyCompletion(record, { grantId: "grant-1", generation: 2, proof: "proof" }, () => { throw new Error("pre-server-commit"); })).toThrow("pre-server-commit");
  });

  it("rejects forged proof and accepts exact completed retry", () => {
    expect(decideOperatorKeyCompletion(record, { grantId: "grant-1", generation: 2, proof: "forged" }).ok).toBe(false);
    expect(decideOperatorKeyCompletion({ ...record, operatorKeyCompletedGrantId: "grant-1", operatorKeyCompletedGeneration: 2 }, { grantId: "grant-1", generation: 2, proof: "proof" })).toEqual({ ok: true, already: true });
  });
});
