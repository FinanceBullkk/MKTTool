import { ParkedScopeBanner } from "@/components/layout/parked-scope-banner";
import Link from "next/link";
import { CircleCheck, CircleOff, Crosshair, Plus, Rows3 } from "lucide-react";
import { ActionForm } from "@/components/ui/form-controls";
import { Card, DataTable, Disclosure, EmptyState, PageHeading, PageShell, StatusBadge } from "@/components/ui/page-section";
import { SummaryMetric } from "@/components/ui/summary-metric";
import { TargetFormFields } from "@/components/vault/target-form-fields";
import { createTarget } from "@/lib/accounts/vault-create-actions";
import { prisma } from "@/lib/db/prisma-client";

export const dynamic = "force-dynamic";

export default async function TargetsPage() {
  const targets = await prisma.platformTarget.findMany({
    orderBy: [{ platform: "asc" }, { name: "asc" }],
  });
  const activeCount = targets.filter((target) => target.active).length;
  const inactiveCount = targets.length - activeCount;

  return (
    <PageShell>
      <ParkedScopeBanner what="Reddit and Facebook posting targets" />
      <PageHeading
        title="Posting targets"
        description="Community thresholds and channel history"
        eyebrow="Parked posting data"
        icon={Crosshair}
      />

      <div className="mb-5 grid grid-cols-3 gap-2 sm:gap-3">
        <SummaryMetric icon={Rows3} label="Targets" value={targets.length} />
        <SummaryMetric icon={CircleCheck} label="Active" value={activeCount} />
        <SummaryMetric icon={CircleOff} label="Inactive" value={inactiveCount} />
      </div>

      <Card title="Targets" icon={Crosshair}>
        {targets.length === 0 ? (
          <EmptyState title="No posting targets" icon={Crosshair}>
            No posting targets yet. Read each community&apos;s rules, then enter its minimum karma,
            minimum nick age, and allowed promotional ratio.
          </EmptyState>
        ) : (
          <DataTable
            headers={[
              "Platform",
              "Name",
              "Minimum karma",
              "Nick age (days)",
              "Promotional ratio",
              "Allows links",
              "Active",
              "",
            ]}
          >
            {targets.map((target) => (
              <tr key={target.id}>
                <td className="py-2 pr-4 text-xs text-neutral-600 dark:text-neutral-400">
                  {target.platform}
                </td>
                <td className="py-2 pr-4 font-medium">
                  <Link href={`/targets/${target.id}`} className="hover:underline">
                    {target.name}
                  </Link>
                </td>
                <td className="py-2 pr-4">{target.minKarma}</td>
                <td className="py-2 pr-4">{target.minAccountAgeDays}</td>
                <td className="py-2 pr-4">{target.promoRatio}:1</td>
                <td className="py-2 pr-4">{target.allowsLinks ? "Yes" : "No"}</td>
                <td className="py-2 pr-4">
                  {target.active ? (
                    "Yes"
                  ) : (
                    <StatusBadge
                      label="Inactive"
                      className="bg-neutral-200 text-neutral-600 dark:bg-neutral-800 dark:text-neutral-400"
                    />
                  )}
                </td>
                <td className="py-2 pr-4 text-right">
                  <Link
                    href={`/targets/${target.id}`}
                    className="text-xs text-neutral-500 hover:underline"
                  >
                    Edit
                  </Link>
                </td>
              </tr>
            ))}
          </DataTable>
        )}
      </Card>

      <Card title="Add posting target" icon={Plus} tone="muted">
        <Disclosure summary="Open target form" icon={Plus}>
          <ActionForm action={createTarget} submitLabel="Add posting target">
            <TargetFormFields />
          </ActionForm>
        </Disclosure>
      </Card>
    </PageShell>
  );
}
