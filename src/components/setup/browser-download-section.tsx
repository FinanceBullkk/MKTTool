import { Download, MonitorCheck, Network, ShieldAlert } from "lucide-react";
import { Card, Disclosure, EmptyState } from "@/components/ui/page-section";
import { formatFullDateTime } from "@/lib/format/vietnamese-date-format";
import { formatFileSize } from "@/lib/relay/relay-release-file";
import { WINDOWS_INSTALLER_FILE_NAME } from "@/lib/setup/windows-installer-file";
import { readWindowsInstallerRelease } from "@/lib/setup/windows-installer-release";

const BUTTON_CLASS =
  "brand-btn inline-flex min-h-11 items-center justify-center rounded-xl px-4 text-sm font-semibold";

export async function BrowserDownloadSection() {
  const release = await readWindowsInstallerRelease();
  const downloadable = release.available && release.metadataComplete;

  return (
    <section id="download" className="scroll-mt-6">
      <Card
        title={downloadable && release.version ? `MKT Browser ${release.version} for Windows` : "MKT Browser for Windows"}
        description="Install the profile manager and its bundled Relay in one guided Windows setup."
        icon={Download}
      >
        {downloadable ? (
          <div className="space-y-5">
            <div className="grid gap-5 lg:grid-cols-[minmax(0,1fr)_18rem]">
              <div>
                <a href="/api/setup/windows-installer" className={BUTTON_CLASS} download>
                  Download MKT Browser
                </a>
                <div className="mt-5 grid gap-2 sm:grid-cols-2">
                  <Boundary icon={MonitorCheck} text="Windows x64, one Windows user per PC" />
                  <Boundary icon={Network} text="Browser profiles stay on this PC" />
                </div>
              </div>

              <dl className="space-y-3 rounded-xl border border-white/[0.08] bg-black/10 p-4 text-sm">
                <div>
                  <dt className="text-xs text-neutral-500">File</dt>
                  <dd className="mt-0.5 break-all font-mono text-xs text-neutral-300">
                    {WINDOWS_INSTALLER_FILE_NAME}
                  </dd>
                </div>
                <div>
                  <dt className="text-xs text-neutral-500">Size</dt>
                  <dd className="mt-0.5 text-neutral-300">{formatFileSize(release.sizeBytes!)}</dd>
                </div>
                <div>
                  <dt className="text-xs text-neutral-500">Bundled Relay</dt>
                  <dd className="mt-0.5 text-neutral-300">v{release.bundledRelayVersion}</dd>
                </div>
                {release.publishedAt ? (
                  <div>
                    <dt className="text-xs text-neutral-500">Published</dt>
                    <dd className="mt-0.5 text-neutral-300">
                      {formatFullDateTime(release.publishedAt)}
                    </dd>
                  </div>
                ) : null}
              </dl>
            </div>

            <div className="flex gap-3 rounded-xl border border-amber-400/20 bg-amber-400/[0.06] p-4">
              <ShieldAlert size={18} className="mt-0.5 shrink-0 text-amber-300" />
              <p className="text-xs leading-5 text-neutral-300">
                MKT Browser manages local profiles and proxy binding. It does not promise a unique
                fingerprint, identity isolation, or real-account safety. Windows may show the
                approved internal unsigned-publisher warning during installation.
              </p>
            </div>

            {release.checksum ? (
              <Disclosure summary="Technical details and checksum">
                <p className="text-xs font-medium text-neutral-400">Installer SHA-256</p>
                <code className="mt-2 block select-all break-all rounded-lg bg-black/20 px-3 py-2 font-mono text-xs text-neutral-300">
                  {release.checksum}
                </code>
              </Disclosure>
            ) : null}
          </div>
        ) : (
          <EmptyState title="Installer temporarily unavailable" icon={Download}>
            The exact approved Windows installer is not available from this server. An
            administrator must complete release approval before onboarding continues.
          </EmptyState>
        )}
      </Card>
    </section>
  );
}

function Boundary({ icon: Icon, text }: { icon: typeof MonitorCheck; text: string }) {
  return (
    <div className="flex items-center gap-3 rounded-xl border border-white/[0.08] bg-black/10 p-3 text-xs text-neutral-300">
      <Icon size={16} className="shrink-0 text-neutral-400" aria-hidden="true" />
      <span>{text}</span>
    </div>
  );
}
