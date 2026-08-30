import { readRelayRelease } from "@/lib/relay/relay-release-file";
import { RELAY_VERSION } from "@/lib/relay/relay-endpoints";

/**
 * Sanitized release facts exposed to an authenticated operator. Values are read from deployment
 * metadata, never inferred from a filename or a mutable source path. Missing required facts keep
 * the record `unpublished`; callers must not turn a partial record into a release claim.
 */
export interface ReleaseProvenance {
  status: "published" | "unpublished";
  candidateId: string | null;
  sourceSha: string | null;
  deploymentId: string | null;
  relay: {
    version: number;
    sizeBytes: number;
    sha256: string;
    source: "disk" | "r2";
  } | null;
  browser: {
    version: string;
    sizeBytes: number | null;
    sha256: string | null;
  } | null;
  engine: {
    kind: string;
    channel: string;
    version: string;
    sha256: string | null;
  } | null;
  signing: "authenticode" | "unsigned-internal-exception" | "unknown";
  /** Canonical expiry for the unsigned exception; null for signed or unknown status. */
  signingExceptionExpiresAt: string | null;
  missing: string[];
}

type ReleaseEnv = Partial<Record<string, string | undefined>>;

function firstEnv(env: ReleaseEnv, ...names: string[]): string | null {
  for (const name of names) {
    const raw = env[name];
    const value = typeof raw === "string" ? raw.trim() : "";
    if (value) return value;
  }
  return null;
}

function markMissing(missing: string[], label: string): void {
  if (!missing.includes(label)) missing.push(label);
}

function safeIdentity(value: string | null, label: string, missing: string[]): string | null {
  if (!value) {
    markMissing(missing, label);
    return null;
  }
  if (
    !/^[A-Za-z0-9][A-Za-z0-9._:-]{0,127}$/.test(value) ||
    /^(?:unknown|null|undefined|n\/a)$/i.test(value)
  ) {
    markMissing(missing, label);
    return null;
  }
  return value;
}

function safeSha(value: string | null, label: string, missing: string[], required = true): string | null {
  const normalized = typeof value === "string" ? value.toLowerCase() : "";
  if (!normalized || !/^[0-9a-f]{64}$/.test(normalized)) {
    if (required) markMissing(missing, label);
    return null;
  }
  return normalized;
}

function safeSourceSha(value: string | null, label: string, missing: string[]): string | null {
  const normalized = typeof value === "string" ? value.toLowerCase() : "";
  // Git commit IDs are normally SHA-1 (40 chars), while some deployment systems expose a
  // full SHA-256. Accept either exact digest length, never a prefix or arbitrary text.
  if (!/^(?:[0-9a-f]{40}|[0-9a-f]{64})$/.test(normalized)) {
    markMissing(missing, label);
    return null;
  }
  return normalized;
}

function safeVersion(value: string | null, label: string, missing: string[]): string | null {
  if (!value || !/^\d+\.\d+\.\d+(?:[-+][0-9A-Za-z.-]+)?$/.test(value)) {
    markMissing(missing, label);
    return null;
  }
  return value;
}

function safeSize(value: string | null, label: string, missing: string[]): number | null {
  if (!value || !/^\d+$/.test(value)) {
    markMissing(missing, label);
    return null;
  }
  const parsed = Number(value);
  if (!Number.isSafeInteger(parsed) || parsed <= 0) {
    markMissing(missing, label);
    return null;
  }
  return parsed;
}

function signingStatus(value: string | null): ReleaseProvenance["signing"] {
  if (value === "authenticode") return "authenticode";
  if (value === "unsigned-internal-exception") return value;
  return "unknown";
}

function futureIsoDate(value: string | null): string | null {
  if (!value) return null;
  const timestamp = Date.parse(value);
  if (!Number.isFinite(timestamp) || timestamp <= Date.now()) return null;
  return new Date(timestamp).toISOString();
}

function readRelayFacts(
  release: Awaited<ReturnType<typeof readRelayRelease>>,
  missing: string[],
): ReleaseProvenance["relay"] {
  if (!release.available) {
    markMissing(missing, "relay");
    return null;
  }

  const relayMissingBefore = missing.length;
  if (release.version !== RELAY_VERSION) markMissing(missing, "relay.version");
  if (!Number.isSafeInteger(release.sizeBytes) || release.sizeBytes <= 0) {
    markMissing(missing, "relay.sizeBytes");
  }
  const checksum = typeof release.checksum === "string" ? release.checksum.toLowerCase() : "";
  if (!/^[0-9a-f]{64}$/.test(checksum)) markMissing(missing, "relay.sha256");
  if (release.source !== "disk" && release.source !== "r2") markMissing(missing, "relay.source");

  if (missing.length !== relayMissingBefore) {
    markMissing(missing, "relay");
    return null;
  }
  return {
    version: release.version,
    sizeBytes: release.sizeBytes,
    sha256: checksum,
    source: release.source,
  };
}

