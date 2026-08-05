import Link from "next/link";
import {
  Card,
  DataTable,
  EmptyState,
  PageHeading,
  StatusBadge,
} from "@/components/ui/page-section";
import { AccountFormFields } from "@/components/vault/account-form-fields";
import { AccountVaultForm } from "@/components/vault/account-vault-form";
import { createAccount } from "@/lib/accounts/vault-create-actions";
import {
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
                    {account.proxy ? `${account.proxy.label} (${account.proxy.country})` : "—"}
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
          <AccountVaultForm action={createAccount} submitLabel="Thêm nick">
            <AccountFormFields
              personas={personas.map((persona) => ({ id: persona.id, label: persona.name }))}
              proxies={freeProxies.map((proxy) => ({
                id: proxy.id,
                label: `${proxy.label} — ${proxy.country}`,
              }))}
            />
          </AccountVaultForm>
        )}
      </Card>
    </>
  );
}
