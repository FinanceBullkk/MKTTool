import { describe, expect, it } from "vitest";
import { isRelayInitializationComplete } from "./relay-executable-harness";

const PUBLIC_KEY = "a".repeat(64);

describe("Relay executable harness health gate", () => {
  it("rejects the bootstrap listener even though it answers HTTP", () => {
    expect(isRelayInitializationComplete({
      ok: false,
      code: "RELAY_STARTUP_PENDING",
      startupState: "pending",
      relayVersion: 20,
    })).toBe(false);
  });

  it("accepts an initialized but not-yet-configured Relay", () => {
    expect(isRelayInitializationComplete({
      ok: false,
      message: "Relay still needs configuration.",
      publicKey: PUBLIC_KEY,
      relayVersion: 20,
    })).toBe(true);
  });

  it("rejects a failed or malformed health reply", () => {
    expect(isRelayInitializationComplete({
      ok: false,
      code: "RELAY_STARTUP_FAILED",
      startupState: "failed",
      relayVersion: 20,
    })).toBe(false);
    expect(isRelayInitializationComplete({ publicKey: PUBLIC_KEY, relayVersion: "20" })).toBe(false);
  });
});
