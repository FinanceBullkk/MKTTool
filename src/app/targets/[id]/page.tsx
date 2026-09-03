import Link from "next/link";
import { notFound } from "next/navigation";
import { DeleteEntityButton } from "@/components/ui/delete-entity-button";
import { ActionForm } from "@/components/ui/form-controls";
import { Card, PageHeading, StatusBadge } from "@/components/ui/page-section";
import { TargetFormFields } from "@/components/vault/target-form-fields";
import { deleteTarget } from "@/lib/accounts/vault-delete-actions";
import { updateTarget } from "@/lib/accounts/vault-update-actions";
import { isCommunityPlatform } from "@/lib/platforms/platform-family";
import { prisma } from "@/lib/db/prisma-client";

export const dynamic = "force-dynamic";

export default async function TargetDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;

  const target = await prisma.platformTarget.findUnique({
    where: { id },
    include: {
      _count: { select: { jobs: true, interactions: true } },
      facebookPage: { select: { name: true } },
    },
  });

  if (!target) notFound();

  return (
    <>
      <Link href="/targets" className="mb-4 inline-block text-sm text-neutral-500 hover:underline">
        ← Back to posting targets
      </Link>

      <PageHeading title={target.name} description={target.platform} />

      <div className="mb-6 flex flex-wrap items-center gap-3 text-sm">
        {target.active ? (
          <StatusBadge
            label="Active"
            className="bg-emerald-100 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-300"
          />
        ) : (
          <StatusBadge
            label="Inactive"
            className="bg-neutral-200 text-neutral-700 dark:bg-neutral-800 dark:text-neutral-400"
          />
        )}
        <span className="text-neutral-600 dark:text-neutral-400">
          {target._count.jobs} jobs · {target._count.interactions} recorded interactions
        </span>
        {target.facebookPage ? (
          <span className="text-neutral-600 dark:text-neutral-400">
            connected to Facebook Page &quot;{target.facebookPage.name}&quot;
          </span>
        ) : null}
      </div>

      {isCommunityPlatform(target.platform) ? null : (
        <div className="mb-6 rounded-md border border-neutral-200 px-4 py-3 text-sm text-neutral-600 dark:border-neutral-800 dark:text-neutral-400">
          A Facebook Page is an owned channel, so four pacing rules do not apply: daily cap,
          spacing between posts, promotional ratio, and thread collision. The thresholds below
          remain stored, but the posting rules skip them.
        </div>
      )}

      <Card title="Edit posting target">
        <p className="mb-4 text-sm text-neutral-600 dark:text-neutral-400">
          Changing these thresholds immediately rechecks every pending job for this target. Jobs
          that are no longer safe move to BLOCKED, and the result reports how many changed.
        </p>
        <ActionForm action={updateTarget} submitLabel="Save">
          <input type="hidden" name="id" value={target.id} />
          <TargetFormFields defaults={target} />
        </ActionForm>
      </Card>

      <Card title="Delete">
        <p className="mb-3 text-sm text-neutral-600 dark:text-neutral-400">
          You can delete only a target with no linked jobs or interactions. If it is no longer
          used, clear &quot;Active&quot; above. It disappears from the scheduling selector while
          its history remains available to the posting rules.
        </p>
        <DeleteEntityButton
          action={deleteTarget.bind(null, target.id)}
          label={`target "${target.name}"`}
          redirectTo="/targets"
        />
      </Card>
    </>
  );
}
