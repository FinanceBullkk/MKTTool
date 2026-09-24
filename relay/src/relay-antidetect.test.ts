import { afterEach, describe, expect, it, vi } from "vitest";
import { MktBrowserAdapter } from "../../src/lib/antidetect/mkt-browser-adapter";
import type { MktBrowserRuntimeInfo } from "../../src/lib/antidetect/mkt-browser-contract";
import type { RelayConfig } from "./relay-config";
import {
  AntidetectNotConfiguredError,
  AntidetectRuntimeNotReadyError,
  RELAY_READINESS_BUDGET_MS,
  RelayAntidetect,
} from "./relay-antidetect";
import type { ResolvedMktBrowserToken } from "./mkt-browser-token-discovery";

const CONFIG: RelayConfig = {
  deviceId: "device-abc",
  serverPublicKey: "a".repeat(64),
  vaultKeyOperator: "b".repeat(64),
  webOrigin: "https://mkttool.example.com",
};

const RUNTIME: MktBrowserRuntimeInfo = {
  provider: "mkt-browser",
  appVersion: "0.3.24",
  contractVersion: 6,
  profileSchemaVersion: 1,
  engine: { kind: "cft", version: "148", status: "ready" },
  capabilities: [
    "idempotent-create-v1",
    "atomic-launch-v1",
    "managed-profile-v1",
    "operation-diagnostics-v1",
    "install-readiness-v1",
    "local-install-ready-v1",
  ],
  localInstallReadiness: "ready",
  licenseCapacity: null,
};

function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((finish) => { resolve = finish; });
  return { promise, resolve };
}

afterEach(() => {
  vi.useRealTimers();
  vi.restoreAllMocks();
});

describe("RelayAntidetect token discovery", () => {
  it("sees a token that appears after Relay startup without a restart", () => {
    let token: ResolvedMktBrowserToken | null = null;
    const antidetect = new RelayAntidetect(CONFIG, () => token);

    expect(antidetect.tokenStatus()).toEqual({ available: false, source: null });
    expect(() => antidetect.getAdapter()).toThrow(AntidetectNotConfiguredError);

    token = { value: "c".repeat(64), source: "mkt-browser-data" };

    expect(antidetect.tokenStatus()).toEqual({
      available: true,
      source: "mkt-browser-data",
    });
    expect(antidetect.getAdapter().providerName).toBe("MKT Browser");
  });
});

