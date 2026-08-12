export const RELAY_SECRET_NAMES = {
  operatorDomainKey: "operator-domain-key",
  devicePrivateKey: "device-private-key",
  operatorGrantState: "operator-grant-state",
} as const;

export type RelaySecretName = (typeof RELAY_SECRET_NAMES)[keyof typeof RELAY_SECRET_NAMES];

/** OS-backed storage used by the shared Relay core. */
export interface SecureStore {
  read(name: RelaySecretName): string | null;
  write(name: RelaySecretName, value: string): void;
  writeIfAbsent(name: RelaySecretName, value: string): boolean;
  remove(name: RelaySecretName): void;
}
