import Link from "next/link";
import { ObserverProxySection } from "@/components/health/observer-proxy-section";
import { CheckAllProxiesButton, CheckOneProxyButton } from "@/components/proxies/proxy-check-controls";
import { ProxyLastCheckCell } from "@/components/proxies/proxy-last-check-cell";
import { ActionForm } from "@/components/ui/form-controls";
import {
  Card,
  DataTable,
  EmptyState,
  PageHeading,
  StatusBadge,
} from "@/components/ui/page-section";
import { ProxyFormFields } from "@/components/vault/proxy-form-fields";
import { createProxy } from "@/lib/accounts/vault-create-actions";
import { prisma } from "@/lib/db/prisma-client";

export const dynamic = "force-dynamic";

export default async function ProxiesPage() {
  const proxies = await prisma.proxy.findMany({
    orderBy: { label: "asc" },
    include: { account: { select: { username: true, platform: true } } },
  });

  const unassigned = proxies.filter((proxy) => !proxy.account).length;

  return (
    <>
      <PageHeading
        title="Proxy"
        description="Proxy tĩnh, mỗi IP gắn đúng một nick, không bao giờ xoay. Reddit shadowban tức thì nếu hai nick chung IP cùng tương tác một bài."
      />

      <Card title={`Danh sách — ${proxies.length} IP, ${unassigned} chưa gắn nick`}>
        {proxies.length > 0 ? (
          <div className="mb-4">
            <CheckAllProxiesButton count={proxies.length} />
          </div>
        ) : null}

        {proxies.length === 0 ? (
          <EmptyState>
            Chưa có proxy nào. Mua proxy TRƯỚC khi mua nick — đăng nhập nick cổ từ IP sai quốc gia
            là cách phổ biến nhất để đốt tiền.
          </EmptyState>
        ) : (
          <DataTable
            headers={[
              "Nhãn",
              "Địa chỉ",
              "Giao thức",
              "Quốc gia",
              "Loại",
              "Nick đang gắn",
              "Lần kiểm gần nhất",
              "",
            ]}
          >
            {proxies.map((proxy) => (
              <tr key={proxy.id}>
                <td className="py-2 pr-4 font-medium">
                  <Link href={`/proxies/${proxy.id}`} className="hover:underline">
                    {proxy.label}
                  </Link>
                </td>
                <td className="py-2 pr-4 font-mono text-xs text-neutral-600 dark:text-neutral-400">
                  {proxy.host}:{proxy.port}
                </td>
                <td className="py-2 pr-4 font-mono text-xs">{proxy.protocol}</td>
                <td className="py-2 pr-4">{proxy.country}</td>
                <td className="py-2 pr-4 text-neutral-600 dark:text-neutral-400">{proxy.type}</td>
                <td className="py-2 pr-4">
                  {proxy.account ? (
                    <span className="text-neutral-700 dark:text-neutral-300">
                      {proxy.account.platform} / {proxy.account.username}
                    </span>
                  ) : (
                    <StatusBadge
                      label="chưa gắn"
                      className="bg-neutral-200 text-neutral-600 dark:bg-neutral-800 dark:text-neutral-400"
                    />
                  )}
                </td>
                <td className="py-2 pr-4">
                  <ProxyLastCheckCell
                    verdict={proxy.lastCheckVerdict}
                    checkedAt={proxy.lastCheckedAt}
                    exitIp={proxy.lastExitIp}
                  />
                </td>
                <td className="py-2 pr-4 text-right">
                  <div className="flex items-start justify-end gap-2">
                    <CheckOneProxyButton proxyId={proxy.id} />
                    <Link
                      href={`/proxies/${proxy.id}`}
                      className="text-xs text-neutral-500 hover:underline"
                    >
                      Sửa
                    </Link>
                  </div>
                </td>
              </tr>
            ))}
          </DataTable>
        )}
      </Card>

      <Card title="Thêm proxy">
        <ActionForm action={createProxy} submitLabel="Thêm proxy">
          <ProxyFormFields />
        </ActionForm>
      </Card>

      <ObserverProxySection />
    </>
  );
}
