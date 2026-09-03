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
  "inline-block rounded-md bg-neutral-900 px-4 py-2 text-sm font-medium text-white transition " +
  "hover:bg-neutral-700 dark:bg-neutral-100 dark:text-neutral-900 dark:hover:bg-neutral-300";

/**
 * The authenticated Relay release stays on `/setup` so operators can download and enroll a PC in
 * one uninterrupted journey. Browser distribution is deliberately not part of this component.
 */
export async function RelayDownloadSection() {
  const release = await readRelayRelease(RELAY_VERSION);
  const checksum = await relayArchiveChecksum(release);

  return (
    <section id="download" className="space-y-6 scroll-mt-6">
      <Card title={release.available ? `Relay v${release.version} for Windows` : "Relay for Windows"}>
        {release.available ? (
          <div className="space-y-4">
            <p className="text-sm text-neutral-600 dark:text-neutral-400">
              Download Relay directly on the operator PC. This package is independent of MKT
              Browser and contains everything needed to install or update the Relay service.
            </p>

            <dl className="grid gap-x-8 gap-y-2 text-sm sm:grid-cols-[auto_1fr]">
              <dt className="text-neutral-500">File</dt>
              <dd>{relayDownloadFileName(release.version)}</dd>
              <dt className="text-neutral-500">Size</dt>
              <dd>{formatFileSize(release.sizeBytes)}</dd>
              <dt className="text-neutral-500">Built</dt>
              <dd>{formatFullDateTime(release.builtAt)}</dd>
            </dl>

            <a href="/api/relay/download" className={BUTTON_CLASS} download>
              Download {relayDownloadFileName(release.version)}
            </a>

            {checksum ? (
              <div className="space-y-1 border-t border-neutral-200 pt-4 dark:border-neutral-800">
                <p className="text-xs font-medium text-neutral-600 dark:text-neutral-400">
                  Relay archive SHA-256
                </p>
                <code className="block select-all break-all rounded bg-neutral-100 px-2 py-1 font-mono text-xs dark:bg-neutral-800">
                  {checksum}
                </code>
                <p className="pt-1 text-xs text-neutral-500">
                  After downloading, run <code className="font-mono">Get-FileHash {relayDownloadFileName(release.version)} -Algorithm SHA256</code>.
                  The value must match before installation.
                </p>
              </div>
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

      <Card title="Install Relay, then return here">
        <ol className="list-decimal space-y-2 pl-5 text-sm text-neutral-600 dark:text-neutral-400">
          <li>
            Extract <code className="font-mono">MKTTool-Relay.exe</code>,
            <code className="font-mono"> setup.bat</code>, and
            <code className="font-mono"> install-relay.ps1</code> into the same folder.
          </li>
          <li>
            Run <code className="font-mono">setup.bat</code>. The installer preserves the existing
            Relay configuration when updating.
          </li>
          <li>Return to this page and continue to Step 2 to register this Relay PC.</li>
        </ol>
      </Card>
    </section>
  );
}
