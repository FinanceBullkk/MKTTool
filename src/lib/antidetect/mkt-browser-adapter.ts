/** MKT Browser adapter for the owned loopback MCP contract. */

import {
  type AntidetectAdapter,
  AntidetectError,
  type AntidetectProfileSummary,
  type AntidetectProxyConfig,
  AntidetectUnavailableError,
  type CreateProfileRequest,
  type FingerprintOptions,
  type LaunchedProfile,
} from "./antidetect-browser-adapter";
import {
  MKT_BROWSER_PROVIDER_NAME,
  MKT_BROWSER_RUNTIME_INFO_TOOL,
  type MktBrowserRuntimeInfo,
  resolveMktBrowserMcpUrl,
} from "./mkt-browser-contract";
import {
  McpToolError,
  type McpToolResult,
  McpUnauthorizedError,
  MktBrowserMcpClient,
  extractText,
} from "./mkt-browser-mcp-client";

const TOOLS = {
  launch: "launch_profile",
  close: "close_profile",
  list: "list_profiles",
  update: "update_profile",
  create: "create_profile",
  fingerprintOptions: "list_fingerprint_options",
} as const;

function parseToolBody(result: McpToolResult): Record<string, unknown> {
  const text = extractText(result).trim();
  if (text === "") return {};
  try {
    const parsed: unknown = JSON.parse(text);
    return typeof parsed === "object" && parsed !== null
      ? (parsed as Record<string, unknown>)
      : {};
  } catch {
    return {};
  }
}

