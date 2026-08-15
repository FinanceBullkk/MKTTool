import { machineRoute } from "@/lib/auth/guarded-route";
import { compatibilityArtifactAuthorizationMatches } from "@/lib/release/compatibility-update-authorization";
import { readRelayCompatibilityArtifactSource } from "@/lib/relay/relay-compatibility-artifact-source";
import { readRelayCompatibilityRelease } from "@/lib/relay/relay-compatibility-manifest-file";
import {
  RELAY_COMPATIBILITY_ARTIFACT_KINDS,
  type RelayCompatibilityArtifactKind,
} from "@/lib/relay/relay-release-r2";
import { loadServerSigningKeys } from "@/lib/tickets/server-signing-key";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type ArtifactContext = { params: Promise<{ version: string; kind: string }> };

export const GET = machineRoute(isAuthorizedArtifactRequest, async (request, context: ArtifactContext) => {
  const { version: versionText, kind: kindText } = await context.params;
  const match = /^v(\d+)$/.exec(versionText);
  const version = match ? Number(match[1]) : 0;
  if (!Number.isSafeInteger(version) || version <= 0) {
    return new Response("Invalid compatibility artifact version.", { status: 400 });
  }
  if (!RELAY_COMPATIBILITY_ARTIFACT_KINDS.includes(kindText as RelayCompatibilityArtifactKind)) {
    return new Response("Invalid compatibility artifact kind.", { status: 400 });
  }
  const requestPath = new URL(request.url).pathname;

  try {
    const kind = kindText as RelayCompatibilityArtifactKind;
    const release = await readRelayCompatibilityRelease(version);
    const artifact = artifactForKind(release.manifest.manifest.artifacts, kind);
    if (new URL(artifact.url).pathname !== requestPath) {
      return new Response("The signed manifest does not authorize this artifact path.", {
        status: 404,
      });
    }
    const source = await readRelayCompatibilityArtifactSource(version, kind, artifact);
    return new Response(await source.open(), {
      headers: {
        "cache-control": "private, immutable, max-age=31536000",
        "content-disposition": `attachment; filename="MKTTool-Compatibility-v${version}-${kind}.artifact"`,
        "content-length": String(source.sizeBytes),
        "content-type": "application/octet-stream",
        "x-content-type-options": "nosniff",
      },
    });
  } catch {
    return new Response("Compatibility artifact not found or does not match its signed manifest.", {
      status: 404,
    });
  }
});

function isAuthorizedArtifactRequest(request: Request): boolean {
  return compatibilityArtifactAuthorizationMatches(request.headers.get("authorization"), {
    serverPublicKeyHex: loadServerSigningKeys().publicKeyHex,
    requestPath: new URL(request.url).pathname,
  });
}

function artifactForKind(
  artifacts: Awaited<ReturnType<typeof readRelayCompatibilityRelease>>["manifest"]["manifest"]["artifacts"],
  kind: RelayCompatibilityArtifactKind,
) {
  if (kind === "control-contract") return artifacts.controlContract;
  return artifacts[kind];
}
