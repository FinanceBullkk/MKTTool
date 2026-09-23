const NODE_TLS_ENVIRONMENT_KEYS = [
  "NODE_OPTIONS",
  "NODE_EXTRA_CA_CERTS",
  "NODE_USE_SYSTEM_CA",
  "NODE_TLS_REJECT_UNAUTHORIZED",
] as const;

/** Shipped child processes must start from the platform trust policy, not a caller's Node overrides. */
export function relayChildEnvironment(
  overrides: Record<string, string | undefined> = {},
  inherited: Record<string, string | undefined> = process.env,
): NodeJS.ProcessEnv {
  const environment = { ...inherited, ...overrides } as NodeJS.ProcessEnv;
  const blockedKeys = new Set<string>(NODE_TLS_ENVIRONMENT_KEYS);
  for (const key of Object.keys(environment)) {
    // Windows environment names are case-insensitive, while the object can retain mixed casing.
    if (blockedKeys.has(key.toUpperCase())) delete environment[key];
  }
  return environment;
}

export { NODE_TLS_ENVIRONMENT_KEYS };
