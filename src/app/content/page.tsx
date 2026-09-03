import { ParkedScopeBanner } from "@/components/layout/parked-scope-banner";
import Link from "next/link";
import { ContentItemForm } from "@/components/content/content-item-form";
import { Card, DataTable, EmptyState, PageHeading, StatusBadge } from "@/components/ui/page-section";
import {
  CONTENT_TYPE_LABELS,
  type ContentType,
  parseLinks,
} from "@/lib/content/content-types";
import { prisma } from "@/lib/db/prisma-client";
import { formatDayMonth } from "@/lib/format/vietnamese-date-format";

export const dynamic = "force-dynamic";

const TYPE_CLASS: Record<ContentType, string> = {
  VALUE: "bg-emerald-100 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-300",
  PROMO: "bg-amber-100 text-amber-800 dark:bg-amber-950 dark:text-amber-300",
};

export default async function ContentPage() {
  const items = await prisma.contentItem.findMany({
    orderBy: { createdAt: "desc" },
    include: { _count: { select: { jobs: true } } },
  });

  return (
    <>
      <ParkedScopeBanner what="content library and posting pipeline" />
      <PageHeading
        title="Content library"
        description="The team can write anywhere, but content must be stored here before the posting rules can detect duplicates. Unscheduled content does not count toward any ratio."
      />

      <Card title={`Content items - ${items.length}`}>
        {items.length === 0 ? (
          <EmptyState>
            No content yet. Add the first item below, then open the{" "}
            <Link href="/queue/new" className="underline">
              posting queue
            </Link>{" "}
            to schedule it.
          </EmptyState>
        ) : (
          <DataTable headers={["Title", "Type", "Author", "Links", "Scheduled", "Created", ""]}>
            {items.map((item) => {
              const type = item.type as ContentType;
              return (
                <tr key={item.id}>
                  <td className="max-w-sm py-2 pr-4">
                    <Link href={`/content/${item.id}`} className="font-medium hover:underline">
                      {item.title}
                    </Link>
                    <div className="truncate text-xs text-neutral-500">{item.body}</div>
                  </td>
                  <td className="py-2 pr-4">
                    <StatusBadge
                      label={CONTENT_TYPE_LABELS[type] ?? item.type}
                      className={TYPE_CLASS[type] ?? TYPE_CLASS.PROMO}
                    />
                  </td>
                  <td className="py-2 pr-4 text-neutral-600 dark:text-neutral-400">
                    {item.authorName}
                  </td>
                  <td className="py-2 pr-4">{parseLinks(item.links).length}</td>
                  <td className="py-2 pr-4">{item._count.jobs} jobs</td>
                  <td className="py-2 pr-4 text-xs text-neutral-500">
                    {formatDayMonth(item.createdAt)}
                  </td>
                  <td className="py-2 pr-4 text-right">
                    <Link
                      href={`/content/${item.id}`}
                      className="text-xs text-neutral-500 hover:underline"
                    >
                      Edit
                    </Link>
                  </td>
                </tr>
              );
            })}
          </DataTable>
        )}
      </Card>

      <Card title="Add content">
        <ContentItemForm />
      </Card>
    </>
  );
}
