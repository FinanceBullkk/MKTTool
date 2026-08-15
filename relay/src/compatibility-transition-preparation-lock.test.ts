import { randomUUID } from "node:crypto";
import { describe, expect, it } from "vitest";
import {
  CompatibilityTransitionInProgressError,
  completeCompatibilityTransition,
  withCompatibilityProfileOperationLock,
  withCompatibilityTransitionPreparationLock,
} from "./compatibility-transition-preparation-lock";

describe("compatibility transition preparation gate", () => {
  it("rejects preparation while a profile mutation is still running", async () => {
    const home = uniqueHome();
    const operation = deferred<void>();
    const active = withCompatibilityProfileOperationLock(home, () => operation.promise);

    await expect(
      withCompatibilityTransitionPreparationLock(home, async () => "prepared"),
    ).rejects.toThrow("active MKT Browser profile operation");

    operation.resolve(undefined);
    await active;
  });

  it("blocks new profile mutations from preparation through convergence", async () => {
    const home = uniqueHome();
    const preparation = deferred<void>();
    const preparing = withCompatibilityTransitionPreparationLock(home, () => preparation.promise);

    await expect(
      withCompatibilityProfileOperationLock(home, async () => "opened"),
    ).rejects.toBeInstanceOf(CompatibilityTransitionInProgressError);

    preparation.resolve(undefined);
    await preparing;
    await expect(
      withCompatibilityProfileOperationLock(home, async () => "opened"),
    ).rejects.toBeInstanceOf(CompatibilityTransitionInProgressError);

    completeCompatibilityTransition(home);
    await expect(
      withCompatibilityProfileOperationLock(home, async () => "opened"),
    ).resolves.toBe("opened");
  });

  it("reopens profile mutations when preparation fails before a transition is durable", async () => {
    const home = uniqueHome();
    await expect(
      withCompatibilityTransitionPreparationLock(home, async () => {
        throw new Error("download failed");
      }),
    ).rejects.toThrow("download failed");

    await expect(
      withCompatibilityProfileOperationLock(home, async () => "opened"),
    ).resolves.toBe("opened");
  });
});

function uniqueHome(): string {
  return `C:\\MKTTool\\compatibility-gate-${randomUUID()}`;
}

function deferred<T>() {
  let resolve!: (value: T | PromiseLike<T>) => void;
  const promise = new Promise<T>((done) => {
    resolve = done;
  });
  return { promise, resolve };
}
