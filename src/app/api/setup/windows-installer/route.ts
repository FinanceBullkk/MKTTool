import { guardedRoute } from "@/lib/auth/guarded-route";
import { Readable } from "node:stream";
import {
  openWindowsInstaller,
  readWindowsInstallerFile,
  WINDOWS_INSTALLER_FILE_NAME,
} from "@/lib/setup/windows-installer-file";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export const GET = guardedRoute(async function GET() {
  const installer = readWindowsInstallerFile();
  if (!installer.available) {
    return Response.json(
      { ok: false, message: "The combined Windows installer has not been published to this server." },
      { status: 404 },
    );
  }

  const opened = await openWindowsInstaller(installer);

  return new Response(Readable.toWeb(opened.stream) as ReadableStream, {
    headers: {
      "cache-control": "private, no-store",
      "content-disposition": `attachment; filename="${WINDOWS_INSTALLER_FILE_NAME}"`,
      "content-length": String(opened.sizeBytes),
      "content-type": "application/vnd.microsoft.portable-executable",
    },
  });
});
