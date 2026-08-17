import { machineOrGuardedRoute } from "@/lib/auth/guarded-route";
import { readRelayCompatibilityManifest } from "@/lib/relay/relay-compatibility-manifest-file";
import { releaseDownloadTokenMatches } from "@/lib/relay/release-download-token";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type VersionContext = { params: Promise<{ version: string }> };

async function serveManifest(_request: Request, context: VersionContext): Promise<Response> {
  const match = /^v(\d+)$/.exec((await context.params).version);
  const version = match ? Number(match[1]) : 0;
  if (!Number.isSafeInteger(version) || version <= 0) {
    return new Response("Invalid Relay version.", { status: 400 });
  }
  try {
    const manifest = await readRelayCompatibilityManifest(version);
    return Response.json(manifest, {
      headers: { "cache-control": "private, immutable, max-age=31536000" },
    });
  } catch (error) {
    return new Response((error as Error).message, { status: 404 });
  }
}

export const GET = machineOrGuardedRoute(
  (request) => releaseDownloadTokenMatches(request.headers.get("authorization")),
  serveManifest,
);
