import { describe, expect, it } from "vitest";
import type { RelayConfig } from "./relay-config";
import { AntidetectNotConfiguredError, RelayAntidetect } from "./relay-antidetect";
import type { ResolvedMktBrowserToken } from "./mkt-browser-token-discovery";

const CONFIG: RelayConfig = {
  deviceId: "device-abc",
  serverPublicKey: "a".repeat(64),
  vaultKeyOperator: "b".repeat(64),
  webOrigin: "https://mkttool.example.com",
};

describe("RelayAntidetect token discovery", () => {
  it("sees a token that appears after Relay startup without a restart", () => {
    let token: ResolvedMktBrowserToken | null = null;
    const antidetect = new RelayAntidetect(CONFIG, () => token);

    expect(antidetect.tokenStatus()).toEqual({ available: false, source: null });
    expect(() => antidetect.getAdapter()).toThrow(AntidetectNotConfiguredError);

    token = { value: "c".repeat(64), source: "mkt-browser-data" };

    expect(antidetect.tokenStatus()).toEqual({
      available: true,
      source: "mkt-browser-data",
    });
    expect(antidetect.getAdapter().providerName).toBe("MKT Browser");
  });
});
