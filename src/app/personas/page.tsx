import Link from "next/link";
import { ActionForm } from "@/components/ui/form-controls";
import { Card, DataTable, EmptyState, PageHeading } from "@/components/ui/page-section";
import { PersonaFormFields } from "@/components/vault/persona-form-fields";
import { createPersona } from "@/lib/accounts/vault-create-actions";
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
          <DataTable headers={["Tên", "Giọng điệu", "Mảng nội dung", "Số nick", ""]}>
            {personas.map((persona) => (
              <tr key={persona.id}>
                <td className="py-2 pr-4 font-medium">
                  <Link href={`/personas/${persona.id}`} className="hover:underline">
                    {persona.name}
                  </Link>
                </td>
                <td className="py-2 pr-4 text-neutral-600 dark:text-neutral-400">{persona.voice}</td>
                <td className="py-2 pr-4 text-neutral-600 dark:text-neutral-400">
                  {persona.contentAngle}
                </td>
                <td className="py-2 pr-4">{persona._count.accounts}</td>
                <td className="py-2 pr-4 text-right">
                  <Link
                    href={`/personas/${persona.id}`}
                    className="text-xs text-neutral-500 hover:underline"
                  >
                    Sửa
                  </Link>
                </td>
              </tr>
            ))}
          </DataTable>
        )}
      </Card>

      <Card title="Thêm nhân vật">
        <ActionForm action={createPersona} submitLabel="Tạo nhân vật">
          <PersonaFormFields />
        </ActionForm>
      </Card>
    </>
  );
}
