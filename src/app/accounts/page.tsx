import Link from "next/link";
import { ActionForm, Field, SelectField } from "@/components/ui/form-controls";
import {
  Card,
  DataTable,
  EmptyState,
  PageHeading,
  StatusBadge,
} from "@/components/ui/page-section";
import { createAccount } from "@/lib/accounts/account-actions";
import {
  ACCOUNT_STATUSES,
  accountAgeInDays,
  coldStartDaysRemaining,
  getStatusPresentation,
} from "@/lib/accounts/account-status";
import { prisma } from "@/lib/db/prisma-client";

export const dynamic = "force-dynamic";

export default async function AccountsPage() {
  const [accounts, personas, freeProxies] = await Promise.all([
    prisma.account.findMany({
      include: { persona: true, proxy: true },
      orderBy: [{ platform: "asc" }, { username: "asc" }],
    }),
    prisma.persona.findMany({ orderBy: { name: "asc" } }),
    // Chỉ hiện proxy chưa gắn nick — ràng buộc 1:1 nằm ở DB, đây chỉ là để UI đỡ gây nhầm.
    prisma.proxy.findMany({ where: { account: null }, orderBy: { label: "asc" } }),
  ]);

  // Nick có vấn đề đẩy lên đầu.
  const sorted = [...accounts].sort(
    (a, b) => getStatusPresentation(a.status).severity - getStatusPresentation(b.status).severity,
  );

  const canCreate = personas.length > 0 && freeProxies.length > 0;

  return (
    <>
      <PageHeading
        title="Tài khoản"
        description="Một nick = một proxy = một vân tay = một nhân vật. Ràng buộc này do database ép, không thể lách."
      />

      <Card title={`Danh sách — ${accounts.length} nick`}>
        {sorted.length === 0 ? (
          <EmptyState>Chưa có nick nào.</EmptyState>
        ) : (
          <DataTable
            headers={["Nick", "Nền tảng", "Trạng thái", "Nhân vật", "Proxy", "Karma", "Tuổi nick"]}
          >
            {sorted.map((account) => {
              const presentation = getStatusPresentation(account.status);
              const coldDays = coldStartDaysRemaining(account.coldStartUntil);
              const age = accountAgeInDays(account.platformCreatedAt);

              return (
                <tr key={account.id}>
                  <td className="py-2 pr-4 font-medium">
                    <Link href={`/accounts/${account.id}`} className="hover:underline">
                      {account.username}
                    </Link>
                  </td>
                  <td className="py-2 pr-4 text-xs text-neutral-600 dark:text-neutral-400">
                    {account.platform}
                  </td>
                  <td className="py-2 pr-4">
                    <StatusBadge label={presentation.label} className={presentation.className} />
                    {coldDays > 0 ? (
                      <span className="ml-2 text-xs text-neutral-500">còn {coldDays} ngày</span>
                    ) : null}
                  </td>
                  <td className="py-2 pr-4 text-neutral-600 dark:text-neutral-400">
                    {account.persona.name}
                  </td>
                  <td className="py-2 pr-4 font-mono text-xs text-neutral-600 dark:text-neutral-400">
                    {account.proxy.label} ({account.proxy.country})
                  </td>
                  <td className="py-2 pr-4">{account.karma}</td>
                  <td className="py-2 pr-4">{age === null ? "—" : `${age}d`}</td>
                </tr>
              );
            })}
          </DataTable>
        )}
      </Card>

      <Card title="Thêm nick">
        {!canCreate ? (
          <EmptyState>
            Cần có ít nhất 1 nhân vật và 1 proxy chưa gắn nick trước đã.{" "}
            {personas.length === 0 ? (
              <Link href="/personas" className="underline">
                Tạo nhân vật
              </Link>
            ) : null}{" "}
            {freeProxies.length === 0 ? (
              <Link href="/proxies" className="underline">
                Thêm proxy
              </Link>
            ) : null}
          </EmptyState>
        ) : (
          <ActionForm action={createAccount} submitLabel="Thêm nick">
            <SelectField
              label="Nền tảng"
              name="platform"
              required
              options={[
                { value: "REDDIT", label: "Reddit" },
                { value: "FACEBOOK", label: "Facebook" },
              ]}
            />
            <Field label="Username" name="username" required />
            <Field label="Mật khẩu nick" name="password" type="password" required />
            <Field
              label="Email gốc"
              name="emailAddress"
              type="email"
              required
              hint="Không có email gốc thì đừng mua nick — người bán lấy lại được"
            />
            <Field label="Mật khẩu email" name="emailPassword" type="password" required />
            <Field
              label="TOTP secret"
              name="totpSecret"
              hint="Chuỗi base32 khi bật 2FA. Để trống nếu chưa bật."
            />
            <Field
              label="Id profile antidetect"
              name="antidetectProfileId"
              required
              hint="Id profile bên MultiZen/AdsPower"
            />
            <SelectField
              label="Nhân vật"
              name="personaId"
              required
              options={personas.map((persona) => ({ value: persona.id, label: persona.name }))}
            />
            <SelectField
              label="Proxy"
              name="proxyId"
              required
              hint={`${freeProxies.length} proxy chưa gắn nick`}
              options={freeProxies.map((proxy) => ({
                value: proxy.id,
                label: `${proxy.label} — ${proxy.country}`,
              }))}
            />
            <SelectField
              label="Trạng thái"
              name="status"
              required
              defaultValue="COLD_START"
              options={ACCOUNT_STATUSES.map((status) => ({
                value: status,
                label: getStatusPresentation(status).label,
              }))}
            />
            <Field label="Karma" name="karma" type="number" defaultValue={0} />
            <Field
              label="Cold-start tới ngày"
              name="coldStartUntil"
              type="date"
              hint="Mua nick về thì đặt 14 ngày sau"
            />
            <Field
              label="Ngày tạo nick trên nền tảng"
              name="platformCreatedAt"
              type="date"
              hint="Dùng để kiểm tra điều kiện tuổi nick của subreddit"
            />
            <Field label="Ngày mua" name="purchasedAt" type="date" />
            <Field label="Ghi chú mua" name="purchaseNote" placeholder="Nguồn, giá, quốc gia gốc" />
          </ActionForm>
        )}
      </Card>
    </>
  );
}
