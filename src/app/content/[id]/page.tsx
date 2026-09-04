import { notFound } from "next/navigation";
import { FileClock, FilePenLine, FileText, Trash2 } from "lucide-react";
import { ContentItemForm } from "@/components/content/content-item-form";
import { DeleteEntityButton } from "@/components/ui/delete-entity-button";
import { BackLink, Card, DataTable, EmptyState, PageHeading, PageShell, StatusBadge } from "@/components/ui/page-section";
import { deleteContentItem, updateContentItem } from "@/lib/content/content-item-actions";
import { getJobStatusPresentation, parseLinks } from "@/lib/content/content-types";
import { prisma } from "@/lib/db/prisma-client";
import { formatDayMonthTime } from "@/lib/format/vietnamese-date-format";

export const dynamic = "force-dynamic";

export default async function ContentDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;

  const item = await prisma.contentItem.findUnique({
    where: { id },
    include: {
      jobs: {
        orderBy: { scheduledAt: "asc" },
        include: {
          account: { select: { username: true } },
          target: { select: { name: true } },
        },
      },
    },
  });

  if (!item) notFound();

  return (
    <PageShell>
      <BackLink href="/content">Content library</BackLink>

      <PageHeading
        title={item.title}
        description={`Written by ${item.authorName}`}
        eyebrow={item.type === "PROMO" ? "Promotional post" : "Value post"}
        icon={FileText}
      />

      <Card
        title="Edit content"
        description="Saving rechecks every pending job that uses this item."
        icon={FilePenLine}
      >
        <ContentItemForm
          action={updateContentItem}
          submitLabel="Save"
          defaults={{
            id: item.id,
            title: item.title,
            body: item.body,
            type: item.type,
            authorName: item.authorName,
            linksText: parseLinks(item.links).join("\n"),
          }}
        />
      </Card>

      <Card title={`Jobs using this content - ${item.jobs.length}`} icon={FileClock}>
        {item.jobs.length === 0 ? (
          <EmptyState title="Not scheduled" icon={FileClock}>This item does not count toward any ratio yet.</EmptyState>
        ) : (
          <DataTable headers={["Scheduled time", "Nick", "Target", "Status"]}>
            {item.jobs.map((job) => {
              const status = getJobStatusPresentation(job.status);
              return (
                <tr key={job.id}>
                  <td className="whitespace-nowrap py-2 pr-4 text-xs text-neutral-600 dark:text-neutral-400">
                    {formatDayMonthTime(job.scheduledAt)}
                  </td>
                  <td className="py-2 pr-4 font-medium">{job.account.username}</td>
                  <td className="py-2 pr-4 text-neutral-600 dark:text-neutral-400">
                    {job.target.name}
                  </td>
                  <td className="py-2 pr-4">
                    <StatusBadge label={status.label} className={status.className} />
                  </td>
                </tr>
              );
            })}
          </DataTable>
        )}
      </Card>

      <Card
        title="Delete content"
        description="Deletion is available only before this item has scheduling history."
        icon={Trash2}
        tone="danger"
      >
        <DeleteEntityButton
          action={deleteContentItem.bind(null, item.id)}
          label={`content "${item.title}"`}
          redirectTo="/content"
        />
      </Card>
    </PageShell>
  );
}
