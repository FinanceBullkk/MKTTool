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
  if (!release.available) {
    return Response.json(
      { ok: false, message: "The combined Windows installer has not been published to this server." },
      { status: 404 },
    );
  }

  const opened = await openWindowsInstallerStream(release);

  return new Response(opened.stream, {
    headers: {
      "cache-control": "private, no-store",
      "content-disposition": `attachment; filename="${WINDOWS_INSTALLER_FILE_NAME}"`,
      "content-length": String(opened.sizeBytes),
      "content-type": "application/vnd.microsoft.portable-executable",
    },
  });
});