describe("RelayAntidetect bounded runtime observation", () => {
  it("coalesces concurrent health reads and gives the MCP sequence one total budget", async () => {
    const observed = deferred<{ reachable: boolean; info: MktBrowserRuntimeInfo }>();
    const observeRuntimeInfo = vi.spyOn(MktBrowserAdapter.prototype, "observeRuntimeInfo")
      .mockImplementation(async (budget) => {
        expect(budget).toBe(RELAY_READINESS_BUDGET_MS);
        return observed.promise;
      });
    const token: ResolvedMktBrowserToken = { value: "c".repeat(64), source: "mkt-browser-data" };
    const antidetect = new RelayAntidetect(CONFIG, () => token);

    const first = antidetect.describeRuntime();
    const second = antidetect.describeRuntime();
    expect(observeRuntimeInfo).toHaveBeenCalledTimes(1);

    observed.resolve({ reachable: true, info: RUNTIME });
    await expect(Promise.all([first, second])).resolves.toEqual([
      expect.objectContaining({ ready: true, contractVersion: 6, localInstallReadiness: "ready" }),
      expect.objectContaining({ ready: true, contractVersion: 6, localInstallReadiness: "ready" }),
    ]);
  });

  it("does not let a short caller truncate a concurrent full-budget health read", async () => {
    vi.useFakeTimers();
    const observed = deferred<{ reachable: boolean; info: MktBrowserRuntimeInfo }>();
    const observeRuntimeInfo = vi.spyOn(MktBrowserAdapter.prototype, "observeRuntimeInfo")
      .mockImplementation(async (budget) => {
        expect(budget).toBe(RELAY_READINESS_BUDGET_MS);
        return observed.promise;
      });
    const token: ResolvedMktBrowserToken = { value: "c".repeat(64), source: "mkt-browser-data" };
    const antidetect = new RelayAntidetect(CONFIG, () => token);

    const short = antidetect.describeRuntime(1);
    const normal = antidetect.describeRuntime();
    await vi.advanceTimersByTimeAsync(1);

    await expect(short).resolves.toMatchObject({
      ready: false,
      provider: null,
      runtimeObservation: "timeout",
    });
    observed.resolve({ reachable: true, info: RUNTIME });
    await expect(normal).resolves.toMatchObject({ ready: true, contractVersion: 6 });
    expect(observeRuntimeInfo).toHaveBeenCalledTimes(1);
  });

  it("rejects an expired runtime observation as indeterminate rather than offline", async () => {
    vi.useFakeTimers();
    vi.spyOn(MktBrowserAdapter.prototype, "observeRuntimeInfo")
      .mockImplementation(async () => new Promise<never>(() => {}));
    const token: ResolvedMktBrowserToken = { value: "c".repeat(64), source: "mkt-browser-data" };
    const antidetect = new RelayAntidetect(CONFIG, () => token);

    const result = antidetect.requireOperationalRuntime(1);
    const assertion = expect(result).rejects.toMatchObject({
      name: AntidetectRuntimeNotReadyError.name,
      code: "RUNTIME_TIMEOUT",
    });
    await vi.advanceTimersByTimeAsync(1);

    await assertion;
  });

  it("maps an adapter runtime deadline to RUNTIME_TIMEOUT rather than BROWSER_OFFLINE", async () => {
    vi.spyOn(MktBrowserAdapter.prototype, "observeRuntimeInfo").mockResolvedValue({
      reachable: false,
      info: null,
      timedOut: true,
    });
    const token: ResolvedMktBrowserToken = { value: "c".repeat(64), source: "mkt-browser-data" };
    const antidetect = new RelayAntidetect(CONFIG, () => token);

    await expect(antidetect.requireOperationalRuntime()).rejects.toMatchObject({
      name: AntidetectRuntimeNotReadyError.name,
      code: "RUNTIME_TIMEOUT",
    });
  });

  it("discards a completed observation from a superseded token generation", async () => {
    const firstResult = deferred<{ reachable: boolean; info: MktBrowserRuntimeInfo }>();
    let calls = 0;
    vi.spyOn(MktBrowserAdapter.prototype, "observeRuntimeInfo").mockImplementation(async () => {
      calls += 1;
      return calls === 1 ? firstResult.promise : { reachable: true, info: RUNTIME };
    });
    let token: ResolvedMktBrowserToken = { value: "c".repeat(64), source: "mkt-browser-data" };
    const antidetect = new RelayAntidetect(CONFIG, () => token);

    const stale = antidetect.describeRuntime();
    token = { value: "d".repeat(64), source: "mkt-browser-data" };
    const fresh = await antidetect.describeRuntime();
    firstResult.resolve({ reachable: true, info: RUNTIME });

    await expect(stale).resolves.toMatchObject({ ready: false, provider: null });
    expect(fresh).toMatchObject({ ready: true, provider: "mkt-browser" });
    expect(calls).toBe(2);
  });

  it("binds a profile action to the adapter that passed readiness", async () => {
    const usedAdapters: MktBrowserAdapter[] = [];
    vi.spyOn(MktBrowserAdapter.prototype, "observeRuntimeInfo").mockResolvedValue({
      reachable: true,
      info: RUNTIME,
    });
    vi.spyOn(MktBrowserAdapter.prototype, "listProfiles").mockImplementation(
      async function(this: MktBrowserAdapter) {
        usedAdapters.push(this);
        return [];
      },
    );
    const firstToken: ResolvedMktBrowserToken = {
      value: "c".repeat(64),
      source: "mkt-browser-data",
    };
    const secondToken: ResolvedMktBrowserToken = {
      value: "d".repeat(64),
      source: "mkt-browser-data",
    };
    let token = firstToken;
    const antidetect = new RelayAntidetect(CONFIG, () => token);

    const checkedAdapter = await antidetect.requireOperationalAdapter();
    token = secondToken;
    const laterAdapter = antidetect.getAdapter();
    await checkedAdapter.listProfiles();

    expect(laterAdapter).not.toBe(checkedAdapter);
    expect(usedAdapters).toEqual([checkedAdapter]);
  });

  it("fails closed when the local MCP token rotates during readiness", async () => {
    const observed = deferred<{ reachable: boolean; info: MktBrowserRuntimeInfo }>();
    const observeRuntimeInfo = vi.spyOn(MktBrowserAdapter.prototype, "observeRuntimeInfo")
      .mockImplementation(async () => observed.promise);
    const firstToken: ResolvedMktBrowserToken = {
      value: "c".repeat(64),
      source: "mkt-browser-data",
    };
    const secondToken: ResolvedMktBrowserToken = {
      value: "d".repeat(64),
      source: "mkt-browser-data",
    };
    let token: ResolvedMktBrowserToken | null = firstToken;
    const antidetect = new RelayAntidetect(CONFIG, () => token);

    const checkedAdapter = antidetect.requireOperationalAdapter();
    token = secondToken;
    observed.resolve({ reachable: true, info: RUNTIME });

    await expect(checkedAdapter).rejects.toMatchObject({ code: "BROWSER_OFFLINE" });
    expect(observeRuntimeInfo).toHaveBeenCalledOnce();
  });

  it("reports a missing MCP token when it disappears during readiness", async () => {
    const observed = deferred<{ reachable: boolean; info: MktBrowserRuntimeInfo }>();
    vi.spyOn(MktBrowserAdapter.prototype, "observeRuntimeInfo")
      .mockImplementation(async () => observed.promise);
    const firstToken: ResolvedMktBrowserToken = {
      value: "c".repeat(64),
      source: "mkt-browser-data",
    };
    let token: ResolvedMktBrowserToken | null = firstToken;
    const antidetect = new RelayAntidetect(CONFIG, () => token);

    const checkedAdapter = antidetect.requireOperationalAdapter();
    token = null;
    observed.resolve({ reachable: true, info: RUNTIME });

    await expect(checkedAdapter).rejects.toBeInstanceOf(AntidetectNotConfiguredError);
  });

  it("does not reuse a pre-retry runtime observation after an explicit capacity refresh", async () => {
    const observeRuntimeInfo = vi.spyOn(MktBrowserAdapter.prototype, "observeRuntimeInfo")
      .mockResolvedValue({ reachable: true, info: RUNTIME });
    const refreshLicenseCapacity = vi.spyOn(MktBrowserAdapter.prototype, "refreshLicenseCapacity")
      .mockResolvedValue(null);
    const token: ResolvedMktBrowserToken = { value: "c".repeat(64), source: "mkt-browser-data" };
    const antidetect = new RelayAntidetect(CONFIG, () => token);

    await antidetect.describeRuntime();
    await antidetect.refreshLicenseCapacity();
    await antidetect.describeRuntime();

    expect(refreshLicenseCapacity).toHaveBeenCalledOnce();
    expect(observeRuntimeInfo).toHaveBeenCalledTimes(2);
  });

  it.each([
    ["checking", "INSTALL_READINESS_CHECKING"],
    ["unavailable", "INSTALL_READINESS_UNAVAILABLE"],
    ["failed", "INSTALL_READINESS_FAILED"],
  ] as const)("rejects v6 local-install %s before a profile operation", async (state, code) => {
    vi.spyOn(MktBrowserAdapter.prototype, "observeRuntimeInfo").mockResolvedValue({
      reachable: true,
      info: { ...RUNTIME, localInstallReadiness: state },
    });
    const token: ResolvedMktBrowserToken = { value: "c".repeat(64), source: "mkt-browser-data" };
    const antidetect = new RelayAntidetect(CONFIG, () => token);

    await expect(antidetect.requireOperationalRuntime()).rejects.toMatchObject({ code });
  });
});
