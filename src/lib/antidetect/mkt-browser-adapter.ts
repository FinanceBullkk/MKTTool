/** MKT Browser adapter for the owned loopback MCP contract. */

import {
  type AntidetectAdapter,
  AntidetectError,
  type AntidetectOperationDiagnostic,
  type AntidetectProfileSummary,
  type AntidetectProxyConfig,
  AntidetectUnavailableError,
  type CreateProfileRequest,
  type CreatedProfile,
  type FingerprintOptions,
  type LaunchedProfile,
} from "./antidetect-browser-adapter";
import {
  isMktBrowserErrorCode,
  MKT_BROWSER_PROVIDER_NAME,
  MKT_BROWSER_REFRESH_LICENSE_CAPACITY_TOOL,
  MKT_BROWSER_RUNTIME_INFO_TOOL,
  type MktBrowserLicenseCapacity,
  type MktBrowserRuntimeInfo,
  parseMktBrowserLicenseCapacity,
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
  atomicLaunch: "launch_managed_profile",
  launch: "launch_profile",
  close: "close_profile",
  list: "list_profiles",
  update: "update_profile",
  create: "create_profile",
  fingerprintOptions: "list_fingerprint_options",
  refreshCapacity: MKT_BROWSER_REFRESH_LICENSE_CAPACITY_TOOL,
} as const;

function proxyPayload(proxy: AntidetectProxyConfig): Record<string, unknown> {
  return {
    type: proxy.protocol,
    host: proxy.host,
    port: proxy.port,
    ...(proxy.username ? { username: proxy.username } : {}),
    ...(proxy.password ? { password: proxy.password } : {}),
  };
}

function launchedProfileFromResult(
  profileId: string,
  result: McpToolResult,
): LaunchedProfile {
  const body = parseToolBody(result);
  const diagnostic = parseOperationDiagnostic(body.diagnostic);
  const responseText = [extractText(result), JSON.stringify(result.structuredContent ?? {})].join(
    "\n",
  );
  return {
    cdpEndpoint: responseText.match(CDP_ENDPOINT_PATTERN)?.[0],
    profileId,
    ...(diagnostic ? { diagnostic } : {}),
  };
}

function parseOperationDiagnostic(value: unknown): AntidetectOperationDiagnostic | undefined {
  if (!value || typeof value !== "object") return undefined;
  const diagnostic = value as Record<string, unknown>;
  const runtime = diagnostic.runtime;
  if (
    typeof diagnostic.operationId !== "string" ||
    typeof diagnostic.stage !== "string" ||
    typeof diagnostic.durationMs !== "number" ||
    !runtime ||
    typeof runtime !== "object"
  ) {
    return undefined;
  }

  const runtimeRecord = runtime as Record<string, unknown>;
  const engine = runtimeRecord.engine;
  if (
    typeof runtimeRecord.appVersion !== "string" ||
    typeof runtimeRecord.contractVersion !== "number" ||
    typeof runtimeRecord.profileSchemaVersion !== "number" ||
    !engine ||
    typeof engine !== "object"
  ) {
    return undefined;
  }
  const engineRecord = engine as Record<string, unknown>;
  if (typeof engineRecord.kind !== "string" || typeof engineRecord.status !== "string") {
    return undefined;
  }

  return {
    operationId: diagnostic.operationId,
    ...(typeof diagnostic.requestId === "string" ? { requestId: diagnostic.requestId } : {}),
    stage: diagnostic.stage,
    ...(isMktBrowserErrorCode(diagnostic.code) ? { code: diagnostic.code } : {}),
    durationMs: diagnostic.durationMs,
    runtime: {
      appVersion: runtimeRecord.appVersion,
      contractVersion: runtimeRecord.contractVersion,
      profileSchemaVersion: runtimeRecord.profileSchemaVersion,
      engine: {
        kind: engineRecord.kind,
        version: typeof engineRecord.version === "string" ? engineRecord.version : null,
        status: engineRecord.status,
      },
    },
  };
}

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
    licenseCapacity: parseMktBrowserLicenseCapacity(body.licenseCapacity),
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

function errorDiagnosticOf(cause: unknown): AntidetectOperationDiagnostic | undefined {
  return cause instanceof McpToolError ? parseOperationDiagnostic(cause.diagnostic) : undefined;
}

