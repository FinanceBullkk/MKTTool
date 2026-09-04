import Link from "next/link";
import { Archive, KeyRound, MonitorCheck, MonitorSmartphone, MonitorX, Wrench } from "lucide-react";
import { RelayCompatibilityRollbackButton } from "@/components/relay/relay-compatibility-rollback-button";
import { RelayCompatibilityUpdateButton } from "@/components/relay/relay-compatibility-update-button";
import { RelayDeviceIdCell } from "@/components/relay/relay-device-id-cell";
import { RelayDeviceRetirementButton } from "@/components/relay/relay-device-retirement-button";
import { RelayDeviceRetirementReceiptButton } from "@/components/relay/relay-device-retirement-receipt-button";
import { RelayDeviceRevokeButton } from "@/components/relay/relay-device-revoke-button";
import { RelayDeviceVersionCell } from "@/components/relay/relay-device-version-cell";
import { RelayGrantKeyButton } from "@/components/relay/relay-grant-key-button";
import { ActionForm, Field, SelectField } from "@/components/ui/form-controls";
import {
  Card,
  DataTable,
  EmptyState,
  PageHeading,
  PageShell,
  StatusBadge,
} from "@/components/ui/page-section";
import { SummaryMetric } from "@/components/ui/summary-metric";
import { isEmailAllowed, readEmailAccessList } from "@/lib/auth/allowed-emails";
import { readActor } from "@/lib/auth/require-actor";
import { prisma } from "@/lib/db/prisma-client";
import { formatFullDateTime } from "@/lib/format/vietnamese-date-format";
import { registerRelayDevice, revokeRelayDevice } from "@/lib/tickets/relay-device-actions";
import { MIN_RELAY_VERSION } from "@/lib/tickets/ticket-types";

export const dynamic = "force-dynamic";

