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
        ← Về kho content
      </Link>

      <PageHeading title={item.title} description={`${item.authorName} viết`} />

      <Card title="Sửa content">
        <p className="mb-4 text-sm text-neutral-600 dark:text-neutral-400">
          Sửa xong là mọi job đang chờ dùng bài này được chấm lại ngay: độ trùng nội dung và
          chính sách link tính trên thân bài, tỷ lệ promo tính trên loại bài. Job hết an toàn
          sẽ chuyển sang BỊ CHẶN và báo lại số lượng.
        </p>
        <ContentItemForm
          action={updateContentItem}
          submitLabel="Lưu"
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

      <Card title={`Job dùng bài này — ${item.jobs.length}`}>
        {item.jobs.length === 0 ? (
          <EmptyState>Chưa xếp lịch cho bài này. Chưa xếp thì chưa tính vào tỷ lệ nào cả.</EmptyState>
        ) : (
          <DataTable headers={["Giờ đăng", "Nick", "Đích", "Trạng thái"]}>
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

      <Card title="Xóa">
        <p className="mb-3 text-sm text-neutral-600 dark:text-neutral-400">
          Chỉ xóa được khi chưa xếp lịch lần nào. Bài đã xếp là đối chứng để bộ luật so trùng
          cho những bài sau — bỏ qua job ở hàng đợi thay vì xóa bài gốc.
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
