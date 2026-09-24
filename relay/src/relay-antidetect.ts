/** Relay-owned connection to MKT Browser on the same operator device. */

import type { AntidetectAdapter } from "../../src/lib/antidetect/antidetect-browser-adapter";
import { MktBrowserAdapter } from "../../src/lib/antidetect/mkt-browser-adapter";
import {
  MKT_BROWSER_DEFAULT_MCP_URL,
  describeMktBrowserCompatibility,
  resolveMktBrowserMcpUrl,
} from "../../src/lib/antidetect/mkt-browser-contract";
import type { RelayConfig } from "./relay-config";
import type { RelayBrowserHealth } from "../../src/lib/relay/relay-endpoints";
import {
  currentDeviceBrowserFailureCode,
  currentDeviceBrowserReadiness,
  REQUIRED_SETUP_BROWSER_CAPABILITIES,
  type CurrentDeviceBrowserFailureCode,
} from "../../src/lib/relay/current-device-browser-health";
import {
  resolveMktBrowserToken,
  type MktBrowserTokenSource,
  type ResolvedMktBrowserToken,
} from "./mkt-browser-token-discovery";

const PROBE_TTL_MS = 30_000;
export const RELAY_READINESS_BUDGET_MS = 2_500;

/**
 * Cái mà máy ĐANG NGỒI tự khai, đọc tại chỗ chứ không suy từ cờ lịch sử trên máy chủ.
 *
 * Không có trường bí mật nào: không token, không đường dẫn, không endpoint proxy. Bản desktop cũ
 * chưa có `get_runtime_info` thì mọi trường phiên bản là `null` và `contractCompatible` là `false`
 * — máy cũ phải hiện ra là máy cũ, không được lẫn vào nhóm bình thường.
 */
export type AntidetectRuntimeHealth = RelayBrowserHealth;

interface RuntimeAdapterSnapshot {
  token: string;
  generation: number;
  adapter: MktBrowserAdapter;
}

function offlineRuntime(): AntidetectRuntimeHealth {
  return {
    ready: false,
    provider: null,
    appVersion: null,
    contractVersion: null,
    contractCompatible: false,
    contractProblem: "",
    engine: null,
    capabilities: [],
    licenseCapacity: null,
  };
}

function timedOutRuntime(): AntidetectRuntimeHealth {
  return { ...offlineRuntime(), runtimeObservation: "timeout" };
}

function waitForRuntimeObservation(
  observation: Promise<AntidetectRuntimeHealth>,
  timeoutMs: number,
): Promise<AntidetectRuntimeHealth> {
  const budget = Math.min(RELAY_READINESS_BUDGET_MS, timeoutMs);
  if (!Number.isFinite(budget) || budget <= 0) return Promise.resolve(timedOutRuntime());

  return new Promise((resolve) => {
    const timer = setTimeout(() => resolve(timedOutRuntime()), Math.ceil(budget));
    void observation.then(
      (health) => {
        clearTimeout(timer);
        resolve(health);
      },
      () => {
        clearTimeout(timer);
        resolve(offlineRuntime());
      },
    );
  });
}

export class AntidetectNotConfiguredError extends Error {
  constructor() {
    super(
      "The Relay could not find the local MKT Browser token. Open MKT Browser and enable MCP, then retry. " +
        'For development only, set "mktBrowserToken" in relay-config.json.',
    );
    this.name = "AntidetectNotConfiguredError";
  }
}

export class AntidetectRuntimeNotReadyError extends Error {
  constructor(
    message: string,
    readonly code: CurrentDeviceBrowserFailureCode,
  ) {
    super(message);
    this.name = "AntidetectRuntimeNotReadyError";
  }
}

/** The token is optional because credential and OTP actions do not use MKT Browser. */
export class RelayAntidetect {
  private adapter: MktBrowserAdapter | null = null;
  private adapterToken: string | null = null;
  private adapterGeneration = 0;
  private probe: { at: number; ready: boolean; token: string } | null = null;
  private runtimeObservation: {
    token: string;
    generation: number;
    promise: Promise<AntidetectRuntimeHealth>;
  } | null = null;