function requireCorrelatedDiagnostic(
  diagnostic: AntidetectOperationDiagnostic | undefined,
  operationId: string | undefined,
  requestId?: string,
): AntidetectOperationDiagnostic | undefined {
  if (!operationId) return diagnostic;
  if (
    !diagnostic ||
    diagnostic.operationId !== operationId ||
    (requestId !== undefined && diagnostic.requestId !== requestId)
  ) {
    throw new AntidetectError(
      `${MKT_BROWSER_PROVIDER_NAME} returned an uncorrelated operation diagnostic.`,
      MKT_BROWSER_PROVIDER_NAME,
      { code: "INTERNAL_ERROR" },
    );
  }
  return diagnostic;
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

  async refreshLicenseCapacity(): Promise<MktBrowserLicenseCapacity | null> {
    await this.ensureInitialized();
    const toolName = this.requireTool(TOOLS.refreshCapacity, "licence capacity refresh");
    const body = parseToolBody(await this.callToolWithRehandshake(toolName, {}));
    return parseMktBrowserLicenseCapacity(body.licenseCapacity);
  }

  async applyProxy(profileId: string, proxy: AntidetectProxyConfig): Promise<void> {
    await this.ensureInitialized();
    const toolName = this.requireTool(TOOLS.update, "profile update");
    try {
      await this.callToolWithRehandshake(toolName, {
        profile_id: profileId,
        proxy: proxyPayload(proxy),
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

  async launchProfileWithProxy(
    profileId: string,
    proxy: AntidetectProxyConfig,
    operation?: { operationId: string; requestId?: string },
  ): Promise<LaunchedProfile> {
    await this.ensureInitialized();
    if (!this.availableTools.includes(TOOLS.atomicLaunch)) {
      await this.applyProxy(profileId, proxy);
      return this.launchProfile(profileId);
    }

    let result: McpToolResult;
    try {
      result = await this.callToolWithRehandshake(TOOLS.atomicLaunch, {
        profile_id: profileId,
        proxy: proxyPayload(proxy),
        ...(operation ? { operation_id: operation.operationId } : {}),
      });
    } catch (cause) {
      const reason = redactProxyDetails(
        cause instanceof Error ? cause.message : String(cause),
        proxy,
      );
      throw new AntidetectError(
        `${this.providerName} could not safely launch profile "${profileId}" with its assigned proxy. ` +
          `Reason: ${reason}`,
        this.providerName,
        { cause, code: errorCodeOf(cause), diagnostic: errorDiagnosticOf(cause) },
      );
    }

    const launched = launchedProfileFromResult(profileId, result);
    launched.diagnostic = requireCorrelatedDiagnostic(
      launched.diagnostic,
      operation?.operationId,
      operation?.requestId,
    );
    return launched;
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
    return launchedProfileFromResult(profileId, result);
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

  async createProfile(request: CreateProfileRequest): Promise<CreatedProfile> {
    await this.ensureInitialized();
    const toolName = this.requireTool(TOOLS.create, "profile creation");
    const args: Record<string, unknown> = { name: request.name };
    if (request.notes) args.notes = request.notes;
    if (request.tags?.length) args.tags = request.tags;
    if (request.seed) args.seed = request.seed;
    if (request.externalRef) args.external_ref = request.externalRef;
    if (request.requestId) args.request_id = request.requestId;
    if (request.operationId) args.operation_id = request.operationId;
    if (request.fingerprint) args.fingerprint = request.fingerprint;
    if (request.proxy) {
      args.proxy = proxyPayload(request.proxy);
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
        { cause, code: errorCodeOf(cause), diagnostic: errorDiagnosticOf(cause) },
      );
    }

    if (typeof body.id !== "string" || body.id === "") {
      throw new AntidetectError(
        `${this.providerName} created profile "${request.name}" without returning an id. ` +
          `Delete any orphan with that name in MKT Browser before retrying.`,
        this.providerName,
      );
    }
    const diagnostic = requireCorrelatedDiagnostic(
      parseOperationDiagnostic(body.diagnostic),
      request.operationId,
      request.requestId,
    );
    return { profileId: body.id, ...(diagnostic ? { diagnostic } : {}) };
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
