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
        ← Về danh sách
      </Link>

      <PageHeading
        title={proxy.label}
        description={`${proxy.protocol}://${proxy.host}:${proxy.port} (${proxy.country})`}
      />

      {proxy.account ? (
        <div className="mb-6 rounded-md border border-neutral-200 px-4 py-3 text-sm dark:border-neutral-800">
          Đang gắn với nick{" "}
          <Link href={`/accounts/${proxy.account.id}`} className="font-medium underline">
            {proxy.account.username}
          </Link>{" "}
          ({proxy.account.platform}). Sửa host/port/mật khẩu ở đây là lần mở profile tiếp theo
          đẩy giá trị mới sang trình duyệt.
        </div>
      ) : (
        <div className="mb-6 rounded-md border border-dashed border-neutral-300 px-4 py-3 text-sm text-neutral-500 dark:border-neutral-700">
          Chưa gắn nick nào.
        </div>
      )}

      {/* Chỉ quản trị viên sửa/xóa được kho proxy — mật khẩu proxy không có bản thứ hai ở đâu
          cả, nên xóa nhầm là mất tiền thật. Ẩn thẻ chỉ để dọn màn hình; chặn THẬT nằm ở
          `adminAction` bọc ngoài hai server action, nên gọi thẳng endpoint vẫn bị từ chối. */}
      {isAdmin ? (
        <>
          <Card title="Sửa proxy">
            <ActionForm action={updateProxy} submitLabel="Lưu">
              <input type="hidden" name="id" value={proxy.id} />
              <ProxyFormFields defaults={proxy} />
            </ActionForm>
          </Card>

          <Card title="Xóa">
            <p className="mb-3 text-sm text-neutral-600 dark:text-neutral-400">
              Chỉ xóa được khi chưa gắn nick nào. Proxy đang gắn nick mà xóa là nick đó mất đường
              ra mạng riêng — gán nick sang proxy khác trước.
            </p>
            <DeleteEntityButton
              action={deleteProxy.bind(null, proxy.id)}
              label={`proxy "${proxy.label}"`}
              redirectTo="/proxies"
            />
          </Card>
        </>
      ) : (
        <Card title="Sửa proxy">
          <p className="text-sm text-neutral-600 dark:text-neutral-400">
            Chỉ quản trị viên sửa được kho proxy. Mật khẩu proxy không có bản thứ hai ở đâu ngoài
            kho này, nên một lượt sửa nhầm host/port là mất một proxy đang chạy. Cần đổi thì nhắn
            quản trị viên — bạn vẫn <strong>kiểm</strong> được proxy này ở{" "}
            <Link href="/proxies" className="underline">
              danh sách proxy
            </Link>
            .
          </p>
        </Card>
      )}
    </>
  );
}
