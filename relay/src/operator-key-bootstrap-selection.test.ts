import { describe, expect, it, vi } from "vitest";
import { selectOperatorKeyBootstrapBroker } from "./operator-key-bootstrap-selection";

describe("selectOperatorKeyBootstrapBroker", () => {
  it("requires bootstrap authorization before the first operator key is stored", () => {
    const broker = { isAuthorized: vi.fn(() => false) };

    expect(selectOperatorKeyBootstrapBroker(false, broker)).toBe(broker);
  });

  it("allows an ordinary local rotation when no bootstrap authorization is active", () => {
    const broker = { isAuthorized: vi.fn(() => false) };

    expect(selectOperatorKeyBootstrapBroker(true, broker)).toBeUndefined();
  });

  it("preserves an active bootstrap ceremony even when a local key already exists", () => {
    const broker = { isAuthorized: vi.fn(() => true) };

    expect(selectOperatorKeyBootstrapBroker(true, broker)).toBe(broker);
  });
});
