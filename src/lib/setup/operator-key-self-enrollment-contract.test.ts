import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

function source(...segments: string[]): string {
  return readFileSync(path.join(process.cwd(), ...segments), "utf8");
}

describe("operator-key self-enrollment contract", () => {
  it("keeps plaintext key entry inside Relay while the browser forwards only proof metadata", () => {
    const hook = source(
      "src",
      "components",
      "setup",
      "use-operator-key-self-enrollment.ts",
    );
    const relayHandler = source("relay", "src", "handle-set-operator-key.ts");

    expect(hook).toContain('form.set("keyFingerprint"');
    expect(hook).not.toContain("vaultKeyOperator");
    expect(relayHandler).toContain("fingerprintOperatorKey(state.operatorKey)");
  });

  it("authorizes only the signed-in owner and verifies the configured fingerprint", () => {
    const actions = source("src", "lib", "enrollment", "bootstrap-actions.ts");

    expect(actions).toContain("guardedAction(async function mintBootstrapAuthorization");
    expect(actions).toContain("device.userId !== actor.userId");
    expect(actions).toContain("operatorKeyFingerprintMatches");
    expect(actions).not.toContain("readyCount");
  });

  it("does not retain the old admin-only setup button", () => {
    const card = source("src", "components", "relay", "relay-enroll-card.tsx");
    expect(card).toContain("useOperatorKeySelfEnrollment");
    expect(card).not.toContain("AdminBootstrapButton");
  });
});
