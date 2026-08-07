import Link from "next/link";
import { ObserverProxySection } from "@/components/health/observer-proxy-section";
import { CheckAllProxiesButton, CheckOneProxyButton } from "@/components/proxies/proxy-check-controls";
import { ProxyLastCheckCell } from "@/components/proxies/proxy-last-check-cell";
import { ProxySpeedCell } from "@/components/proxies/proxy-speed-cell";
import { MeasureProxySpeedButton } from "@/components/proxies/proxy-speed-controls";
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
import { readActor } from "@/lib/auth/require-actor";
import { prisma } from "@/lib/db/prisma-client";

export const dynamic = "force-dynamic";

export default async function ProxiesPage() {
  const [proxies, viewer] = await Promise.all([
    prisma.proxy.findMany({
      orderBy: { label: "asc" },
      include: { account: { select: { username: true, platform: true } } },
    }),
    readActor(),
  ]);

  const unassigned = proxies.filter((proxy) => !proxy.account).length;
  const isAdmin = viewer?.role === "ADMIN";

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
              "Tốc độ",
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
                <td className="py-2 pr-4">
                  <ProxySpeedCell
                    measuredAt={proxy.lastSpeedAt}
                    mbps={proxy.lastSpeedMbps}
                    detail={proxy.lastSpeedDetail}
                  />
                </td>
                <td className="py-2 pr-4 text-right">
                  <div className="flex items-start justify-end gap-2">
                    <CheckOneProxyButton proxyId={proxy.id} />
                    {/* Đo tốc độ đốt 1 MB quota trả tiền mỗi lượt, nên chỉ ADMIN. Nút "Kiểm"
                        bên cạnh tốn vài KB nên ai cũng bấm được. */}
                    {isAdmin ? <MeasureProxySpeedButton proxyId={proxy.id} /> : null}
                    <Link
                      href={`/proxies/${proxy.id}`}
                      className="text-xs text-neutral-500 hover:underline"
                    >
                      {isAdmin ? "Sửa" : "Xem"}
                    </Link>
                  </div>
                </td>
              </tr>
            ))}
          </DataTable>
        )}
      </Card>

      {/* Ẩn form chỉ để dọn màn hình; chặn THẬT nằm ở `adminAction` bọc ngoài `createProxy`. */}
      {isAdmin ? (
        <Card title="Thêm proxy">
          <ActionForm action={createProxy} submitLabel="Thêm proxy">
            <ProxyFormFields />
          </ActionForm>
        </Card>
      ) : (
        <Card title="Thêm proxy">
          <p className="text-sm text-neutral-600 dark:text-neutral-400">
            Kho proxy do quản trị viên giữ: mật khẩu proxy không có bản thứ hai ở đâu ngoài kho
            này, và mua proxy là việc phải đi cùng việc mua nick. Bạn vẫn <strong>kiểm</strong>{" "}
            được mọi proxy ở bảng trên — nút đó chỉ tốn vài KB nên không gác.
          </p>
        </Card>
      )}

      <ObserverProxySection />
    </>
  );
}
