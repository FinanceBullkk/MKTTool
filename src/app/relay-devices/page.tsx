import Link from "next/link";
import { KeyRound, MonitorCheck, MonitorSmartphone, MonitorX, Wrench } from "lucide-react";
import { RelayActiveDeviceList } from "@/components/relay/relay-active-device-list";
import { RelayLocalIdentityProvider } from "@/components/relay/relay-local-identity-provider";
import { RelayRevokedDeviceList } from "@/components/relay/relay-revoked-device-list";
import { ActionForm, Field, SelectField } from "@/components/ui/form-controls";
import { Card, Disclosure, PageHeading, PageShell } from "@/components/ui/page-section";
import { SummaryMetric } from "@/components/ui/summary-metric";
import { isEmailAllowed, readEmailAccessList } from "@/lib/auth/allowed-emails";
import { readActor } from "@/lib/auth/require-actor";
import { prisma } from "@/lib/db/prisma-client";
import { registerRelayDevice } from "@/lib/tickets/relay-device-actions";
import {
  effectiveMinRelayVersion,
  MIN_RELAY_VERSION,
  TICKET_KINDS,
} from "@/lib/tickets/ticket-types";

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
  const profileOperationMinimumRelayVersion = effectiveMinRelayVersion(
    TICKET_KINDS.CREATE_PROFILE,
  );

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

        {/* One local Relay lookup serves both lists because every row observes the same browser PC. */}
      <RelayLocalIdentityProvider>
        <RelayActiveDeviceList
          devices={activeDevices}
          isAdmin={isAdmin}
          canStillSignIn={canStillSignIn}
          securityMinimumRelayVersion={MIN_RELAY_VERSION}
          profileOperationMinimumRelayVersion={profileOperationMinimumRelayVersion}
        />

        <RelayRevokedDeviceList
          devices={revokedDevices}
          isAdmin={isAdmin}
          viewerUserId={viewer?.userId}
          minimumRelayVersion={MIN_RELAY_VERSION}
        />
      </RelayLocalIdentityProvider>

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
          <Disclosure summary="Register another Relay PC manually">
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
          </Disclosure>

          <Disclosure summary="Emergency revocation guidance" className="mt-3 border-red-500/15">
            <ul className="space-y-2 text-sm leading-6 text-neutral-400">
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
          </Disclosure>
        </Card>
      ) : null}
    </PageShell>
  );
}
