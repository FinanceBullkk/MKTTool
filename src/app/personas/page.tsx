import { ActionForm, Field } from "@/components/ui/form-controls";
import { Card, DataTable, EmptyState, PageHeading } from "@/components/ui/page-section";
import { createPersona } from "@/lib/accounts/account-actions";
import { prisma } from "@/lib/db/prisma-client";

export const dynamic = "force-dynamic";

export default async function PersonasPage() {
  const personas = await prisma.persona.findMany({
    orderBy: { name: "asc" },
    include: { _count: { select: { accounts: true } } },
  });

  return (
    <>
      <PageHeading
        title="Nhân vật"
        description="Mỗi nick là một nhân vật riêng: giọng điệu riêng, mảng nội dung riêng. Trên Reddit đây là bắt buộc — mod là người thật và họ nhận ra ngay khi nhiều nick nói cùng một giọng."
      />

      <Card title="Danh sách">
        {personas.length === 0 ? (
          <EmptyState>Chưa có nhân vật nào. Tạo nhân vật trước rồi mới thêm nick.</EmptyState>
        ) : (
          <DataTable headers={["Tên", "Giọng điệu", "Mảng nội dung", "Số nick"]}>
            {personas.map((persona) => (
              <tr key={persona.id}>
                <td className="py-2 pr-4 font-medium">{persona.name}</td>
                <td className="py-2 pr-4 text-neutral-600 dark:text-neutral-400">{persona.voice}</td>
                <td className="py-2 pr-4 text-neutral-600 dark:text-neutral-400">
                  {persona.contentAngle}
                </td>
                <td className="py-2 pr-4">{persona._count.accounts}</td>
              </tr>
            ))}
          </DataTable>
        )}
      </Card>

      <Card title="Thêm nhân vật">
        <ActionForm action={createPersona} submitLabel="Tạo nhân vật">
          <Field label="Tên" name="name" required placeholder="Minh — dev backend" />
          <Field
            label="Giọng điệu"
            name="voice"
            required
            placeholder="Thẳng thắn, kỹ thuật, hay dẫn số liệu"
          />
          <Field
            label="Mảng nội dung"
            name="contentAngle"
            required
            placeholder="Tự host, DevOps, tối ưu chi phí hạ tầng"
          />
          <Field label="Ghi chú" name="notes" placeholder="Tùy chọn" />
        </ActionForm>
      </Card>
    </>
  );
}