  constructor(
    private readonly config: RelayConfig | null,
    private readonly tokenResolver: () => ResolvedMktBrowserToken | null = () =>
      resolveMktBrowserToken(config?.mktBrowserToken),
  ) {}

  private get token(): string | null {
    return this.tokenResolver()?.value ?? null;
  }

  tokenStatus(): { available: boolean; source: MktBrowserTokenSource | null } {
    const resolved = this.tokenResolver();
    return { available: Boolean(resolved), source: resolved?.source ?? null };
  }

  getAdapter(): AntidetectAdapter {
    const token = this.token;
    if (!this.config || !token) throw new AntidetectNotConfiguredError();

    return this.getMktBrowserAdapterForToken(token);
  }

  private captureRuntimeAdapter(): RuntimeAdapterSnapshot {
    const token = this.token;
    if (!this.config || !token) throw new AntidetectNotConfiguredError();
    const adapter = this.getMktBrowserAdapterForToken(token);
    return { token, generation: this.adapterGeneration, adapter };
  }

  private isCurrentRuntimeAdapter(snapshot: RuntimeAdapterSnapshot): boolean {
    return this.token === snapshot.token &&
      this.adapterGeneration === snapshot.generation &&
      this.adapter === snapshot.adapter &&
      this.adapterToken === snapshot.token;
  }

  private getMktBrowserAdapterForToken(token: string): MktBrowserAdapter {
    if (!this.config) throw new AntidetectNotConfiguredError();
    const baseUrl = resolveMktBrowserMcpUrl(
      this.config.mktBrowserUrl ?? MKT_BROWSER_DEFAULT_MCP_URL,
    );
    if (!this.adapter || this.adapterToken !== token) {
      this.adapter = new MktBrowserAdapter(baseUrl, token);
      this.adapterToken = token;
      this.adapterGeneration += 1;
      this.probe = null;
      this.runtimeObservation = null;
    }
    return this.adapter;
  }

  /** Cache readiness briefly because the Web client calls Relay health before every action. */
  async isReady(now: number = Date.now()): Promise<boolean> {
    const token = this.token;
    if (!token) return false;
    if (this.probe && this.probe.token === token && now - this.probe.at < PROBE_TTL_MS) {
      return this.probe.ready;
    }

    let ready = false;
    try {
      ready = await this.getAdapter().isAvailable();
    } catch {
      // Health must stay available even when the local browser process is down.
      ready = false;
    }

    this.probe = { at: now, ready, token };
    return ready;
  }

  forgetProbe(): void {
    this.probe = null;
  }

  /**
   * Bốn tầng của máy này trong một lượt hỏi: chạy chưa, là sản phẩm nào, hợp đồng bản mấy, nhân
   * trình duyệt tới đâu. Không cache — người đọc trang này đang muốn biết TÌNH TRẠNG BÂY GIỜ.
   */
  async describeRuntime(timeoutMs: number = RELAY_READINESS_BUDGET_MS): Promise<AntidetectRuntimeHealth> {
    try {
      return await this.describeRuntimeFor(this.captureRuntimeAdapter(), timeoutMs);
    } catch (error) {
      if (error instanceof AntidetectNotConfiguredError) return offlineRuntime();
      throw error;
    }
  }

  private async describeRuntimeFor(
    snapshot: RuntimeAdapterSnapshot,
    timeoutMs: number,
  ): Promise<AntidetectRuntimeHealth> {
    const active = this.runtimeObservation;
    if (active && active.token === snapshot.token && active.generation === snapshot.generation) {
      return await waitForRuntimeObservation(active.promise, timeoutMs);
    }

    // The shared operation keeps the full health budget. Individual callers can stop waiting
    // sooner without turning their deadline into a false offline result for another caller.
    const promise = this.observeRuntime(
      snapshot.token,
      snapshot.generation,
      snapshot.adapter,
      RELAY_READINESS_BUDGET_MS,
    );
    this.runtimeObservation = { token: snapshot.token, generation: snapshot.generation, promise };
    const clearRuntimeObservation = () => {
      if (this.runtimeObservation?.promise === promise) this.runtimeObservation = null;
    };
    void promise.then(clearRuntimeObservation, clearRuntimeObservation);
    return await waitForRuntimeObservation(promise, timeoutMs);
  }

