import { Archive, ChevronDown, Settings2 } from "lucide-react";
import { RelayDeviceIdCell } from "@/components/relay/relay-device-id-cell";
import type { RelayDeviceListItem } from "@/components/relay/relay-device-list-types";
import { RelayDeviceRetirementButton } from "@/components/relay/relay-device-retirement-button";
import { RelayDeviceRetirementReceiptButton } from "@/components/relay/relay-device-retirement-receipt-button";
import { RelayDeviceVersionCell } from "@/components/relay/relay-device-version-cell";
import { InlineDisclosure } from "@/components/ui/inline-disclosure";
import { StatusBadge } from "@/components/ui/page-section";
import { formatFullDateTime } from "@/lib/format/vietnamese-date-format";

export function RelayRevokedDeviceList({
  devices,
  isAdmin,
  viewerUserId,
  minimumRelayVersion,
}: {
  devices: RelayDeviceListItem[];
  isAdmin: boolean;
  viewerUserId?: string;
  minimumRelayVersion: number;
}) {
  if (devices.length === 0) return null;

  const canFinishCleanup = (device: RelayDeviceListItem) =>
    Boolean(device.revokedAt) && (isAdmin || (Boolean(viewerUserId) && device.userId === viewerUserId));

  return (
    <details className="group app-surface mb-5 rounded-2xl bg-white/[0.012]">
      <summary className="flex min-h-16 cursor-pointer list-none items-center gap-3 px-4 py-3.5 marker:content-none sm:px-5">
        <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-white/[0.035] text-neutral-500">
          <Archive size={16} strokeWidth={1.8} aria-hidden="true" />
        </span>
        <span className="min-w-0 flex-1">
          <span className="block text-base font-semibold text-neutral-300">
            Revoked Relay PCs <span className="font-mono text-sm text-neutral-600">{devices.length}</span>
          </span>
          <span className="mt-0.5 block text-sm text-neutral-600">
            Audit history and unfinished local cleanup
          </span>
        </span>
        <ChevronDown
          size={17}
          className="shrink-0 text-neutral-600 transition-transform group-open:rotate-180"
          aria-hidden="true"
        />
      </summary>

      <div className="divide-y divide-white/[0.06] border-t border-white/[0.07] px-4 sm:px-5">
        {devices.map((device) => (
          <article key={device.id} className="py-4 text-neutral-500">
            <div className="grid gap-4 md:grid-cols-[minmax(0,1fr)_minmax(12rem,0.75fr)] md:items-start">
              <div className="min-w-0">
                <h3 className="text-base font-medium text-neutral-300">{device.name}</h3>
                <p className="mt-1 truncate text-sm text-neutral-500">{device.user.email}</p>
                <p className="mt-1 text-xs text-neutral-600">
                  Revoked {device.revokedAt ? formatFullDateTime(device.revokedAt) : "date unavailable"}
                </p>
              </div>

              <div className="md:text-right">
                {device.retirementCompletedAt ? (
                  <>
                    <StatusBadge
                      label="Local cleanup confirmed"
                      className="bg-emerald-950/60 text-emerald-500"
                    />
                    {canFinishCleanup(device) && device.retirementId ? (
                      <div className="mt-2 md:flex md:justify-end">
                        <RelayDeviceRetirementReceiptButton
                          deviceId={device.id}
                          deviceName={device.name}
                          devicePublicKey={device.publicKey}
                          retirementId={device.retirementId}
                        />
                      </div>
                    ) : null}
                  </>
                ) : (
                  <>
                    <StatusBadge label="Local cleanup pending" className="bg-red-950/60 text-red-300" />
                    {canFinishCleanup(device) ? (
                      <div className="mt-2 md:flex md:justify-end">
                        <RelayDeviceRetirementButton
                          deviceId={device.id}
                          deviceName={device.name}
                          devicePublicKey={device.publicKey}
                          mode="cleanup"
                        />
                      </div>
                    ) : null}
                  </>
                )}
              </div>
            </div>

            <InlineDisclosure summary="Technical record" icon={Settings2} className="mt-2">
              <div className="grid gap-5 lg:grid-cols-2">
                <dl className="space-y-4">
                  <div>
                    <dt className="text-xs font-medium text-neutral-600">Relay PC ID</dt>
                    <dd className="mt-1.5"><RelayDeviceIdCell deviceId={device.id} /></dd>
                  </div>
                  <div>
                    <dt className="text-xs font-medium text-neutral-600">Public key</dt>
                    <dd className="mt-1.5 break-all font-mono text-xs leading-5 text-neutral-600">
                      {device.publicKey}
                    </dd>
                  </div>
                </dl>
                <div className="space-y-4">
                  <div>
                    <p className="mb-2 text-xs font-medium text-neutral-600">Last reported runtime</p>
                    <RelayDeviceVersionCell device={device} floor={minimumRelayVersion} />
                  </div>
                </div>
              </div>
            </InlineDisclosure>
          </article>
        ))}
      </div>
    </details>
  );
}
