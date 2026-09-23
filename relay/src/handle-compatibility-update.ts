import type { IncomingMessage } from "node:http";
import type { AntidetectAdapter } from "../../src/lib/antidetect/antidetect-browser-adapter";
import type { CompatibilityUpdateRequest } from "../../src/lib/relay/relay-endpoints";
import { managedCompatibilityArtifactPaths } from "../../src/lib/release/compatibility-artifact-paths";
import {
  encodeCompatibilityArtifactAuthorization,
  verifyCompatibilityUpdateAuthorization,
} from "../../src/lib/release/compatibility-update-authorization";
import {
  validateCompatibilityManifest,
} from "../../src/lib/release/compatibility-manifest";
import type { ReleaseRootTrust } from "../../src/lib/release/release-root-trust";
import { TICKET_KINDS } from "../../src/lib/tickets/ticket-types";
import {
  TicketRejected,
  verifyTicket,
  type RelayIdentity,
} from "../../src/lib/tickets/ticket-verifier";
import { COMPATIBILITY_INSTALLER_FLOOR_SEQUENCE } from "./compatibility-installer-floor";
import { ensureCompatibilitySmokeProfile } from "./compatibility-smoke-profile";
import {
  prepareCompatibilityUpdate,
  type CompatibilityUpdatePlatform,
} from "./local-updater";
import type { RelayResponseBody } from "./relay-http-server";
import { RELAY_SECRET_NAMES, type SecureStore } from "./secure-store";
import { TicketPayloadError, reviewTicketPayload } from "./ticket-payload-schema";
import {
  initializeCompatibilityUpdateState,
  readCompatibilityUpdateState,
} from "./update-state";
import { CompatibilityArtifactDownloadError } from "./compatibility-artifact-staging";

const COMPATIBILITY_UPDATE_FAILURE_MESSAGE =
  "Compatibility update could not be prepared. Check Relay status and request a new signed update authorization.";

class CompatibilityUpdateRejected extends Error {
  constructor(readonly code: string, message: string) {
    super(message);
    this.name = "CompatibilityUpdateRejected";
  }
}

