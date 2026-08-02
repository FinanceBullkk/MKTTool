import Link from "next/link";
import { notFound } from "next/navigation";
import { DeleteEntityButton } from "@/components/ui/delete-entity-button";
import { ActionForm } from "@/components/ui/form-controls";
import { Card, DataTable, EmptyState, PageHeading } from "@/components/ui/page-section";
import { PersonaFormFields } from "@/components/vault/persona-form-fields";
import { deletePersona } from "@/lib/accounts/vault-delete-actions";
import { updatePersona } from "@/lib/accounts/vault-update-actions";
import { prisma } from "@/lib/db/prisma-client";

export const dynamic = "force-dynamic";

export default async function PersonaDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;

  const persona = await prisma.persona.findUnique({
    where: { id },
    include: { accounts: { select: { id: true, username: true, platform: true } } },
  });

  if (!persona) notFound();

  return (
    <>
      <Link href="/personas" className="mb-4 inline-block text-sm text-neutral-500 hover:underline">
        ← Về danh sách
      </Link>

      <PageHeading title={persona.name} />

      <Card title="Sửa nhân vật">
        <ActionForm action={updatePersona} submitLabel="Lưu">
          <input type="hidden" name="id" value={persona.id} />
          <PersonaFormFields defaults={persona} />
        </ActionForm>
      </Card>

      <Card title={`Nick đang dùng nhân vật này — ${persona.accounts.length}`}>
        {persona.accounts.length === 0 ? (
          <EmptyState>Chưa nick nào dùng nhân vật này.</EmptyState>
        ) : (
          <DataTable headers={["Nick", "Nền tảng"]}>
            {persona.accounts.map((account) => (
              <tr key={account.id}>
                <td className="py-2 pr-4 font-medium">
                  <Link href={`/accounts/${account.id}`} className="hover:underline">
                    {account.username}
                  </Link>
                </td>
                <td className="py-2 pr-4 text-neutral-600 dark:text-neutral-400">
                  {account.platform}
                </td>
              </tr>
            ))}
          </DataTable>
        )}
      </Card>

      <Card title="Xóa">
        <p className="mb-3 text-sm text-neutral-600 dark:text-neutral-400">
          Chỉ xóa được khi chưa nick nào dùng. Nhân vật không dùng nữa cứ để đó cũng vô hại —
          nó không xuất hiện ở đâu ngoài ô chọn lúc thêm nick.
        </p>
        <DeleteEntityButton
          action={deletePersona.bind(null, persona.id)}
          label={`nhân vật "${persona.name}"`}
          redirectTo="/personas"
        />
      </Card>
    </>
  );
}
