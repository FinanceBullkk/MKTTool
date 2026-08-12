import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

const INSTALLER = readFileSync(
  path.join(process.cwd(), "relay", "install-relay.ps1"),
  "utf8",
);

describe("Relay installer protected-secret contract", () => {
  it("never recreates plaintext secret fields or legacy device-key files", () => {
    expect(INSTALLER).not.toMatch(/vaultKeyOperator\s*=/);
    expect(INSTALLER).not.toContain("relay-device-key.json");
    expect(INSTALLER).toContain("DPAPI CurrentUser");
  });
});
