import { Archive, Check, Download, RotateCw } from "lucide-react";
import { Card, Disclosure, EmptyState } from "@/components/ui/page-section";
import { formatFullDateTime } from "@/lib/format/vietnamese-date-format";
import { RELAY_VERSION } from "@/lib/relay/relay-endpoints";
import {
  formatFileSize,
  readRelayRelease,
  relayArchiveChecksum,
  relayDownloadFileName,
} from "@/lib/relay/relay-release-file";

const BUTTON_CLASS =
  "brand-btn inline-flex min-h-11 items-center justify-center rounded-xl px-4 text-sm font-semibold";

/**
 * The authenticated Relay release stays on `/setup` so operators can download and enroll a PC in
 * one uninterrupted journey. Browser distribution is deliberately not part of this component.
 */
export async function RelayDownloadSection() {
  const release = await readRelayRelease(RELAY_VERSION);
  const checksum = await relayArchiveChecksum(release);

  return (
    <section id="download" className="scroll-mt-6">
      <Card
        title={release.available ? `Relay v${release.version} for Windows` : "Relay for Windows"}
        description="Install or update Relay on the Windows PC you are setting up."
        icon={Download}
      >
        {release.available ? (
          <div className="grid gap-5 lg:grid-cols-[minmax(0,1fr)_18rem]">
            <div>
              <a href="/api/relay/download" className={BUTTON_CLASS} download>
                Download Relay for Windows
              </a>

              <ol className="mt-5 grid gap-2 sm:grid-cols-3">
                <InstallStep icon={Archive} number="01" label="Extract the archive" />
                <InstallStep icon={RotateCw} number="02" label="Run setup.bat" />
                <InstallStep icon={Check} number="03" label="Return and register" />
              </ol>
            </div>

            <div className="rounded-xl border border-white/[0.08] bg-black/10 p-4">
              <p className="text-xs font-semibold uppercase tracking-wide text-neutral-500">
                Package
              </p>
              <dl className="mt-3 space-y-3 text-sm">
                <div>
                  <dt className="text-xs text-neutral-500">File</dt>
                  <dd className="mt-0.5 break-all font-mono text-xs text-neutral-300">
                    {relayDownloadFileName(release.version)}
                  </dd>
                </div>
                <div>
                  <dt className="text-xs text-neutral-500">Size</dt>
                  <dd className="mt-0.5 text-neutral-300">{formatFileSize(release.sizeBytes)}</dd>
                </div>
                <div>
                  <dt className="text-xs text-neutral-500">Built</dt>
                  <dd className="mt-0.5 text-neutral-300">
                    {formatFullDateTime(release.builtAt)}
                  </dd>
                </div>
              </dl>
            </div>

            {checksum ? (
              <Disclosure summary="Technical details and checksum" className="lg:col-span-2">
                <div className="space-y-2">
                  <p className="text-xs font-medium text-neutral-400">Relay archive SHA-256</p>
                  <code className="block select-all break-all rounded-lg bg-black/20 px-3 py-2 font-mono text-xs text-neutral-300">
                    {checksum}
                  </code>
                  <p className="text-xs leading-5 text-neutral-500">
                    After downloading, run{" "}
                    <code className="font-mono">
                      Get-FileHash {relayDownloadFileName(release.version)} -Algorithm SHA256
                    </code>
                    . The value must match before installation.
                  </p>
                </div>
              </Disclosure>
            ) : null}
          </div>
        ) : (
          <EmptyState title="Relay package unavailable" icon={Download}>
            No Relay package is available from this server. An administrator must build it on
            Windows with <code className="font-mono">npm run relay:build</code>, then publish it with
            <code className="font-mono"> npm run relay:publish</code>.
          </EmptyState>
        )}
      </Card>
    </section>
  );
}

function InstallStep({ icon: Icon, number, label }: { icon: typeof Archive; number: string; label: string }) {
  return (
    <li className="flex items-center gap-3 rounded-xl border border-white/[0.08] bg-black/10 p-3">
      <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-white/[0.045] text-neutral-400">
        <Icon size={15} aria-hidden="true" />
      </span>
      <span>
        <span className="block font-mono text-[9px] font-semibold tracking-[0.12em] text-neutral-600">{number}</span>
        <span className="block text-xs font-medium text-neutral-300">{label}</span>
      </span>
    </li>
  );
}
