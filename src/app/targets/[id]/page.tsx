import { notFound } from "next/navigation";
import { Activity, Crosshair, Info, PencilLine, Trash2 } from "lucide-react";
import { DeleteEntityButton } from "@/components/ui/delete-entity-button";
import { ActionForm } from "@/components/ui/form-controls";
import { BackLink, Card, Disclosure, PageHeading, PageShell, StatusBadge } from "@/components/ui/page-section";
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
    <PageShell>
      <BackLink href="/targets">Posting targets</BackLink>

      <PageHeading
        title={target.name}
        description={target.url}
        eyebrow={target.platform}
        icon={Crosshair}
        action={
          <StatusBadge
            label={target.active ? "Active" : "Inactive"}
            className={target.active ? "bg-emerald-400/10 text-emerald-300" : "bg-white/[0.06] text-neutral-400"}
          />
        }
      />

      <div className="mb-5 grid gap-2 sm:grid-cols-3">
        <TargetSignal label="Jobs" value={String(target._count.jobs)} />
        <TargetSignal label="Interactions" value={String(target._count.interactions)} />
        <TargetSignal label="Channel" value={target.facebookPage?.name ?? "Community"} />
      </div>

      {isCommunityPlatform(target.platform) ? null : (
        <Disclosure summary="Rule coverage for an owned Facebook Page" icon={Info} className="mb-5">
          A Facebook Page is an owned channel, so four pacing rules do not apply: daily cap,
          spacing between posts, promotional ratio, and thread collision. The thresholds below
          remain stored, but the posting rules skip them.
        </Disclosure>
      )}

      <Card
        title="Edit posting target"
        description="Threshold changes immediately recheck every pending job for this target."
        icon={PencilLine}
      >
        <ActionForm action={updateTarget} submitLabel="Save">
          <input type="hidden" name="id" value={target.id} />
          <TargetFormFields defaults={target} />
        </ActionForm>
      </Card>

      <Card
        title="Delete target"
        description="Use Inactive for retirement. Delete only targets with no linked history."
        icon={Trash2}
        tone="danger"
      >
        <DeleteEntityButton
          action={deleteTarget.bind(null, target.id)}
          label={`target "${target.name}"`}
          redirectTo="/targets"
        />
      </Card>
    </PageShell>
  );
}

function TargetSignal({ label, value }: { label: string; value: string }) {
  return (
    <div className="app-surface flex items-center gap-3 rounded-xl p-3.5">
      <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-white/[0.045] text-neutral-400">
        <Activity size={16} aria-hidden="true" />
      </span>
      <div className="min-w-0">
        <p className="font-mono text-[10px] font-semibold uppercase tracking-[0.12em] text-neutral-600">{label}</p>
        <p className="truncate text-sm font-semibold text-neutral-200" title={value}>{value}</p>
      </div>
    </div>
  );
}
