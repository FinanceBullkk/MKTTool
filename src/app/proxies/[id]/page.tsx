import Link from "next/link";
import { notFound } from "next/navigation";
import { DeleteEntityButton } from "@/components/ui/delete-entity-button";
import { ActionForm } from "@/components/ui/form-controls";
import { Card, PageHeading } from "@/components/ui/page-section";
import { ProxyFormFields } from "@/components/vault/proxy-form-fields";
import { deleteProxy } from "@/lib/accounts/vault-delete-actions";
import { updateProxy } from "@/lib/accounts/vault-update-actions";
import { readActor } from "@/lib/auth/require-actor";
import { prisma } from "@/lib/db/prisma-client";

export const dynamic = "force-dynamic";

export default async function ProxyDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;

  const [proxy, viewer] = await Promise.all([
    prisma.proxy.findUnique({
      where: { id },
      include: { account: { select: { id: true, username: true, platform: true } } },
    }),
    readActor(),
  ]);

  if (!proxy) notFound();

  const isAdmin = viewer?.role === "ADMIN";

  return (
    <>
      <Link href="/proxies" className="mb-4 inline-block text-sm text-neutral-500 hover:underline">
        ← Back to proxy list
      </Link>

      <PageHeading
        title={proxy.label}
        description={`${proxy.protocol}://${proxy.host}:${proxy.port} (${proxy.country})`}
      />

      {proxy.account ? (
        <div className="mb-6 rounded-md border border-neutral-200 px-4 py-3 text-sm dark:border-neutral-800">
          Assigned to nick{" "}
          <Link href={`/accounts/${proxy.account.id}`} className="font-medium underline">
            {proxy.account.username}
          </Link>{" "}
          ({proxy.account.platform}). Changing the host, port, or password here applies the new
          value the next time this nick&apos;s browser profile opens.
        </div>
      ) : (
        <div className="mb-6 rounded-md border border-dashed border-neutral-300 px-4 py-3 text-sm text-neutral-500 dark:border-neutral-700">
          Not assigned to a nick.
        </div>
      )}

      {/* Chỉ quản trị viên sửa/xóa được kho proxy — mật khẩu proxy không có bản thứ hai ở đâu
          cả, nên xóa nhầm là mất tiền thật. Ẩn thẻ chỉ để dọn màn hình; chặn THẬT nằm ở
          `adminAction` bọc ngoài hai server action, nên gọi thẳng endpoint vẫn bị từ chối. */}
      {isAdmin ? (
        <>
          <Card title="Edit proxy">
            <ActionForm action={updateProxy} submitLabel="Save">
              <input type="hidden" name="id" value={proxy.id} />
              <ProxyFormFields defaults={proxy} />
            </ActionForm>
          </Card>

          <Card title="Delete proxy">
            <p className="mb-3 text-sm text-neutral-600 dark:text-neutral-400">
              A proxy can be deleted only when it is not assigned to a nick. Deleting an assigned
              proxy removes that nick&apos;s dedicated network route, so assign the nick to another
              proxy first.
            </p>
            <DeleteEntityButton
              action={deleteProxy.bind(null, proxy.id)}
              label={`proxy "${proxy.label}"`}
              redirectTo="/proxies"
            />
          </Card>
        </>
      ) : (
        <Card title="Edit proxy">
          <p className="text-sm text-neutral-600 dark:text-neutral-400">
            Only administrators can edit the proxy vault. The proxy password has no second copy
            outside this vault, so an incorrect host or port can disable a working proxy. Ask an
            administrator to make changes. You can still <strong>check</strong> this proxy in the{" "}
            <Link href="/proxies" className="underline">
              proxy list
            </Link>
            .
          </p>
        </Card>
      )}
    </>
  );
}
