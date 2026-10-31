import { MonitorCheck, Settings2 } from "lucide-react";
import { RelayDeviceIdCell } from "@/components/relay/relay-device-id-cell";
import type { RelayDeviceListItem } from "@/components/relay/relay-device-list-types";
import { RelayDeviceRetirementButton } from "@/components/relay/relay-device-retirement-button";
import { RelayDeviceRevokeButton } from "@/components/relay/relay-device-revoke-button";
import { RelayDeviceVersionCell } from "@/components/relay/relay-device-version-cell";
import { RelayGrantKeyButton } from "@/components/relay/relay-grant-key-button";
import { Card, EmptyState, StatusBadge } from "@/components/ui/page-section";
import { InlineDisclosure } from "@/components/ui/inline-disclosure";
import { formatFullDateTime } from "@/lib/format/vietnamese-date-format";
import { revokeRelayDevice } from "@/lib/tickets/relay-device-actions";

function keyStatus(device: RelayDeviceListItem) {
  if (device.operatorKeyReadyAt) {
    return {
      label: "Ready",
      className: "bg-emerald-950 text-emerald-400",
      detail: `Reported ${formatFullDateTime(device.operatorKeyReadyAt)}`,
    };
  }
  if (device.operatorKeyGrant) {
    return {
      label: "Grant sent",
      className: "bg-sky-950 text-sky-400",
      detail: "Waiting for this PC to receive it",
    };
  }
  return {
    label: "Action required",
    className: "bg-amber-950 text-amber-400",
    detail: "Operator key has not been granted",
  };
}

export function RelayActiveDeviceList({
  devices,
  isAdmin,
  canStillSignIn,
  securityMinimumRelayVersion,
  profileOperationMinimumRelayVersion,
}: {
  devices: RelayDeviceListItem[];
  isAdmin: boolean;
  canStillSignIn: (email: string) => boolean;
  securityMinimumRelayVersion: number;
  profileOperationMinimumRelayVersion: number;
}) {
  return (
    <Card
      title="Active Relay PCs"
      description="Name, owner, and current readiness are the daily signals. Maintenance stays folded away."
      icon={MonitorCheck}
    >
      {devices.length === 0 ? (
        <EmptyState title="No active Relay PC" icon={MonitorCheck}>
          Install Relay on the PC you will use, then register it from Setup on that same PC.
        </EmptyState>
      ) : (
        <div className="divide-y divide-white/[0.075]">
          {devices.map((device) => {
            const key = keyStatus(device);
            const needsKey = !device.operatorKeyGrant && !device.operatorKeyReadyAt;

            return (
              <article key={device.id} className="py-5 first:pt-0 last:pb-0">
                <div className="grid gap-5 md:grid-cols-2 2xl:grid-cols-[minmax(14rem,0.9fr)_minmax(25rem,1.5fr)_auto] 2xl:items-start">
                  <div className="min-w-0">
                    <div className="flex items-center gap-2.5">
                      <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-white/[0.045] text-neutral-300">
                        <MonitorCheck size={17} strokeWidth={1.8} aria-hidden="true" />
                      </span>
                      <div className="min-w-0">
                        <h3 className="truncate text-base font-semibold text-white">{device.name}</h3>
                        <p className="mt-0.5 truncate text-sm text-neutral-400">{device.user.email}</p>
                      </div>
                    </div>
                    <p className="mt-3 text-sm text-neutral-400">
                      {device._count.accounts === 0
                        ? "No nicks assigned"
                        : `${device._count.accounts} ${device._count.accounts === 1 ? "nick" : "nicks"} assigned`}
                    </p>
                    {!canStillSignIn(device.user.email) ? (
                      <p className="mt-2 max-w-sm text-sm leading-5 text-amber-300">
                        Owner sign-in is disabled; this PC cannot request new tickets.
                      </p>
                    ) : null}
                  </div>

                  <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
                    <div>
                      <p className="mb-2 text-xs font-medium text-neutral-400">Relay security floor</p>
                      <RelayDeviceVersionCell device={device} floor={securityMinimumRelayVersion} />
                    </div>
                    <div>
                      <p className="mb-2 text-xs font-medium text-neutral-400">Profile-operation floor</p>
                      <RelayDeviceVersionCell device={device} floor={profileOperationMinimumRelayVersion} />
                    </div>
                    <div>
                      <p className="mb-2 text-xs font-medium text-neutral-400">Operator key</p>
                      <StatusBadge label={key.label} className={key.className} />
                      <p className="mt-1.5 text-sm leading-5 text-neutral-400">{key.detail}</p>
                    </div>
                  </div>

                  {isAdmin && needsKey ? (
                    <div className="md:col-span-2 2xl:col-span-1 2xl:text-right">
                      <RelayGrantKeyButton
                        deviceId={device.id}
                        devicePublicKey={device.publicKey}
                        deviceName={device.name}
                        alreadyReady={false}
                      />
                    </div>
                  ) : null}
                </div>

                <InlineDisclosure
                  summary={isAdmin ? "Technical details and controls" : "Technical details"}
                  icon={Settings2}
                  className="mt-3"
                >
                  <div className={`grid gap-6 ${isAdmin ? "lg:grid-cols-[minmax(0,1.15fr)_minmax(17rem,0.85fr)]" : ""}`}>
                    <dl className="grid gap-x-6 gap-y-4 sm:grid-cols-2">
                      <div>
                        <dt className="text-xs font-medium text-neutral-600">Relay PC ID</dt>
                        <dd className="mt-1.5"><RelayDeviceIdCell deviceId={device.id} /></dd>
                      </div>
                      <div>
                        <dt className="text-xs font-medium text-neutral-600">Registered</dt>
                        <dd className="mt-1.5 text-sm text-neutral-300">
                          {formatFullDateTime(device.createdAt)}
                        </dd>
                      </div>
                      <div className="sm:col-span-2">
                        <dt className="text-xs font-medium text-neutral-600">Public key</dt>
                        <dd className="mt-1.5 break-all font-mono text-xs leading-5 text-neutral-500">
                          {device.publicKey}
                        </dd>
                      </div>
                    </dl>

                    {isAdmin ? (
                      <div className="space-y-3 border-t border-white/[0.07] pt-5 lg:border-l lg:border-t-0 lg:pl-6 lg:pt-0">
                        <p className="text-xs font-medium text-neutral-500">Maintenance</p>
                        {device.operatorKeyReadyAt || device.operatorKeyGrant ? (
                          <RelayGrantKeyButton
                            deviceId={device.id}
                            devicePublicKey={device.publicKey}
                            deviceName={device.name}
                            alreadyReady={Boolean(device.operatorKeyReadyAt)}
                          />
                        ) : null}
                        <RelayDeviceRevokeButton
                          action={revokeRelayDevice.bind(null, device.id)}
                          deviceName={device.name}
                        />
                        <RelayDeviceRetirementButton
                          deviceId={device.id}
                          deviceName={device.name}
                          devicePublicKey={device.publicKey}
                        />
                      </div>
                    ) : null}
                  </div>
                </InlineDisclosure>
              </article>
            );
          })}
        </div>
      )}
    </Card>
  );
}