/** Read a deployment's release tuple without returning any secret-bearing environment value. */
export async function readReleaseProvenance(env: ReleaseEnv = process.env): Promise<ReleaseProvenance> {
  const missing: string[] = [];
  const candidateId = safeIdentity(
    firstEnv(env, "MKT_RELEASE_CANDIDATE_ID", "RELEASE_CANDIDATE_ID"),
    "candidateId",
    missing,
  );
  const sourceSha = safeSourceSha(
    firstEnv(
      env,
      "MKT_RELEASE_SOURCE_SHA",
      "RELEASE_SOURCE_SHA",
      "MKT_RELEASE_BROWSER_SOURCE_SHA",
      "RELEASE_BROWSER_SOURCE_SHA",
      "RAILWAY_GIT_COMMIT_SHA",
    ),
    "sourceSha",
    missing,
  );
  const deploymentId = safeIdentity(
    firstEnv(env, "MKT_RELEASE_DEPLOYMENT_ID", "RELEASE_DEPLOYMENT_ID", "RAILWAY_DEPLOYMENT_ID"),
    "deploymentId",
    missing,
  );

  let relay: ReleaseProvenance["relay"] = null;
  try {
    relay = readRelayFacts(await readRelayRelease(RELAY_VERSION), missing);
  } catch {
    // Keep the public shape stable; the missing list tells an authenticated operator why this is
    // unpublished without echoing an R2 URL, connection detail, or environment value.
    markMissing(missing, "relay");
  }

  const browserVersion = safeVersion(
    firstEnv(env, "MKT_RELEASE_BROWSER_VERSION", "RELEASE_BROWSER_VERSION"),
    "browser.version",
    missing,
  );
  const browserSha = safeSha(
    firstEnv(env, "MKT_RELEASE_BROWSER_SHA256", "RELEASE_BROWSER_SHA256"),
    "browser.sha256",
    missing,
  );
  const browserSize = safeSize(
    firstEnv(env, "MKT_RELEASE_BROWSER_SIZE_BYTES", "RELEASE_BROWSER_SIZE_BYTES"),
    "browser.sizeBytes",
    missing,
  );
  const browser = browserVersion && browserSize !== null && browserSha
    ? { version: browserVersion, sizeBytes: browserSize, sha256: browserSha }
    : null;

  const engineKind = safeIdentity(
    firstEnv(env, "MKT_RELEASE_ENGINE_KIND", "RELEASE_ENGINE_KIND"),
    "engine.kind",
    missing,
  );
  const engineChannel = safeIdentity(
    firstEnv(env, "MKT_RELEASE_ENGINE_CHANNEL", "RELEASE_ENGINE_CHANNEL"),
    "engine.channel",
    missing,
  );
  const engineVersion = safeIdentity(
    firstEnv(env, "MKT_RELEASE_ENGINE_VERSION", "RELEASE_ENGINE_VERSION"),
    "engine.version",
    missing,
  );
  const engineSha = safeSha(
    firstEnv(env, "MKT_RELEASE_ENGINE_SHA256", "RELEASE_ENGINE_SHA256"),
    "engine.sha256",
    missing,
  );
  const engine = engineKind && engineChannel && engineVersion && engineSha
    ? {
        kind: engineKind,
        channel: engineChannel,
        version: engineVersion,
        sha256: engineSha,
      }
    : null;

  const signing = signingStatus(firstEnv(env, "MKT_RELEASE_SIGNING_STATUS", "RELEASE_SIGNING_STATUS"));
  if (signing === "unknown") markMissing(missing, "signing.status");
  const signingExceptionExpiresAt =
    signing === "unsigned-internal-exception"
      ? futureIsoDate(
          firstEnv(
            env,
            "MKT_RELEASE_SIGNING_EXCEPTION_EXPIRES_AT",
            "RELEASE_SIGNING_EXCEPTION_EXPIRES_AT",
            "MKT_RELEASE_SIGNING_EXPIRES_AT",
            "RELEASE_SIGNING_EXPIRES_AT",
            "MKT_RELEASE_EXCEPTION_EXPIRES_AT",
            "RELEASE_EXCEPTION_EXPIRES_AT",
          ),
        )
      : null;
  if (signing === "unsigned-internal-exception" && !signingExceptionExpiresAt) {
    markMissing(missing, "signing.exceptionExpiresAt");
  }

  // Keep the publication decision explicit as well as driven by `missing`. A future refactor that
  // forgets to append a label must still be unable to turn a partial tuple into a 200 response.
  const complete = Boolean(
    candidateId &&
      sourceSha &&
      deploymentId &&
      relay &&
      browser &&
      engine &&
      signing !== "unknown" &&
      (signing !== "unsigned-internal-exception" || signingExceptionExpiresAt),
  );

  return {
    status: complete && missing.length === 0 ? "published" : "unpublished",
    candidateId,
    sourceSha,
    deploymentId,
    relay,
    browser,
    engine,
    signing,
    signingExceptionExpiresAt,
    missing,
  };
}
