import { RELAY_SECRET_NAMES, type SecureStore } from "./secure-store";

export interface OperatorGrantState {
  v: 1;
  kind: "delivery" | "bootstrap";
  operatorKey: string;
  generation: number;
  grantId: string;
  grantHash: string;
  completionProof: string;
}

export function readOperatorGrantState(store: SecureStore): OperatorGrantState | null {
  const raw = store.read(RELAY_SECRET_NAMES.operatorGrantState);
  if (!raw) return null;
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    throw new Error("Protected operator grant state is not valid JSON.");
  }
  const state = parsed as Partial<OperatorGrantState>;
  if (
    state.v !== 1 ||
    (state.kind !== "delivery" && state.kind !== "bootstrap") ||
    !isHex(state.operatorKey, 64) ||
    !Number.isSafeInteger(state.generation) ||
    Number(state.generation) < 0 ||
    typeof state.grantId !== "string" ||
    typeof state.grantHash !== "string" ||
    typeof state.completionProof !== "string"
  ) {
    throw new Error("Protected operator grant state has an invalid shape.");
  }
  return state as OperatorGrantState;
}

export function writeOperatorGrantState(store: SecureStore, state: OperatorGrantState): void {
  const serialized = JSON.stringify(state);
  store.write(RELAY_SECRET_NAMES.operatorGrantState, serialized);
  if (store.read(RELAY_SECRET_NAMES.operatorGrantState) !== serialized) {
    throw new Error("Protected operator grant state failed read-back verification.");
  }
  retireLegacyOperatorKey(store);
}

export function retireLegacyOperatorKey(store: SecureStore): void {
  store.remove(RELAY_SECRET_NAMES.operatorDomainKey);
}

function isHex(value: unknown, length: number): value is string {
  return typeof value === "string" && value.length === length && /^[0-9a-f]+$/.test(value);
}
