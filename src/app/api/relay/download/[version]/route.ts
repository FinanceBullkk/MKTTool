import { guardedRoute } from "@/lib/auth/guarded-route";
import {
  openRelayArchive,
  readRelayRelease,
  relayDownloadFileName,
} from "@/lib/relay/relay-release-file";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function requestedVersion(value: string): number | null {
  const match = /^v(\d+)$/.exec(value);
  if (!match) return null;
  const version = Number(match[1]);
  return Number.isSafeInteger(version) && version > 0 ? version : null;
}

function requestedStart(range: string | null, sizeBytes: number): number | null {
  if (!range) return 0;
  const match = /^bytes=(\d+)-$/i.exec(range.trim());
  if (!match) return null;
  const start = Number(match[1]);
  return Number.isSafeInteger(start) && start >= 0 && start < sizeBytes ? start : null;
}

export const GET = guardedRoute(async function GET(
  _actor,
  request: Request,
  context: { params: Promise<{ version: string }> },
) {
  const version = requestedVersion((await context.params).version);
  if (version === null) return new Response("Invalid Relay version.", { status: 400 });

  const release = await readRelayRelease(version);
  if (!release.available) return new Response("Relay release not found.", { status: 404 });

  const start = requestedStart(request.headers.get("range"), release.sizeBytes);
  if (start === null) {
    return new Response(null, {
      status: 416,
      headers: { "content-range": `bytes */${release.sizeBytes}` },
    });
  }

  const partial = start > 0;
  const stream = await openRelayArchive(release, start);
  return new Response(stream, {
    status: partial ? 206 : 200,
    headers: {
      "accept-ranges": "bytes",
      "cache-control": "private, immutable, max-age=31536000",
      "content-disposition": `attachment; filename="${relayDownloadFileName(release.version)}"`,
      "content-length": String(release.sizeBytes - start),
      "content-type": "application/zip",
      ...(partial
        ? { "content-range": `bytes ${start}-${release.sizeBytes - 1}/${release.sizeBytes}` }
        : {}),
    },
  });
});
