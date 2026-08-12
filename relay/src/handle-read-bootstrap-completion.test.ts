import type { IncomingMessage } from "node:http";
import { describe, expect, it } from "vitest";
import { handleReadBootstrapCompletion } from "./handle-read-bootstrap-completion";
import { InMemorySecureStore } from "./in-memory-secure-store";
import { writeOperatorGrantState } from "./operator-grant-state";

const request = (origin: string) => ({ headers: { origin } }) as IncomingMessage;

describe("handleReadBootstrapCompletion", () => {
  it("returns only a cached bootstrap proof to the exact web origin", () => {
    const store = new InMemorySecureStore();
    writeOperatorGrantState(store, {
      v: 1, kind: "bootstrap", operatorKey: "c4".repeat(32), generation: 1,
      grantId: "bootstrap-1", grantHash: "aa".repeat(32), completionProof: "proof",
    });
    expect(handleReadBootstrapCompletion(request("https://app.example"), "https://app.example", store)).toMatchObject({ ok: true, proof: "proof" });
    expect(handleReadBootstrapCompletion(request("https://evil.example"), "https://app.example", store).ok).toBe(false);
  });

  it("does not expose ordinary delivery proofs through the bootstrap route", () => {
    const store = new InMemorySecureStore();
    writeOperatorGrantState(store, {
      v: 1, kind: "delivery", operatorKey: "c4".repeat(32), generation: 1,
      grantId: "grant-1", grantHash: "aa".repeat(32), completionProof: "proof",
    });
    expect(handleReadBootstrapCompletion(request("https://app.example"), "https://app.example", store).ok).toBe(false);
  });
});
