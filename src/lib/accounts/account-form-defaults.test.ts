import { describe, expect, it } from "vitest";
import { selectAccountFormDefaults } from "./account-form-defaults";

describe("selectAccountFormDefaults", () => {
  it("keeps only fields that may be serialized into the edit form", () => {
    const safe = {
      username: "fixture-nick",
      emailAddress: "fixture@example.invalid",
      antidetectProfileId: null,
      voice: null,
      contentAngle: null,
      proxyId: "proxy-1",
      status: "COLD_START",
      karma: 0,
      quarantineReason: null,
      coldStartUntil: null,
      platformCreatedAt: null,
      purchasedAt: null,
      purchaseNote: null,
    };
    const defaults = selectAccountFormDefaults({
      ...safe,
      passwordEnc: "account-secret-ciphertext",
      emailPasswordEnc: "email-secret-ciphertext",
      totpSecretEnc: "totp-secret-ciphertext",
      proxy: {
        username: "proxy-credential-username",
        passwordEnc: "proxy-secret-ciphertext",
      },
    });

    expect(defaults).toEqual(safe);
    expect(JSON.stringify(defaults)).not.toContain("secret");
    expect(JSON.stringify(defaults)).not.toContain("proxy-credential-username");
  });
});
