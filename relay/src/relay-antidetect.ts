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
  type CurrentDeviceBrowserFailureCode,
} from "../../src/lib/relay/current-device-browser-health";
import {
  resolveMktBrowserToken,
  type MktBrowserTokenSource,
  type ResolvedMktBrowserToken,
} from "./mkt-browser-token-discovery";

const PROBE_TTL_MS = 30_000;

/**
 * Cái mà máy ĐANG NGỒI tự khai, đọc tại chỗ chứ không suy từ cờ lịch sử trên máy chủ.
 *
 * Không có trường bí mật nào: không token, không đường dẫn, không endpoint proxy. Bản desktop cũ
 * chưa có `get_runtime_info` thì mọi trường phiên bản là `null` và `contractCompatible` là `false`
 * — máy cũ phải hiện ra là máy cũ, không được lẫn vào nhóm bình thường.
 */
export type AntidetectRuntimeHealth = RelayBrowserHealth;

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
  private probe: { at: number; ready: boolean; token: string } | null = null;

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

    const baseUrl = resolveMktBrowserMcpUrl(
      this.config.mktBrowserUrl ?? MKT_BROWSER_DEFAULT_MCP_URL,
    );
    if (!this.adapter || this.adapterToken !== token) {
      this.adapter = new MktBrowserAdapter(baseUrl, token);
      this.adapterToken = token;
      this.probe = null;
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
  async describeRuntime(): Promise<AntidetectRuntimeHealth> {
    const offline: AntidetectRuntimeHealth = {
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

    if (!this.token) return offline;

    let info: Awaited<ReturnType<MktBrowserAdapter["runtimeInfo"]>> = null;
    try {
      info = await this.getMktBrowserAdapter().runtimeInfo();
    } catch {
      // Máy không trả lời cũng là một câu trả lời: giữ nguyên trạng thái ngoại tuyến.
      return offline;
    }

    const compatibility = describeMktBrowserCompatibility(info);
    return {
      // A successful runtime tool call is fresher evidence than the short availability cache.
      ready: info !== null ? true : await this.isReady(),
      provider: info?.provider ?? null,
      appVersion: info?.appVersion ?? null,
      contractVersion: info?.contractVersion ?? null,
      contractCompatible: compatibility.compatible,
      contractProblem: compatibility.reason,
      engine: info?.engine ?? null,
      capabilities: info?.capabilities ?? [],
      licenseCapacity: info?.licenseCapacity ?? null,
    };
  }

  async requireOperationalRuntime(): Promise<AntidetectRuntimeHealth> {
    const health = await this.describeRuntime();
    const readiness = currentDeviceBrowserReadiness(health);
    const code = currentDeviceBrowserFailureCode(readiness.state);
    if (!readiness.ready && code) {
      throw new AntidetectRuntimeNotReadyError(readiness.message, code);
    }
    return health;
  }

  async refreshLicenseCapacity() {
    return await this.getMktBrowserAdapter().refreshLicenseCapacity();
  }

  private getMktBrowserAdapter(): MktBrowserAdapter {
    this.getAdapter();
    if (!this.adapter) throw new AntidetectNotConfiguredError();
    return this.adapter;
  }
}