export async function handleCompatibilityUpdate(
  request: IncomingMessage,
  body: string,
  dependencies: {
    allowedOrigin: string | null;
    home: string;
    store: SecureStore;
    identity: RelayIdentity | null;
    antidetect: {
      getAdapter(): Pick<AntidetectAdapter, "listProfiles" | "fingerprintOptions" | "createProfile">;
    };
    createPlatform(): CompatibilityUpdatePlatform;
    serverPublicKeyHex: string | null;
    deviceId: string | null;
    installerFloorSequence?: number;
    rootTrust?: ReleaseRootTrust;
    now?: Date;
    onPrepared(): void;
  },
): Promise<RelayResponseBody> {
  if (!dependencies.allowedOrigin || request.headers.origin !== dependencies.allowedOrigin) {
    return { ok: false, message: "Only the configured MKTTool web origin may update this Relay." };
  }
  if (!dependencies.identity || !dependencies.serverPublicKeyHex || !dependencies.deviceId) {
    return { ok: false, message: "This Relay is not fully configured for signed compatibility updates." };
  }

  try {
    const ticket = readTicket(body);
    const verifiedTicket = verifyTicket(
      ticket,
      dependencies.identity,
      dependencies.now?.getTime(),
    );
    if (verifiedTicket.envelope.kind !== TICKET_KINDS.COMPATIBILITY_UPDATE) {
      throw new Error("This endpoint accepts only compatibility update tickets.");
    }
    const payload = reviewTicketPayload(verifiedTicket.envelope.kind, verifiedTicket.payload);
    if (payload.kind !== TICKET_KINDS.COMPATIBILITY_UPDATE) {
      throw new Error("The compatibility update ticket payload has the wrong kind.");
    }

    const existingState = readCompatibilityUpdateState(dependencies.store);
    const validationState =
      existingState ??
      initializeCompatibilityUpdateState({
        installerFloorSequence:
          dependencies.installerFloorSequence ?? COMPATIBILITY_INSTALLER_FLOOR_SEQUENCE,
        localIdentityDataExists: false,
      });
    const verifiedManifest = validateCompatibilityManifest(payload.manifest, {
      state: {
        highestAcceptedSequence: validationState.highestAcceptedSequence,
        currentSequence: validationState.current?.sequence ?? null,
        installerFloorSequence: validationState.rollbackFloorSequence,
      },
      revocations: payload.revocations,
      knownRevokedDelegatedKeyIds: validationState.revokedDelegatedKeyIds,
      rootTrust: dependencies.rootTrust,
      now: dependencies.now,
    });
    const authorization = verifyCompatibilityUpdateAuthorization(payload.authorization, {
      serverPublicKeyHex: dependencies.serverPublicKeyHex,
      deviceId: dependencies.deviceId,
      sequence: verifiedManifest.manifest.sequence,
      manifestDigest: verifiedManifest.manifestDigest,
      manifestArtifactUrls: Object.values(verifiedManifest.manifest.artifacts).map(
        (artifact) => artifact.url,
      ),
      now: dependencies.now,
    });
    const authenticatedPaths = requireServerArtifactAuthorization(
      verifiedManifest.manifest.artifacts,
      authorization.authenticatedArtifactPaths,
      dependencies.allowedOrigin,
    );

    let repairInitialized = false;
      if (!existingState) {
        if (!authorization.repairMissingState || authorization.authorizedRole !== "ADMIN") {
          throw new CompatibilityUpdateRejected(
            "COMPATIBILITY_UPDATE_REPAIR_REQUIRED",
            "Missing compatibility state requires an ADMIN repair authorization.",
          );
      }
      const serialized = JSON.stringify(validationState);
      dependencies.store.writeIfAbsent(RELAY_SECRET_NAMES.compatibilityUpdateState, serialized);
      if (dependencies.store.read(RELAY_SECRET_NAMES.compatibilityUpdateState) !== serialized) {
        throw new Error("Protected compatibility update state could not be initialized for repair.");
      }
      repairInitialized = true;
    }

    const platform = dependencies.createPlatform();
    if (await platform.hasOpenProfiles()) {
      throw new Error("Close every MKT Browser profile before starting the compatibility update.");
    }
    const smokeProfileId = await ensureCompatibilitySmokeProfile({
      state: readCompatibilityUpdateState(dependencies.store)!,
      payload: payload.smokeProfile,
      authorization,
      adapter: dependencies.antidetect.getAdapter(),
    });
    const artifactAuthorization = encodeCompatibilityArtifactAuthorization(authorization);
    const serverOrigin = new URL(dependencies.allowedOrigin).origin;
    await prepareCompatibilityUpdate(
      payload.manifest,
      {
        revocations: payload.revocations,
        rootTrust: dependencies.rootTrust,
        now: dependencies.now,
      },
      {
        home: dependencies.home,
        store: dependencies.store,
        platform,
        testProfileId: smokeProfileId,
        downloadHeadersForUrl: (url) => {
          const parsed = new URL(url);
          if (parsed.origin === serverOrigin && authenticatedPaths.has(parsed.pathname)) {
            return new Headers({ authorization: artifactAuthorization });
          }
          return new Headers();
        },
      },
    );
    dependencies.onPrepared();
    return {
      ok: true,
      message: "Compatibility update is staged. Relay and MKT Browser will restart now.",
      updateStarted: true,
      targetSequence: verifiedManifest.manifest.sequence,
      repairInitialized,
    };
  } catch (error) {
    if (error instanceof TicketRejected) {
      return { ok: false, message: error.message, rejectionCode: error.code };
    }
    if (error instanceof CompatibilityArtifactDownloadError) {
      return { ok: false, message: error.message, code: error.code };
    }
    if (error instanceof CompatibilityUpdateRejected) {
      return { ok: false, message: error.message, code: error.code };
    }
    return {
      ok: false,
      message: COMPATIBILITY_UPDATE_FAILURE_MESSAGE,
      code: "COMPATIBILITY_UPDATE_FAILED",
    };
  }
}

function readTicket(body: string): string {
  let parsed: Partial<CompatibilityUpdateRequest>;
  try {
    parsed = JSON.parse(body) as Partial<CompatibilityUpdateRequest>;
  } catch {
    throw new TicketPayloadError("Compatibility update request body is not valid JSON.");
  }
  if (typeof parsed.ticket !== "string" || parsed.ticket.length === 0) {
    throw new TicketPayloadError('Compatibility update request field "ticket" is missing.');
  }
  return parsed.ticket;
}

function requireServerArtifactAuthorization(
  artifacts: ReturnType<typeof validateCompatibilityManifest>["manifest"]["artifacts"],
  authorizedPaths: string[],
  allowedOrigin: string,
): Set<string> {
  const required = managedCompatibilityArtifactPaths(artifacts, allowedOrigin);
  const requiredSet = new Set(required);
  const authorizedSet = new Set(authorizedPaths);
  if (
    requiredSet.size !== required.length ||
    authorizedSet.size !== authorizedPaths.length ||
    requiredSet.size !== authorizedSet.size ||
    required.some((path) => !authorizedSet.has(path))
  ) {
    throw new Error("The compatibility artifact authorization does not cover the exact managed artifact set.");
  }
  return requiredSet;
}