const CDP_ENDPOINT_PATTERN = /(wss?:\/\/[^\s"'{}]+|https?:\/\/127\.0\.0\.1:\d+[^\s"'{}]*)/;

/**
 * Accept a runtime report only when every field the caller will act on is present and typed.
 * A partial answer is treated as no answer, because a half-read report would be indistinguishable
 * from a legacy build while still looking authoritative.
 */
function parseRuntimeInfo(body: Record<string, unknown>): MktBrowserRuntimeInfo | null {
  const engine = body.engine;
  if (
    typeof body.provider !== "string" ||
    typeof body.appVersion !== "string" ||
    typeof body.contractVersion !== "number" ||
    typeof body.profileSchemaVersion !== "number" ||
    !engine ||
    typeof engine !== "object"
  ) {
    return null;
  }

  const engineRecord = engine as Record<string, unknown>;
  if (typeof engineRecord.kind !== "string" || typeof engineRecord.status !== "string") return null;

  return {
    provider: body.provider,
    appVersion: body.appVersion,
    contractVersion: body.contractVersion,
    profileSchemaVersion: body.profileSchemaVersion,
    engine: {
      kind: engineRecord.kind,
      version: typeof engineRecord.version === "string" ? engineRecord.version : null,
      status: engineRecord.status,
    },
    capabilities: Array.isArray(body.capabilities)
      ? body.capabilities.filter((item): item is string => typeof item === "string")
      : [],
  };
}

function redact(text: string, secrets: Array<string | undefined>): string {
  const orderedSecrets = [...new Set(secrets.filter((secret): secret is string => Boolean(secret)))].sort(
    (left, right) => right.length - left.length,
  );
  return orderedSecrets.reduce<string>(
    (redacted, secret) => (secret ? redacted.split(secret).join("***") : redacted),
    text,
  );
}

function redactProxyDetails(text: string, proxy?: AntidetectProxyConfig): string {
  return redact(text, [proxy?.host, proxy?.username, proxy?.password]);
}

/** The desktop's stable failure code, when the build that answered was new enough to send one. */
function errorCodeOf(cause: unknown): string | undefined {
  return cause instanceof McpToolError ? cause.code : undefined;
}

export class MktBrowserAdapter implements AntidetectAdapter {
  readonly providerName = MKT_BROWSER_PROVIDER_NAME;

  private readonly baseUrl: string;
  private readonly client: MktBrowserMcpClient;
  private initialized = false;
  private availableTools: string[] = [];

  constructor(baseUrl: string, token?: string) {
    this.baseUrl = resolveMktBrowserMcpUrl(baseUrl);
    this.client = new MktBrowserMcpClient(this.baseUrl, token);
  }

  private async ensureInitialized(): Promise<void> {
    if (this.initialized) return;
    try {
      await this.client.initialize();
      this.availableTools = await this.client.listTools();
      this.initialized = true;
    } catch (cause) {
      if (cause instanceof McpUnauthorizedError) {
        throw new AntidetectError(cause.message, this.providerName, { cause });
      }
      throw new AntidetectUnavailableError(this.providerName, this.baseUrl, { cause });
    }
  }

  private requireTool(name: string, operation: string): string {
    if (this.availableTools.includes(name)) return name;
    throw new AntidetectError(
      `${this.providerName} does not expose the required ${operation} tool "${name}". ` +
        `Available tools: [${this.availableTools.join(", ")}]. Install the matching MKT Browser build.`,
      this.providerName,
    );
  }

  /** Reconnect once after transport/session failure, but never replay a tool-level rejection. */
  private async callToolWithRehandshake(
    name: string,
    args: Record<string, unknown>,
  ): Promise<McpToolResult> {
    try {
      return await this.client.callTool(name, args);
    } catch (cause) {
      if (cause instanceof McpUnauthorizedError || cause instanceof McpToolError) throw cause;

      this.initialized = false;
      this.client.resetSession();
      await this.ensureInitialized();
      return await this.client.callTool(name, args);
    }
  }

  async isAvailable(): Promise<boolean> {
    try {
      await this.ensureInitialized();
      return true;
    } catch {
      return false;
    }
  }

  /**
   * Ask the device to describe itself.
   *
   * Returns `null` when this build predates the contract — the W01/W02 packaged artifacts do not
   * expose the tool — so callers can report a legacy device instead of inventing versions for it.
   */
  async runtimeInfo(): Promise<MktBrowserRuntimeInfo | null> {
    await this.ensureInitialized();
    if (!this.availableTools.includes(MKT_BROWSER_RUNTIME_INFO_TOOL)) return null;

    try {
      const body = parseToolBody(
        await this.callToolWithRehandshake(MKT_BROWSER_RUNTIME_INFO_TOOL, {}),
      );
      return parseRuntimeInfo(body);
    } catch {
      // Runtime reporting is diagnostic. A device that cannot answer must not turn a health read
      // into a thrown error on every operational surface that calls it.
      return null;
    }
  }

  async applyProxy(profileId: string, proxy: AntidetectProxyConfig): Promise<void> {
    await this.ensureInitialized();
    const toolName = this.requireTool(TOOLS.update, "profile update");
    const proxyPayload = {
      type: proxy.protocol,
      host: proxy.host,
      port: proxy.port,
      ...(proxy.username ? { username: proxy.username } : {}),
      ...(proxy.password ? { password: proxy.password } : {}),
    };

    try {
      await this.callToolWithRehandshake(toolName, {
        profile_id: profileId,
        proxy: proxyPayload,
      });
    } catch (cause) {
      const reason = redactProxyDetails(cause instanceof Error ? cause.message : String(cause), proxy);
      throw new AntidetectError(
        `${this.providerName} rejected the proxy for profile "${profileId}". ` +
          `The profile was not launched. Reason: ${reason}`,
        this.providerName,
        { cause, code: errorCodeOf(cause) },
      );
    }
  }

  async launchProfile(profileId: string): Promise<LaunchedProfile> {
    await this.ensureInitialized();
    const toolName = this.requireTool(TOOLS.launch, "profile launch");
    let result: McpToolResult;
    try {
      result = await this.callToolWithRehandshake(toolName, { profile_id: profileId });
    } catch (cause) {
      // Carry the code so the Relay can name the failing layer — engine missing, proxy refused,
      // profile gone — instead of forwarding an internal sentence to the operator.
      throw new AntidetectError(
        `${this.providerName} could not launch profile "${profileId}". ` +
          `Reason: ${cause instanceof Error ? cause.message : String(cause)}`,
        this.providerName,
        { cause, code: errorCodeOf(cause) },
      );
    }
    const responseText = [extractText(result), JSON.stringify(result.structuredContent ?? {})].join(
      "\n",
    );
    return {
      cdpEndpoint: responseText.match(CDP_ENDPOINT_PATTERN)?.[0],
      profileId,
    };
  }

  async closeProfile(profileId: string): Promise<void> {
    await this.ensureInitialized();
    const toolName = this.requireTool(TOOLS.close, "profile close");
    await this.callToolWithRehandshake(toolName, { profile_id: profileId });
  }

  async listProfiles(): Promise<AntidetectProfileSummary[]> {
    await this.ensureInitialized();
    const toolName = this.requireTool(TOOLS.list, "profile list");
    const body = parseToolBody(await this.callToolWithRehandshake(toolName, {}));
    const rows = Array.isArray(body.profiles) ? body.profiles : [];

    return rows
      .filter((row): row is Record<string, unknown> => typeof row === "object" && row !== null)
      .filter((row) => typeof row.id === "string" && typeof row.name === "string")
      .map((row) => ({
        id: row.id as string,
        name: row.name as string,
        isRunning: typeof row.isRunning === "boolean" ? row.isRunning : undefined,
        proxyCountry: typeof row.proxyCountry === "string" ? row.proxyCountry : undefined,
        timezone: typeof row.timezone === "string" ? row.timezone : undefined,
      }));
  }

  async fingerprintOptions(): Promise<FingerprintOptions> {
    await this.ensureInitialized();
    const toolName = this.requireTool(TOOLS.fingerprintOptions, "fingerprint option list");
    const body = parseToolBody(await this.callToolWithRehandshake(toolName, {}));
    return {
      devices: Array.isArray(body.devices) ? (body.devices as FingerprintOptions["devices"]) : [],
      locales: Array.isArray(body.locales) ? (body.locales as FingerprintOptions["locales"]) : [],
    };
  }

  async createProfile(request: CreateProfileRequest): Promise<string> {
    await this.ensureInitialized();
    const toolName = this.requireTool(TOOLS.create, "profile creation");
    const args: Record<string, unknown> = { name: request.name };
    if (request.notes) args.notes = request.notes;
    if (request.tags?.length) args.tags = request.tags;
    if (request.seed) args.seed = request.seed;
    if (request.fingerprint) args.fingerprint = request.fingerprint;
    if (request.proxy) {
      args.proxy = {
        type: request.proxy.protocol,
        host: request.proxy.host,
        port: request.proxy.port,
        ...(request.proxy.username ? { username: request.proxy.username } : {}),
        ...(request.proxy.password ? { password: request.proxy.password } : {}),
      };
    }

    let body: Record<string, unknown>;
    try {
      body = parseToolBody(await this.callToolWithRehandshake(toolName, args));
    } catch (cause) {
      const reason = redactProxyDetails(
        cause instanceof Error ? cause.message : String(cause),
        request.proxy,
      );
      throw new AntidetectError(
        `${this.providerName} could not create profile "${request.name}". Reason: ${reason}`,
        this.providerName,
        { cause, code: errorCodeOf(cause) },
      );
    }

    if (typeof body.id !== "string" || body.id === "") {
      throw new AntidetectError(
        `${this.providerName} created profile "${request.name}" without returning an id. ` +
          `Delete any orphan with that name in MKT Browser before retrying.`,
        this.providerName,
      );
    }
    return body.id;
  }

  async isRunning(profileId: string): Promise<boolean> {
    try {
      const profiles = await this.listProfiles();
      return profiles.some((profile) => profile.id === profileId && profile.isRunning === true);
    } catch {
      return false;
    }
  }
}
