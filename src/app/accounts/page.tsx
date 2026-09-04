import Link from "next/link";
import {
  Card,
  DataTable,
  EmptyState,
  PageHeading,
  PageShell,
  StatusBadge,
} from "@/components/ui/page-section";
import { AccountFormFields } from "@/components/vault/account-form-fields";
import { AccountReadinessCell } from "@/components/vault/account-readiness-badge";
import { AccountVaultForm } from "@/components/vault/account-vault-form";
import { describeAccountReadiness } from "@/lib/accounts/account-readiness";
import { createAccount } from "@/lib/accounts/vault-create-actions";
import { readAdminContactEmail } from "@/lib/auth/allowed-emails";
import { readActor } from "@/lib/auth/require-actor";
import {
  accountAgeInDays,
  coldStartDaysRemaining,
  defaultColdStartDayKey,
  getStatusPresentation,
} from "@/lib/accounts/account-status";
import { prisma } from "@/lib/db/prisma-client";

export const dynamic = "force-dynamic";

export default async function AccountsPage() {
  const viewer = await readActor();

  const [accounts, freeProxies, teamMembers] = await Promise.all([
    prisma.account.findMany({
      include: {
        proxy: true,
        owner: { select: { email: true } },
        device: { select: { name: true, userId: true, revokedAt: true } },
      },
      orderBy: [{ platform: "asc" }, { username: "asc" }],
    }),
    // Chỉ hiện proxy chưa gắn nick — ràng buộc 1:1 nằm ở DB, đây chỉ là để UI đỡ gây nhầm.
    prisma.proxy.findMany({ where: { account: null }, orderBy: { label: "asc" } }),
    // Chỉ ADMIN cần danh sách này (giao nick cho người khác ngay lúc tạo), nhưng truy vấn vẫn
    // chạy cho mọi người: một lượt đọc bảng vài dòng rẻ hơn một nhánh `if` phải nhớ đồng bộ với
    // nhánh render bên dưới.
    prisma.user.findMany({ orderBy: { email: "asc" }, select: { id: true, email: true } }),
  ]);

  // Nick có vấn đề đẩy lên đầu.
  const sorted = [...accounts].sort(
    (a, b) => getStatusPresentation(a.status).severity - getStatusPresentation(b.status).severity,
  );

  const canCreate = freeProxies.length > 0;
  const defaultColdStartUntil = defaultColdStartDayKey();
  const adminContactEmail = readAdminContactEmail();

  return (
    <PageShell>
      <PageHeading
        title="Nick vault"
        description="Assign ownership, a Relay PC, and one dedicated proxy to every browser-backed identity."
      />

      <div className="mb-6 grid grid-cols-3 gap-2 sm:gap-3">
        <SummaryMetric label="Total nicks" value={accounts.length} />
        <SummaryMetric
          label="Ready to operate"
          value={accounts.filter((account) => describeAccountReadiness(account).ready).length}
        />
        <SummaryMetric label="Unassigned proxies" value={freeProxies.length} />
      </div>

      <Card title={`All nicks - ${accounts.length}`}>
        {sorted.length === 0 ? (
          <EmptyState>
            No nicks yet. Add a proxy first, then create the first browser-backed identity below.
          </EmptyState>
        ) : (
          <DataTable
            headers={[
              "Nick",
              "Readiness",
              "Owner & Relay PC",
              "Proxy",
              "Lifecycle",
              "",
            ]}
          >
            {sorted.map((account) => {
              const presentation = getStatusPresentation(account.status);
              const coldDays = coldStartDaysRemaining(account.coldStartUntil);
              const age = accountAgeInDays(account.platformCreatedAt);

              return (
                <tr key={account.id}>
                  <td className="py-3 pr-4 align-top">
                    <Link
                      href={`/accounts/${account.id}`}
                      className="font-semibold text-white hover:text-amber-300"
                    >
                      {account.username}
                    </Link>
                    <span className="mt-1 block text-xs uppercase tracking-wide text-neutral-500">
                      {account.platform}
                    </span>
                  </td>
                  <td className="py-3 pr-4 align-top">
                    <AccountReadinessCell readiness={describeAccountReadiness(account)} />
                  </td>
                  <td className="py-3 pr-4 align-top text-sm text-neutral-300">
                    <span className="block">
                      {account.owner?.email ?? "Owner not assigned"}
                      {account.ownerId === viewer?.userId ? (
                        <span className="ml-1 text-xs font-medium text-emerald-400">(you)</span>
                      ) : null}
                    </span>
                    <span
                      className={`mt-1 block text-xs ${
                        account.device?.revokedAt ? "text-red-400" : "text-neutral-500"
                      }`}
                    >
                      {account.device
                        ? `${account.device.name}${account.device.revokedAt ? " (revoked)" : ""}`
                        : "Relay PC not assigned"}
                    </span>
                  </td>
                  <td className="py-3 pr-4 align-top">
                    <span className="block font-medium text-neutral-200">
                      {account.proxy ? account.proxy.label : "Proxy not assigned"}
                    </span>
                    <span className="mt-1 block font-mono text-xs text-neutral-500">
                      {account.proxy?.country ?? "Required before launch"}
                    </span>
                  </td>
                  <td className="py-3 pr-4 align-top">
                    <StatusBadge label={presentation.label} className={presentation.className} />
                    {coldDays > 0 ? (
                      <span className="mt-1 block text-xs text-neutral-500">
                        Cold start: {coldDays} days remaining
                      </span>
                    ) : null}
                    <span className="mt-1 block text-xs text-neutral-500">
                      {age === null ? "Age not recorded" : `${age} days old`} · {account.karma} karma
                    </span>
                  </td>
                  <td className="py-3 text-right align-top">
                    <Link
                      href={`/accounts/${account.id}`}
                      className="inline-flex min-h-9 items-center rounded-lg border border-white/10 px-3 text-xs font-semibold text-neutral-200 hover:border-amber-400/40 hover:text-amber-200"
                    >
                      Open
                    </Link>
                  </td>
                </tr>
              );
            })}
          </DataTable>
        )}
      </Card>

      <Card title="Add a nick">
        {!canCreate ? (
          <EmptyState>
            {viewer?.role === "ADMIN" ? (
              <>
                At least one unassigned proxy is required before adding a browser-backed nick.{" "}
                <Link href="/proxies" className="underline">
                  Add proxy
                </Link>
              </>
            ) : (
              <>
                No unassigned proxy is available. ADMIN is responsible for importing and assigning
                proxies; contact the administrator at{" "}
                <a href={`mailto:${adminContactEmail}`} className="underline">
                  {adminContactEmail}
                </a>{" "}
                and wait for a proxy to be prepared.
              </>
            )}
          </EmptyState>
        ) : (
          <details className="group rounded-xl border border-white/[0.08] bg-black/10">
            <summary className="flex min-h-11 cursor-pointer list-none items-center justify-between px-4 text-sm font-semibold text-neutral-200 marker:content-none">
              Create a browser-backed nick
              <span className="text-lg text-neutral-500 transition-transform group-open:rotate-45">+</span>
            </summary>
            <div className="border-t border-white/[0.08] p-4 sm:p-5">
              <AccountVaultForm action={createAccount} submitLabel="Add nick">
                <AccountFormFields
                  proxies={freeProxies.map((proxy) => ({
                    id: proxy.id,
                    label: `${proxy.label} - ${proxy.country}`,
                  }))}
                  defaultColdStartUntil={defaultColdStartUntil}
                  viewer={
                    viewer
                      ? {
                          userId: viewer.userId,
                          email: viewer.email,
                          isAdmin: viewer.role === "ADMIN",
                        }
                      : undefined
                  }
                  teamMembers={teamMembers}
                />
              </AccountVaultForm>
            </div>
          </details>
        )}
      </Card>
    </PageShell>
  );
}

function SummaryMetric({ label, value }: { label: string; value: number }) {
  return (
    <div className="app-surface rounded-xl px-3 py-3 sm:px-4">
      <span className="text-[11px] font-medium leading-4 text-neutral-500 sm:text-xs">{label}</span>
      <strong className="mt-1 block text-xl font-semibold text-white sm:text-2xl">{value}</strong>
    </div>
  );
}
