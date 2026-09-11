export const SECRET_FIELDS = [
  ["password", "passwordEnc"],
  ["emailPassword", "emailPasswordEnc"],
  ["totpSecret", "totpSecretEnc"],
] as const;

/** Remove plaintext before any server submission, preserving the operator's exact input. */
export function takeVaultSecrets(formData: FormData): Record<string, string> {
  const secrets: Record<string, string> = {};
  for (const [field] of SECRET_FIELDS) {
    const value = String(formData.get(field) ?? "");
    formData.delete(field);
    if (value) secrets[field] = value;
  }
  return secrets;
}
