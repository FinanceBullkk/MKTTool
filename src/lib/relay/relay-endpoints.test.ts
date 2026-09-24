import { describe, expect, it } from "vitest";
import { isRelayStartupState } from "./relay-endpoints";

describe("Relay startup state contract", () => {
  it("accepts only the fail-closed bootstrap states", () => {
    expect(isRelayStartupState("pending")).toBe(true);
    expect(isRelayStartupState("failed")).toBe(true);
    expect(isRelayStartupState("ready")).toBe(false);
    expect(isRelayStartupState(null)).toBe(false);
  });
});
