import Link from "next/link";
import { notFound } from "next/navigation";
import { ContentItemForm } from "@/components/content/content-item-form";
import { DeleteEntityButton } from "@/components/ui/delete-entity-button";
import { Card, DataTable, EmptyState, PageHeading, StatusBadge } from "@/components/ui/page-section";
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
    <>
      <Link href="/content" className="mb-4 inline-block text-sm text-neutral-500 hover:underline">
        ← Back to content library
      </Link>

      <PageHeading title={item.title} description={`Written by ${item.authorName}`} />

      <Card title="Edit content">
        <p className="mb-4 text-sm text-neutral-600 dark:text-neutral-400">
          Saving immediately rechecks every pending job that uses this item. Duplicate-content and
          link-policy rules use the body, while the promotional ratio uses the content type. Jobs
          that are no longer safe move to BLOCKED, and the result reports how many changed.
        </p>
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

      <Card title={`Jobs using this content - ${item.jobs.length}`}>
        {item.jobs.length === 0 ? (
          <EmptyState>This content has not been scheduled and does not count toward any ratio.</EmptyState>
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

      <Card title="Delete">
        <p className="mb-3 text-sm text-neutral-600 dark:text-neutral-400">
          You can delete only content that has never been scheduled. Scheduled content is evidence
          used by the posting rules to detect later duplicates. Skip its job in the posting queue
          instead of deleting the original item.
        </p>
        <DeleteEntityButton
          action={deleteContentItem.bind(null, item.id)}
          label={`content "${item.title}"`}
          redirectTo="/content"
        />
      </Card>
    </>
  );
}
