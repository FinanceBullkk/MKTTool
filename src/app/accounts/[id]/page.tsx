import Link from "next/link";
import { notFound } from "next/navigation";
import { DeleteEntityButton } from "@/components/ui/delete-entity-button";
import { ActionForm } from "@/components/ui/form-controls";
import { Card, PageHeading, StatusBadge } from "@/components/ui/page-section";
import { AccountFormFields } from "@/components/vault/account-form-fields";
import {
  accountAgeInDays,
  coldStartDaysRemaining,
  getStatusPresentation,
} from "@/lib/accounts/account-status";
import { deleteAccount } from "@/lib/accounts/vault-delete-actions";
import { updateAccount } from "@/lib/accounts/vault-update-actions";
import { prisma } from "@/lib/db/prisma-client";
import { AccountVaultActionsPanel } from "./account-vault-actions-panel";

export const dynamic = "force-dynamic";

function formatDate(value: Date | null): string {
  return value ? value.toLocaleDateString("vi-VN") : "—";
}

export default async function AccountDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;

  const account = await prisma.account.findUnique({
    where: { id },
    include: { persona: true, proxy: true },
  });

  if (!account) notFound();

  const presentation = getStatusPresentation(account.status);
  const coldDays = coldStartDaysRemaining(account.coldStartUntil);
  const age = accountAgeInDays(account.platformCreatedAt);

  const [auditLogs, personas, selectableProxies] = await Promise.all([
    prisma.auditLog.findMany({ where: { accountId: id }, orderBy: { at: "desc" }, take: 20 }),
    prisma.persona.findMany({ orderBy: { name: "asc" }, select: { id: true, name: true } }),
    // Proxy còn trống CỘNG proxy đang gắn cho chính nick này — thiếu vế sau thì mở form sửa
    // ra là ô proxy trống rỗng, bấm lưu một phát là đổi mất proxy của nick.
    prisma.proxy.findMany({
      where: { OR: [{ account: null }, { account: { id } }] },
      orderBy: { label: "asc" },
      select: { id: true, label: true, country: true },
    }),
  ]);

  const facts: [string, string][] = [
    ["Nền tảng", account.platform],
    ["Nhân vật", `${account.persona.name} — ${account.persona.voice}`],
    ["Mảng nội dung", account.persona.contentAngle],
    [
      "Proxy",
      `${account.proxy.label} — ${account.proxy.protocol}://${account.proxy.host}:${account.proxy.port} ` +
        `(${account.proxy.country})`,
    ],
    ["Profile antidetect", account.antidetectProfileId],
    ["Email gốc", account.emailAddress],
    ["Karma", String(account.karma)],
    ["Tuổi nick", age === null ? "—" : `${age} ngày`],
    ["Ngày tạo trên nền tảng", formatDate(account.platformCreatedAt)],
    ["Ngày mua", formatDate(account.purchasedAt)],
    ["Cold-start tới", account.coldStartUntil ? formatDate(account.coldStartUntil) : "—"],
    ["Hoạt động gần nhất", account.lastActionAt ? account.lastActionAt.toLocaleString("vi-VN") : "—"],
  ];

  return (
    <>
      <Link href="/accounts" className="mb-4 inline-block text-sm text-neutral-500 hover:underline">
        ← Về danh sách
      </Link>

      <PageHeading title={account.username} />

      <div className="mb-6 flex flex-wrap items-center gap-3">
        <StatusBadge label={presentation.label} className={presentation.className} />
        {coldDays > 0 ? (
          <span className="text-sm text-neutral-500">cold-start còn {coldDays} ngày</span>
        ) : null}
        <span className="text-sm text-neutral-600 dark:text-neutral-400">{presentation.hint}</span>
      </div>

      {account.quarantineReason ? (
        <div className="mb-6 rounded-md border border-red-300 bg-red-50 px-4 py-3 text-sm text-red-800 dark:border-red-900 dark:bg-red-950 dark:text-red-300">
          <strong>Lý do cách ly:</strong> {account.quarantineReason}
        </div>
      ) : null}

      <Card title="Thao tác">
        <AccountVaultActionsPanel
          accountId={account.id}
          hasTotp={account.totpSecretEnc !== null}
          canLaunch={presentation.canLaunch}
          launchBlockedReason={presentation.hint}
        />
      </Card>

      <Card title="Thông tin">
        <dl className="grid gap-x-8 gap-y-3 sm:grid-cols-2">
          {facts.map(([label, value]) => (
            <div key={label}>
              <dt className="text-xs uppercase tracking-wide text-neutral-500">{label}</dt>
              <dd className="mt-0.5 break-words text-sm">{value}</dd>
            </div>
          ))}
        </dl>
        {account.purchaseNote ? (
          <p className="mt-4 text-sm text-neutral-600 dark:text-neutral-400">
            <span className="text-xs uppercase tracking-wide text-neutral-500">Ghi chú mua: </span>
            {account.purchaseNote}
          </p>
        ) : null}
      </Card>

      <Card title="Sửa nick">
        <p className="mb-4 text-sm text-neutral-600 dark:text-neutral-400">
          Karma, trạng thái và cold-start là đầu vào của luật 1, 2 và 3 — sửa xong là mọi job
          đang chờ của nick này được chấm lại ngay, job hết an toàn chuyển sang BỊ CHẶN.
          Nền tảng không đổi được sau khi tạo.
        </p>
        <ActionForm action={updateAccount} submitLabel="Lưu">
          <input type="hidden" name="id" value={account.id} />
          <AccountFormFields
            personas={personas.map((persona) => ({ id: persona.id, label: persona.name }))}
            proxies={selectableProxies.map((proxy) => ({
              id: proxy.id,
              label: `${proxy.label} — ${proxy.country}`,
            }))}
            defaults={account}
          />
        </ActionForm>
      </Card>

      <Card title="Xóa nick">
        <p className="mb-3 text-sm text-neutral-600 dark:text-neutral-400">
          Chỉ xóa được khi nick chưa có job, tương tác hay kết nối Facebook nào. Nick không dùng
          nữa thì đổi trạng thái sang &quot;Đã chết&quot; ở form trên — lịch sử giữ nguyên để bộ
          luật còn đếm hạn mức và tỷ lệ promo cho những nick còn lại.
        </p>
        <DeleteEntityButton
          action={deleteAccount.bind(null, account.id)}
          label={`nick "${account.username}"`}
          redirectTo="/accounts"
        />
      </Card>

      <Card title="Nhật ký gần đây">
        {auditLogs.length === 0 ? (
          <p className="text-sm text-neutral-500">Chưa có thao tác nào được ghi nhận.</p>
        ) : (
          <ul className="space-y-1 text-sm">
            {auditLogs.map((log) => (
              <li key={log.id} className="flex gap-3">
                <span className="shrink-0 font-mono text-xs text-neutral-500">
                  {log.at.toLocaleString("vi-VN")}
                </span>
                <span>
                  {log.action}
                  {log.detail ? (
                    <span className="text-neutral-500"> — {log.detail}</span>
                  ) : null}
                </span>
              </li>
            ))}
          </ul>
        )}
      </Card>
    </>
  );
}
