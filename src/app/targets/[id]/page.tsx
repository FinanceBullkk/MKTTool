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
        ← Về danh sách
      </Link>

      <PageHeading title={target.name} description={target.platform} />

      <div className="mb-6 flex flex-wrap items-center gap-3 text-sm">
        {target.active ? (
          <StatusBadge
            label="Đang dùng"
            className="bg-emerald-100 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-300"
          />
        ) : (
          <StatusBadge
            label="Đã nghỉ"
            className="bg-neutral-200 text-neutral-700 dark:bg-neutral-800 dark:text-neutral-400"
          />
        )}
        <span className="text-neutral-600 dark:text-neutral-400">
          {target._count.jobs} job · {target._count.interactions} tương tác đã ghi
        </span>
        {target.facebookPage ? (
          <span className="text-neutral-600 dark:text-neutral-400">
            nối với Fanpage &quot;{target.facebookPage.name}&quot;
          </span>
        ) : null}
      </div>

      {isCommunityPlatform(target.platform) ? null : (
        <div className="mb-6 rounded-md border border-neutral-200 px-4 py-3 text-sm text-neutral-600 dark:border-neutral-800 dark:text-neutral-400">
          Fanpage là kênh của chính mình nên bốn luật giữ nhịp không áp: hạn mức ngày, nghỉ giữa
          hai bài, tỷ lệ promo và đụng độ thread. Mấy ô ngưỡng dưới đây vẫn lưu được nhưng bộ luật
          sẽ bỏ qua chúng.
        </div>
      )}

      <Card title="Sửa đích đăng">
        <p className="mb-4 text-sm text-neutral-600 dark:text-neutral-400">
          Đổi ngưỡng ở đây là mọi job đang chờ của đích này được chấm lại ngay — job hết an toàn
          sẽ chuyển sang BỊ CHẶN và báo lại số lượng.
        </p>
        <ActionForm action={updateTarget} submitLabel="Lưu">
          <input type="hidden" name="id" value={target.id} />
          <TargetFormFields defaults={target} />
        </ActionForm>
      </Card>

      <Card title="Xóa">
        <p className="mb-3 text-sm text-neutral-600 dark:text-neutral-400">
          Chỉ xóa được khi chưa có job hay tương tác nào trỏ tới. Đích không dùng nữa thì bỏ tick
          &quot;Đang dùng&quot; ở trên — nó biến khỏi ô chọn lúc xếp lịch mà lịch sử vẫn còn cho
          bộ luật đếm.
        </p>
        <DeleteEntityButton
          action={deleteTarget.bind(null, target.id)}
          label={`đích "${target.name}"`}
          redirectTo="/targets"
        />
      </Card>
    </>
  );
}
