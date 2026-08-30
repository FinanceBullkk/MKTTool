import { guardedRoute } from "@/lib/auth/guarded-route";
import { WINDOWS_INSTALLER_FILE_NAME } from "@/lib/setup/windows-installer-file";
import {
  openWindowsInstallerStream,
  readWindowsInstallerRelease,
} from "@/lib/setup/windows-installer-release";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export const GET = guardedRoute(async function GET() {
  const release = await readWindowsInstallerRelease();
  if (!release.available || !release.metadataComplete) {
    return Response.json(
      {
        ok: false,
        message: release.available
          ? "The combined Windows installer is present but its release metadata is incomplete."
          : "The combined Windows installer has not been published to this server.",
      },
      { status: release.available ? 503 : 404 },
    );
  }

  let opened: Awaited<ReturnType<typeof openWindowsInstallerStream>>;
  try {
    opened = await openWindowsInstallerStream(release);
  } catch {
    // A mutable object can change between HEAD and GET. Do not expose a partial or mismatched EXE;
    // return a generic retryable response rather than leaking storage details.
    return Response.json(
      { ok: false, message: "The installer changed or could not be verified. Try again later." },
      { status: 503 },
    );
  }

  return new Response(opened.stream, {
    headers: {
      "cache-control": "private, no-store",
      "content-disposition": `attachment; filename="${WINDOWS_INSTALLER_FILE_NAME}"`,
      "content-length": String(opened.sizeBytes),
      "content-type": "application/vnd.microsoft.portable-executable",
    },
  });
});
