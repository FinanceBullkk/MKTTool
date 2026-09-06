import Link from "next/link";
import { CircleCheck, Monitor, Network, UserPlus, UserRound, UsersRound } from "lucide-react";
import { InlineDisclosure } from "@/components/ui/inline-disclosure";
import {
  Card,
  DataTable,
  Disclosure,
  EmptyState,
  PageHeading,
  PageShell,
  StatusBadge,
} from "@/components/ui/page-section";
import { SummaryMetric } from "@/components/ui/summary-metric";
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
  const readyAccountCount = accounts.filter(
    (account) => describeAccountReadiness(account).ready,
  ).length;

  return (
    <PageShell>
      <PageHeading
        title="Nick vault"
        description="Owner · Relay PC · dedicated proxy"
        eyebrow="Identity workspace"
        icon={UsersRound}
      />

      <div className="mb-6 grid grid-cols-3 gap-2 sm:gap-3">
        <SummaryMetric icon={UsersRound} label="Total nicks" value={accounts.length} />
        <SummaryMetric
          icon={CircleCheck}
          label="Ready to operate"
          value={readyAccountCount}
          tone={
            accounts.length === 0
              ? "neutral"
              : readyAccountCount === accounts.length
                ? "success"
                : "warning"
          }
        />
        <SummaryMetric icon={Network} label="Unassigned proxies" value={freeProxies.length} />
      </div>

      <Card
        title={`All nicks - ${accounts.length}`}
        description="Readiness and assignment lead; lifecycle details stay secondary."
        icon={UsersRound}
      >
        {sorted.length === 0 ? (
          <EmptyState title="No nicks in the team vault" icon={UsersRound}>
            No nicks yet. Add a proxy first, then create the first browser-backed identity below.
          </EmptyState>
        ) : (
          <DataTable
            headers={[
              "Nick",
              "Readiness",
              "Assignment",
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
                    <span className="mt-1 block text-xs uppercase tracking-wide text-neutral-400">
                      {account.platform}
                    </span>
                    <InlineDisclosure summary="Lifecycle details" className="mt-1">
                      <div className="space-y-2">
                        <StatusBadge label={presentation.label} className={presentation.className} />
                        {coldDays > 0 ? (
                          <p className="text-sm text-neutral-500">
                            Cold start: {coldDays} days remaining
                          </p>
                        ) : null}
                        <p className="text-sm text-neutral-500">
                          {age === null ? "Age not recorded" : `${age} days old`} · {account.karma} karma
                        </p>
                      </div>
                    </InlineDisclosure>
                  </td>
                  <td className="py-3 pr-4 align-top">
                    <AccountReadinessCell readiness={describeAccountReadiness(account)} />
                  </td>
                  <td className="py-3 pr-4 align-top">
                    <div className="space-y-2.5 text-sm">
                      <div className="flex min-w-0 items-start gap-2 text-neutral-300">
                        <UserRound size={15} className="mt-0.5 shrink-0 text-neutral-600" aria-hidden="true" />
                        <span className="min-w-0 break-all">
                          <span className="sr-only">Nick owner: </span>
                          {account.owner?.email ?? "Owner not assigned"}
                          {account.ownerId === viewer?.userId ? (
                            <span className="ml-1 text-xs font-medium text-emerald-400">(you)</span>
                          ) : null}
                        </span>
                      </div>
                      <div
                        className={`flex items-start gap-2 ${
                          account.device?.revokedAt ? "text-red-400" : "text-neutral-400"
                        }`}
                      >
                        <Monitor size={15} className="mt-0.5 shrink-0 text-neutral-600" aria-hidden="true" />
                        <span>
                          <span className="sr-only">Relay PC: </span>
                          {account.device
                            ? `${account.device.name}${account.device.revokedAt ? " (revoked)" : ""}`
                            : "Relay PC not assigned"}
                        </span>
                      </div>
                      <div className="flex items-start gap-2 text-neutral-400">
                        <Network size={15} className="mt-0.5 shrink-0 text-neutral-600" aria-hidden="true" />
                        <span>
                          <span className="sr-only">Proxy: </span>
                          {account.proxy
                            ? `${account.proxy.label} · ${account.proxy.country}`
                            : "Proxy not assigned"}
                        </span>
                      </div>
                    </div>
                  </td>
                  <td className="py-3 text-right align-top">
                    <Link
                      href={`/accounts/${account.id}`}
                      className="inline-flex min-h-11 items-center rounded-xl border border-white/10 px-3 text-sm font-semibold text-neutral-200 hover:border-amber-400/40 hover:text-amber-200"
                    >
                      Open nick
                    </Link>
                  </td>
                </tr>
              );
            })}
          </DataTable>
        )}
      </Card>

      <Card title="Add a nick" icon={UserPlus} tone="muted">
        {!canCreate ? (
          <EmptyState title="A dedicated proxy is required" icon={Network}>
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
          <Disclosure summary="Create a browser-backed nick">
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
          </Disclosure>
        )}
      </Card>
    </PageShell>
  );
}
