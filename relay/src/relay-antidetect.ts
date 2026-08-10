/** Relay-owned connection to MKT Browser on the same operator device. */

import type { AntidetectAdapter } from "../../src/lib/antidetect/antidetect-browser-adapter";
import { MktBrowserAdapter } from "../../src/lib/antidetect/mkt-browser-adapter";
import {
  MKT_BROWSER_DEFAULT_MCP_URL,
  resolveMktBrowserMcpUrl,
} from "../../src/lib/antidetect/mkt-browser-contract";
import type { RelayConfig } from "./relay-config";

const PROBE_TTL_MS = 30_000;

export class AntidetectNotConfiguredError extends Error {
  constructor() {
    super(
      'The Relay does not have an MKT Browser token. Open MKT Browser, choose MCP → "Connect an agent", ' +
        'then add "mktBrowserToken" to relay-config.json and restart the Relay.',
    );
    this.name = "AntidetectNotConfiguredError";
  }
}

/** The token is optional because credential and OTP actions do not use MKT Browser. */
export class RelayAntidetect {
  private adapter: AntidetectAdapter | null = null;
  private probe: { at: number; ready: boolean } | null = null;

  constructor(private readonly config: RelayConfig | null) {}

  private get token(): string | null {
    return this.config?.mktBrowserToken ?? null;
  }

  getAdapter(): AntidetectAdapter {
    const token = this.token;
    if (!this.config || !token) throw new AntidetectNotConfiguredError();

    const baseUrl = resolveMktBrowserMcpUrl(
      this.config.mktBrowserUrl ?? MKT_BROWSER_DEFAULT_MCP_URL,
    );
    this.adapter ??= new MktBrowserAdapter(baseUrl, token);
    return this.adapter;
  }

  /** Cache readiness briefly because the Web client calls Relay health before every action. */
  async isReady(now: number = Date.now()): Promise<boolean> {
    if (!this.token) return false;
    if (this.probe && now - this.probe.at < PROBE_TTL_MS) return this.probe.ready;

    let ready = false;
    try {
      ready = await this.getAdapter().isAvailable();
    } catch {
      // Health must stay available even when the local browser process is down.
      ready = false;
    }

    this.probe = { at: now, ready };
    return ready;
  }

  forgetProbe(): void {
    this.probe = null;
  }
}