  private async observeRuntime(
    token: string,
    generation: number,
    adapter: MktBrowserAdapter,
    timeoutMs: number,
  ): Promise<AntidetectRuntimeHealth> {
    const offline = offlineRuntime();

    if (this.token !== token) return offline;

    let observation: Awaited<ReturnType<MktBrowserAdapter["observeRuntimeInfo"]>>;
    try {
      observation = await adapter.observeRuntimeInfo(timeoutMs);
    } catch {
      // Máy không trả lời cũng là một câu trả lời: giữ nguyên trạng thái ngoại tuyến.
      return offline;
    }

    if (
      this.token !== token ||
      this.adapterGeneration !== generation ||
      this.adapter !== adapter ||
      this.adapterToken !== token
    ) {
      return offlineRuntime();
    }

    const info = observation.info;
    const compatibility = describeMktBrowserCompatibility(info);
    return {
      // Discovery proves a legacy Browser is reachable without a second availability probe.
      ready: observation.reachable,
      provider: info?.provider ?? null,
      appVersion: info?.appVersion ?? null,
      contractVersion: info?.contractVersion ?? null,
      contractCompatible: compatibility.compatible,
      contractProblem: compatibility.reason,
      engine: info?.engine ?? null,
      capabilities: info?.capabilities ?? [],
      ...(info?.localInstallReadiness
        ? { localInstallReadiness: info.localInstallReadiness }
        : {}),
      licenseCapacity: info?.licenseCapacity ?? null,
      ...(observation.timedOut ? { runtimeObservation: "timeout" as const } : {}),
    };
  }

  private async requireOperationalSnapshot(timeoutMs?: number): Promise<{
    health: AntidetectRuntimeHealth;
    adapter: MktBrowserAdapter;
  }> {
    const snapshot = this.captureRuntimeAdapter();
    const health = await this.describeRuntimeFor(
      snapshot,
      timeoutMs ?? RELAY_READINESS_BUDGET_MS,
    );

    if (!this.isCurrentRuntimeAdapter(snapshot)) {
      if (!this.token) throw new AntidetectNotConfiguredError();
      throw new AntidetectRuntimeNotReadyError(
        "MKT Browser changed its local MCP connection while readiness was being checked. Check again before managing profiles.",
        "BROWSER_OFFLINE",
      );
    }

    const readiness = currentDeviceBrowserReadiness(health, REQUIRED_SETUP_BROWSER_CAPABILITIES);
    const code = currentDeviceBrowserFailureCode(readiness.state);
    if (!readiness.ready && code) {
      throw new AntidetectRuntimeNotReadyError(readiness.message, code);
    }
    return { health, adapter: snapshot.adapter };
  }

  async requireOperationalRuntime(timeoutMs?: number): Promise<AntidetectRuntimeHealth> {
    return (await this.requireOperationalSnapshot(timeoutMs)).health;
  }

  /**
   * Bind a profile action to the exact local MCP credential that passed readiness. A token rotation
   * may make that action fail safely, but must never switch it to an unvalidated new credential.
   */
  async requireOperationalAdapter(timeoutMs?: number): Promise<AntidetectAdapter> {
    return (await this.requireOperationalSnapshot(timeoutMs)).adapter;
  }

  async refreshLicenseCapacity() {
    try {
      return await this.getMktBrowserAdapter().refreshLicenseCapacity();
    } finally {
      // Browser starts a new install observation for this explicit Web action. Never let the
      // following health or profile read reuse the pre-refresh runtime report.
      this.forgetProbe();
      this.runtimeObservation = null;
    }
  }

  private getMktBrowserAdapter(): MktBrowserAdapter {
    const token = this.token;
    if (!this.config || !token) throw new AntidetectNotConfiguredError();
    return this.getMktBrowserAdapterForToken(token);
  }
}
