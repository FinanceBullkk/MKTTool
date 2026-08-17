import path from "node:path";

interface CompatibilityTransitionGate {
  activeProfileOperations: number;
  preparing: boolean;
  prepared: boolean;
}

const gates = new Map<string, CompatibilityTransitionGate>();

export class CompatibilityTransitionInProgressError extends Error {}

export async function withCompatibilityProfileOperationLock<T>(
  home: string,
  operation: () => Promise<T>,
): Promise<T> {
  const key = homeKey(home);
  const gate = gateFor(key);
  if (gate.preparing || gate.prepared) {
    throw new CompatibilityTransitionInProgressError(
      "A compatibility transition is in progress. Wait for Relay and MKT Browser to restart.",
    );
  }
  gate.activeProfileOperations += 1;
  try {
    return await operation();
  } finally {
    gate.activeProfileOperations -= 1;
    removeIdleGate(key, gate);
  }
}

export async function withCompatibilityTransitionPreparationLock<T>(
  home: string,
  operation: () => Promise<T>,
): Promise<T> {
  const key = homeKey(home);
  const gate = gateFor(key);
  if (gate.preparing || gate.prepared) {
    throw new Error("Another compatibility transition request is already being prepared.");
  }
  if (gate.activeProfileOperations > 0) {
    throw new Error("Wait for the active MKT Browser profile operation to finish, then retry.");
  }
  gate.preparing = true;
  try {
    const result = await operation();
    gate.prepared = true;
    return result;
  } finally {
    gate.preparing = false;
    removeIdleGate(key, gate);
  }
}

export function completeCompatibilityTransition(home: string): void {
  const key = homeKey(home);
  const gate = gates.get(key);
  if (!gate) return;
  gate.prepared = false;
  removeIdleGate(key, gate);
}

export function assertNoCompatibilityTransitionInProgress(home: string): void {
  const gate = gates.get(homeKey(home));
  if (gate?.preparing || gate?.prepared) {
    throw new CompatibilityTransitionInProgressError(
      "Device retirement cannot start while a compatibility transition is in progress.",
    );
  }
}

function homeKey(home: string): string {
  return path.resolve(home).toLowerCase();
}

function gateFor(key: string): CompatibilityTransitionGate {
  const existing = gates.get(key);
  if (existing) return existing;
  const created = { activeProfileOperations: 0, preparing: false, prepared: false };
  gates.set(key, created);
  return created;
}

function removeIdleGate(key: string, gate: CompatibilityTransitionGate): void {
  if (!gate.preparing && !gate.prepared && gate.activeProfileOperations === 0) gates.delete(key);
}
