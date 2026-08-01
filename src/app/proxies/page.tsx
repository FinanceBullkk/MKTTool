import { ActionForm, Field, SelectField } from "@/components/ui/form-controls";
import {
  Card,
  DataTable,
  EmptyState,
  PageHeading,
  StatusBadge,
} from "@/components/ui/page-section";
import { createProxy } from "@/lib/accounts/account-actions";
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
        {proxies.length === 0 ? (
          <EmptyState>
            Chưa có proxy nào. Mua proxy TRƯỚC khi mua nick — đăng nhập nick cổ từ IP sai quốc gia
            là cách phổ biến nhất để đốt tiền.
          </EmptyState>
        ) : (
          <DataTable headers={["Nhãn", "Địa chỉ", "Quốc gia", "Loại", "Nick đang gắn"]}>
            {proxies.map((proxy) => (
              <tr key={proxy.id}>
                <td className="py-2 pr-4 font-medium">{proxy.label}</td>
                <td className="py-2 pr-4 font-mono text-xs text-neutral-600 dark:text-neutral-400">
                  {proxy.host}:{proxy.port}
                </td>
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
              </tr>
            ))}
          </DataTable>
        )}
      </Card>

      <Card title="Thêm proxy">
        <ActionForm action={createProxy} submitLabel="Thêm proxy">
          <Field label="Nhãn" name="label" required placeholder="reddit-01-us" />
          <Field label="Host" name="host" required placeholder="1.2.3.4" />
          <Field label="Port" name="port" type="number" required placeholder="8080" />
          <Field label="Username" name="username" required />
          <Field label="Mật khẩu" name="password" type="password" required />
          <Field
            label="Quốc gia"
            name="country"
            required
            placeholder="US"
            hint="Phải khớp quốc gia nick từng hoạt động"
          />
          <SelectField
            label="Loại"
            name="type"
            required
            defaultValue="STATIC_ISP"
            options={[
              { value: "STATIC_ISP", label: "Static ISP / Residential tĩnh" },
              { value: "MOBILE", label: "Mobile 4G" },
            ]}
          />
          <Field label="Ghi chú" name="notes" placeholder="Nhà cung cấp, ngày hết hạn…" />
        </ActionForm>
      </Card>
    </>
  );
}
