import { describe, expect, it } from "vitest";
import { takeVaultSecrets } from "./vault-form-secrets";

describe("vault form secret extraction", () => {
  it("preserves leading/trailing password characters and strips all plaintext form entries", () => {
    const form = new FormData();
    form.set("username", "example");
    form.append("password", "  synthetic password \t");
    form.append("password", "duplicate must also be removed");
    form.set("emailPassword", " ");
    form.set("totpSecret", " ABC DEF ");
    expect(takeVaultSecrets(form)).toEqual({
      password: "  synthetic password \t", emailPassword: " ", totpSecret: " ABC DEF ",
    });
    expect([...form.entries()]).toEqual([["username", "example"]]);
  });

  it("leaves an existing secret unchanged when the field is empty", () => {
    const form = new FormData();
    form.set("password", "");
    expect(takeVaultSecrets(form)).toEqual({});
    expect(form.has("password")).toBe(false);
  });
});