export default async function RelayDevicesPage() {
  const viewer = await readActor();
  const isAdmin = viewer?.role === "ADMIN";

  const [devices, teamMembers] = await Promise.all([
    prisma.relayDevice.findMany({
      orderBy: [{ revokedAt: "asc" }, { createdAt: "desc" }],
      include: {
        user: { select: { email: true } },
        _count: { select: { accounts: true } },
      },
    }),
    prisma.user.findMany({ orderBy: { email: "asc" }, select: { id: true, email: true } }),
  ]);

  const accessList = readEmailAccessList();
  const canStillSignIn = (email: string) => isEmailAllowed(email, accessList);
  const activeDevices = devices.filter((device) => !device.revokedAt);
  const revokedDevices = devices.filter((device) => device.revokedAt);
  const awaitingKey = activeDevices.filter(
    (device) => !device.operatorKeyGrant && !device.operatorKeyReadyAt,
  );

  const keyStatus = (device: (typeof devices)[number]) => {
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
        detail: "Waiting for this Relay PC to open the web app",
      };
    }
    return {
      label: "Action required",
      className: "bg-amber-950 text-amber-400",
      detail: "Operator key has not been granted",
    };
  };

  return (
    <PageShell>
      <PageHeading
        title="Relay PCs"
        description="Registered machines and access"
        eyebrow="Operator devices"
        icon={MonitorSmartphone}
      />

      <div className="mb-6 grid grid-cols-3 gap-2 sm:gap-3">
        <SummaryMetric icon={MonitorCheck} label="Active" value={activeDevices.length} />
        <SummaryMetric
          icon={KeyRound}
          label="Waiting for key"
          value={awaitingKey.length}
          tone={awaitingKey.length > 0 ? "warning" : "success"}
        />
        <SummaryMetric icon={MonitorX} label="Revoked" value={revokedDevices.length} />
      </div>

      {isAdmin && awaitingKey.length > 0 ? (
        <Card
          title={`${awaitingKey.length} ${awaitingKey.length === 1 ? "Relay PC needs" : "Relay PCs need"} an operator key`}
          description="Registered PCs stay blocked from secrets and browser actions until the key is granted."
          icon={KeyRound}
        >
          <DataTable headers={["Relay PC", "Owner", "Registered", "Next action"]}>
            {awaitingKey.map((device) => (
              <tr key={device.id}>
                <td className="py-3 pr-4 font-semibold text-white">{device.name}</td>
                <td className="py-3 pr-4 text-neutral-300">{device.user.email}</td>
                <td className="py-3 pr-4 text-xs text-neutral-500">
                  {formatFullDateTime(device.createdAt)}
                </td>
                <td className="py-3 text-right">
                  <RelayGrantKeyButton
                    deviceId={device.id}
                    devicePublicKey={device.publicKey}
                    deviceName={device.name}
                    alreadyReady={false}
                  />
                </td>
              </tr>
            ))}
          </DataTable>
        </Card>
      ) : null}

      <Card
        title={`Active Relay PCs - ${activeDevices.length}`}
        description="Owner, runtime, and key readiness are the daily operating signals."
        icon={MonitorCheck}
      >
        {activeDevices.length === 0 ? (
          <EmptyState>
            No active Relay PC is registered. Install Relay on the PC you will use, then continue
            through <Link href="/setup" className="underline">Setup</Link> on that same PC.
          </EmptyState>
        ) : (
          <DataTable headers={["Relay PC", "Owner", "Relay", "Operator key", ""]}>
            {activeDevices.map((device) => {
              const key = keyStatus(device);

              return (
                <tr key={device.id}>
                  <td className="py-4 pr-4 align-top">
                    <span className="font-semibold text-white">{device.name}</span>
                    <span className="mt-1 block text-xs text-neutral-500">
                      {device._count.accounts === 0
                        ? "No nicks assigned"
                        : `${device._count.accounts} ${device._count.accounts === 1 ? "nick" : "nicks"} assigned`}
                    </span>
                    <details className="mt-2 max-w-md rounded-lg border border-white/[0.07] bg-black/10">
                      <summary className="flex min-h-11 cursor-pointer list-none items-center px-3 text-xs font-medium text-neutral-400 marker:content-none">
                        Technical details
                      </summary>
                      <dl className="space-y-3 border-t border-white/[0.07] p-3 text-xs">
                        <div>
                          <dt className="text-neutral-600">Relay PC ID</dt>
                          <dd className="mt-1"><RelayDeviceIdCell deviceId={device.id} /></dd>
                        </div>
                        <div>
                          <dt className="text-neutral-600">Public key</dt>
                          <dd className="mt-1 break-all font-mono text-neutral-400">
                            {device.publicKey}
                          </dd>
                        </div>
                        <div>
                          <dt className="text-neutral-600">Registered</dt>
                          <dd className="mt-1 text-neutral-400">
                            {formatFullDateTime(device.createdAt)}
                          </dd>
                        </div>
                      </dl>
                    </details>
                  </td>
                  <td className="py-4 pr-4 align-top text-neutral-300">
                    {device.user.email}
                    {!canStillSignIn(device.user.email) ? (
                      <span className="mt-1 block max-w-xs text-xs leading-5 text-amber-400">
                        Sign-in access removed; this PC cannot request new tickets.
                      </span>
                    ) : null}
                  </td>
                  <td className="py-4 pr-4 align-top">
                    <RelayDeviceVersionCell device={device} floor={MIN_RELAY_VERSION} />
                  </td>
                  <td className="py-4 pr-4 align-top">
                    <StatusBadge label={key.label} className={key.className} />
                    <span className="mt-1 block max-w-xs text-xs leading-5 text-neutral-500">
                      {key.detail}
                    </span>
                  </td>
                  <td className="py-4 text-right align-top">
                    {isAdmin ? (
                      <details className="inline-block w-52 rounded-lg border border-white/[0.08] bg-black/10 text-left">
                        <summary className="flex min-h-11 cursor-pointer list-none items-center justify-center px-3 text-xs font-semibold text-neutral-300 marker:content-none">
                          Manage PC
                        </summary>
                        <div className="space-y-3 border-t border-white/[0.08] p-3">
                          {device.operatorKeyReadyAt || device.operatorKeyGrant ? (
                            <RelayGrantKeyButton
                              deviceId={device.id}
                              devicePublicKey={device.publicKey}
                              deviceName={device.name}
                              alreadyReady={Boolean(device.operatorKeyReadyAt)}
                            />
                          ) : null}
                          <RelayCompatibilityUpdateButton
                            deviceId={device.id}
                            deviceName={device.name}
                            devicePublicKey={device.publicKey}
                          />
                          <RelayCompatibilityRollbackButton
                            deviceId={device.id}
                            deviceName={device.name}
                            devicePublicKey={device.publicKey}
                          />
                          <RelayDeviceRevokeButton
                            action={revokeRelayDevice.bind(null, device.id)}
                            deviceName={device.name}
                          />
                          {!device.retirementCompletedAt ? (
                            <RelayDeviceRetirementButton
                              deviceId={device.id}
                              deviceName={device.name}
                              devicePublicKey={device.publicKey}
                            />
                          ) : (
                            <StatusBadge
                              label="Local cleanup confirmed"
                              className="bg-emerald-950 text-emerald-400"
                            />
                          )}
                        </div>
                      </details>
                    ) : null}
                  </td>
                </tr>
              );
            })}
          </DataTable>
        )}
      </Card>

      {revokedDevices.length > 0 ? (
        <Card
          title={`Revoked Relay PCs - ${revokedDevices.length}`}
          description="History is retained for audit and local cleanup confirmation."
          icon={Archive}
          tone="muted"
        >
          <DataTable headers={["Relay PC", "Owner", "Revoked", "Local cleanup"]}>
            {revokedDevices.map((device) => (
              <tr key={device.id} className="text-neutral-500">
                <td className="py-4 pr-4 align-top">
                  <span className="font-medium text-neutral-300">{device.name}</span>
                  <details className="mt-2 max-w-md rounded-lg border border-white/[0.07] bg-black/10">
                    <summary className="flex min-h-11 cursor-pointer list-none items-center px-3 text-xs font-medium marker:content-none">
                      Technical details
                    </summary>
                    <div className="space-y-3 border-t border-white/[0.07] p-3 text-xs">
                      <RelayDeviceIdCell deviceId={device.id} />
                      <p className="break-all font-mono">{device.publicKey}</p>
                      <RelayDeviceVersionCell device={device} floor={MIN_RELAY_VERSION} />
                    </div>
                  </details>
                </td>
                <td className="py-4 pr-4 align-top">{device.user.email}</td>
                <td className="py-4 pr-4 align-top text-xs">
                  {device.revokedAt ? formatFullDateTime(device.revokedAt) : "-"}
                </td>
                <td className="py-4 align-top">
                  {isAdmin ? (
                    !device.retirementCompletedAt ? (
                      <RelayDeviceRetirementButton
                        deviceId={device.id}
                        deviceName={device.name}
                        devicePublicKey={device.publicKey}
                      />
                    ) : (
                      <div className="space-y-2">
                        <StatusBadge
                          label={`Confirmed ${formatFullDateTime(device.retirementCompletedAt)}`}
                          className="bg-emerald-950 text-emerald-400"
                        />
                        {device.retirementId ? (
                          <RelayDeviceRetirementReceiptButton
                            deviceId={device.id}
                            devicePublicKey={device.publicKey}
                            retirementId={device.retirementId}
                          />
                        ) : null}
                      </div>
                    )
                  ) : device.retirementCompletedAt ? (
                    "Confirmed"
                  ) : (
                    "Pending"
                  )}
                </td>
              </tr>
            ))}
          </DataTable>
        </Card>
      ) : null}

      <Card title="Set up the PC you are using" icon={MonitorSmartphone}>
        <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <p className="max-w-2xl text-sm leading-6 text-neutral-400">
            The guided setup checks Relay locally, registers this PC, and records its handoff state.
          </p>
          <Link
            href="/setup"
            className="brand-btn inline-flex min-h-11 shrink-0 items-center justify-center rounded-xl px-4 text-sm font-semibold"
          >
            Open Setup
          </Link>
        </div>
      </Card>

      {isAdmin ? (
        <Card
          title="Administrator tools"
          description="Manual enrollment and emergency recovery stay outside the daily device list."
          icon={Wrench}
          tone="muted"
        >
          <details className="rounded-xl border border-white/[0.08] bg-black/10">
            <summary className="flex min-h-11 cursor-pointer list-none items-center justify-between px-4 text-sm font-semibold text-neutral-300 marker:content-none">
              Register another Relay PC manually
              <span className="text-neutral-500">+</span>
            </summary>
            <div className="border-t border-white/[0.08] p-4 sm:p-5">
              <p className="mb-4 text-sm leading-6 text-neutral-400">
                Use this only when you cannot access that PC. Ask its user for the public key, then
                send the generated Relay PC ID back for manual configuration.
              </p>
              <ActionForm action={registerRelayDevice} submitLabel="Register Relay PC">
                <Field
                  label="Relay PC name"
                  name="name"
                  required
                  placeholder="Ha's Dell laptop"
                  hint="Use a name you can identify quickly if this Relay PC must be revoked."
                />
                <SelectField
                  label="Relay PC user"
                  name="userId"
                  required
                  options={teamMembers.map((member) => ({ value: member.id, label: member.email }))}
                  hint="Only people who have signed in at least once are listed."
                />
                <Field
                  label="Relay PC public key"
                  name="publicKey"
                  required
                  placeholder="64 hexadecimal characters"
                  hint="Copy the complete public key printed by Relay. The private key must remain on that PC."
                />
              </ActionForm>
            </div>
          </details>

          <details className="mt-3 rounded-xl border border-red-500/15 bg-red-500/[0.025]">
            <summary className="flex min-h-11 cursor-pointer list-none items-center justify-between px-4 text-sm font-semibold text-neutral-300 marker:content-none">
              Emergency revocation guidance
              <span className="text-neutral-500">+</span>
            </summary>
            <ul className="space-y-2 border-t border-red-500/15 p-4 text-sm leading-6 text-neutral-400">
              <li>Revocation immediately blocks the PC from receiving new tickets.</li>
              <li>
                Secrets already retrieved by that PC may remain on its drive. If the PC is lost,
                revoke it, then rotate the operator key with{" "}
                <code className="rounded bg-black/20 px-1 py-0.5 font-mono text-xs">
                  npm run vault:rekey -- --domain=operator
                </code>
                .
              </li>
              <li>
                Revocation is irreversible. A recovered PC needs a fresh Relay key pair and a new
                registration.
              </li>
            </ul>
          </details>
        </Card>
      ) : null}
    </PageShell>
  );
}
