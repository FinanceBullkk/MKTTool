import { Card, EmptyState } from "@/components/ui/page-section";
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
      <Card title={release.available ? `Relay v${release.version} for Windows` : "Relay for Windows"}>
        {release.available ? (
          <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_18rem]">
            <div>
              <p className="max-w-2xl text-sm leading-6 text-neutral-400">
                Download this package on the Windows PC you are setting up. It installs or updates
                Relay without changing the separate MKT Browser rollout.
              </p>

              <a href="/api/relay/download" className={`${BUTTON_CLASS} mt-5`} download>
                Download Relay for Windows
              </a>

              <ol className="mt-6 list-decimal space-y-2 pl-5 text-sm leading-6 text-neutral-400">
                <li>Extract all files from the downloaded archive into one folder.</li>
                <li>
                  Run <code className="font-mono text-neutral-300">setup.bat</code>. Existing Relay
                  configuration is preserved during an update.
                </li>
                <li>Return here and continue to register this Relay PC.</li>
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
              <details className="lg:col-span-2 rounded-xl border border-white/[0.08] bg-white/[0.02]">
                <summary className="flex min-h-11 cursor-pointer list-none items-center justify-between px-4 text-sm font-medium text-neutral-300 marker:content-none">
                  Technical details and checksum
                  <span className="text-neutral-500">+</span>
                </summary>
                <div className="space-y-2 border-t border-white/[0.08] p-4">
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
              </details>
            ) : null}
          </div>
        ) : (
          <EmptyState>
            No Relay package is available from this server. An administrator must build it on
            Windows with <code className="font-mono">npm run relay:build</code>, then publish it with
            <code className="font-mono"> npm run relay:publish</code>.
          </EmptyState>
        )}
      </Card>
    </section>
  );
}
