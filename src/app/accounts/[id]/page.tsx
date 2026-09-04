import { notFound } from "next/navigation";
import {
  Activity,
  CircleCheck,
  CircleDashed,
  Info,
  ListTree,
  PencilLine,
  ShieldAlert,
  Trash2,
  UserRound,
} from "lucide-react";
import { DeleteEntityButton } from "@/components/ui/delete-entity-button";
import {
  BackLink,
  Card,
  Disclosure,
  PageHeading,
  PageShell,
  StatusBadge,
} from "@/components/ui/page-section";
import { ProfileOperationalSignals } from "@/components/mktbrowser-ui/profile-operational-signals";
import { AccountClusterAssignmentForm } from "@/components/vault/account-cluster-assignment-form";
import { AccountFormFields } from "@/components/vault/account-form-fields";
import { AccountVaultForm } from "@/components/vault/account-vault-form";
import { AccountReadinessPanel } from "@/components/vault/account-readiness-badge";
import { AntidetectProfileCard } from "@/components/vault/antidetect-profile-card";
import { FirstLoginCard } from "@/components/vault/first-login-card";
import { assignAccountCluster } from "@/lib/accounts/account-owner-actions";
import { describeAccountReadiness } from "@/lib/accounts/account-readiness";
import {
  accountAgeInDays,
  coldStartDaysRemaining,
  getStatusPresentation,
  isQuarantinedStatus,
} from "@/lib/accounts/account-status";
import { deleteAccount } from "@/lib/accounts/vault-delete-actions";
import { updateAccount } from "@/lib/accounts/vault-update-actions";
import { readAdminContactEmail } from "@/lib/auth/allowed-emails";
import { readActor } from "@/lib/auth/require-actor";
import { prisma } from "@/lib/db/prisma-client";
import { formatFullDate, formatFullDateTime } from "@/lib/format/vietnamese-date-format";
import { platformFamily } from "@/lib/platforms/platform-family";
import { listActiveRelayDevices } from "@/lib/tickets/ticket-recipient-lookup";
import { AccountVaultActionsPanel } from "./account-vault-actions-panel";

export const dynamic = "force-dynamic";

function formatDate(value: Date | null): string {
  return value ? formatFullDate(value) : "—";
}

export default async function AccountDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;

  const account = await prisma.account.findUnique({
    where: { id },
    include: {
      proxy: true,
      owner: { select: { email: true } },
      device: { select: { name: true, revokedAt: true, userId: true } },
    },
  });

  if (!account) notFound();

  const viewer = await readActor();
  const isAdmin = viewer?.role === "ADMIN";
  const adminContactEmail = readAdminContactEmail();

  const presentation = getStatusPresentation(account.status);
  const coldDays = coldStartDaysRemaining(account.coldStartUntil);
  const age = accountAgeInDays(account.platformCreatedAt);
  const readiness = describeAccountReadiness(account);

  // Nick mở bằng trình duyệt thật (Reddit) thì mới có profile để đăng nhập vào, và mới đăng nhập
  // bằng tài khoản Google. Fanpage đăng qua Graph API — không profile, không đăng nhập lần đầu.
  // Dùng lại `platformFamily` chứ không so chuỗi tại chỗ: ranh giới này đã có một chủ.
  const browserNick = platformFamily(account.platform) === "REDDIT";
  const usesGoogleLogin = browserNick;

  const [auditLogs, selectableProxies, teamMembers, relayDevices, assignableDevices] =
    await Promise.all([
      prisma.auditLog.findMany({ where: { accountId: id }, orderBy: { at: "desc" }, take: 20 }),
      // Proxy còn trống CỘNG proxy đang gắn cho chính nick này — thiếu vế sau thì mở form sửa
      // ra là ô proxy trống rỗng, bấm lưu một phát là đổi mất proxy của nick.
      prisma.proxy.findMany({
        where: { OR: [{ account: null }, { account: { id } }] },
        orderBy: { label: "asc" },
        select: { id: true, label: true, country: true },
      }),
      // Chỉ người ĐÃ đăng nhập ít nhất một lần mới có hàng `User` để gán — xem chú thích ở
      // thẻ "Phân công cụm" bên dưới.
      prisma.user.findMany({ orderBy: { email: "asc" }, select: { id: true, email: true } }),
      // Máy của NGƯỜI ĐANG XEM — chỉ còn dùng cho nick chưa ghim máy (nick Facebook), vì nick đã
      // ghim thì máy chủ tự tra sổ. Chưa đăng nhập thì không có máy nào, panel nói rõ thiếu gì.
      viewer ? listActiveRelayDevices(viewer.userId) : Promise.resolve([]),
      // Mọi máy còn dùng được, kèm email chủ máy: thẻ phân công phải chọn được máy của BẤT KỲ ai
      // trong team, không chỉ của người đang xem. Nhãn mang email để nhìn là biết cặp có khớp
      // không; chặn thật thì nằm ở `assignAccountCluster`, nó từ chối cặp lệch kèm lý do.
      prisma.relayDevice.findMany({
        where: { revokedAt: null },
        orderBy: [{ createdAt: "desc" }],
        select: { id: true, name: true, user: { select: { email: true } } },
      }),
    ]);

  const proxyOptions = selectableProxies.map((proxy) => ({
    id: proxy.id,
    label: `${proxy.label} - ${proxy.country}`,
  }));

  const facts: [string, string][] = [
    ["Platform", account.platform],
    ["Writing voice", account.voice ?? "Not recorded"],
    ["Content focus", account.contentAngle ?? "Not recorded"],
    [
      "Proxy",
      account.proxy
        ? `${account.proxy.label} — ${account.proxy.protocol}://${account.proxy.host}:${account.proxy.port} ` +
          `(${account.proxy.country})`
        : "Not assigned (Facebook Pages using the Graph API do not need one)",
    ],
    [
      "Nick owner",
      account.owner
        ? account.owner.email
        : "Not assigned (only administrators can read the password and OTP)",
    ],
    [
      "Browser profile",
      account.antidetectProfileId ?? "Missing (the browser profile cannot be opened)",
    ],
    [
      "First sign-in",
      account.firstLoginAt
        ? formatFullDateTime(account.firstLoginAt)
        : browserNick && account.antidetectProfileId
          ? "Not completed (the browser profile has no signed-in session)"
          : "—",
    ],
    [
      "Relay PC",
      account.device
        ? `${account.device.name}${account.device.revokedAt ? " - REVOKED, reassign it" : ""}`
        : "Not assigned (the browser profile is valid only on the Relay PC that created it)",
    ],
    ["Original email", account.emailAddress],
    ["Karma", String(account.karma)],
    ["Nick age", age === null ? "—" : `${age} days`],
    ["Platform creation date", formatDate(account.platformCreatedAt)],
    ["Purchase date", formatDate(account.purchasedAt)],
    ["Cold-start until", account.coldStartUntil ? formatDate(account.coldStartUntil) : "—"],
    ["Latest activity", account.lastActionAt ? formatFullDateTime(account.lastActionAt) : "—"],
  ];

  return (
    <PageShell>
      <BackLink href="/accounts">Nick vault</BackLink>

      <PageHeading
        title={account.username}
        eyebrow={account.platform}
        description={presentation.hint}
        icon={UserRound}
        action={<StatusBadge label={presentation.label} className={presentation.className} />}
      />

      <div className="mb-5 grid gap-2 sm:grid-cols-3">
        <div className="app-surface flex items-center gap-3 rounded-xl p-3.5">
          <span className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-lg ${readiness.ready ? "bg-emerald-400/10 text-emerald-300" : readiness.waiting ? "bg-amber-400/10 text-amber-300" : "bg-red-400/10 text-red-300"}`}>
            {readiness.ready ? <CircleCheck size={17} /> : <CircleDashed size={17} />}
          </span>
          <div>
            <p className="text-[10px] font-semibold uppercase tracking-[0.12em] text-neutral-600">Readiness</p>
            <p className="mt-0.5 text-sm font-semibold text-neutral-200">
              {readiness.ready ? "Configuration ready" : readiness.waiting ? "Waiting" : `${readiness.blockers.length} blockers`}
            </p>
          </div>
        </div>
        <div className="app-surface flex items-center gap-3 rounded-xl p-3.5">
          <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-white/[0.045] text-neutral-400">
            <Activity size={17} />
          </span>
          <div>
            <p className="text-[10px] font-semibold uppercase tracking-[0.12em] text-neutral-600">Lifecycle</p>
            <p className="mt-0.5 text-sm font-semibold text-neutral-200">{presentation.label}</p>
          </div>
        </div>
        <div className="app-surface flex items-center gap-3 rounded-xl p-3.5">
          <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-white/[0.045] text-neutral-400">
            <ListTree size={17} />
          </span>
          <div>
            <p className="text-[10px] font-semibold uppercase tracking-[0.12em] text-neutral-600">Cold-start</p>
            <p className="mt-0.5 text-sm font-semibold text-neutral-200">
              {coldDays > 0 ? `${coldDays} days remaining` : "Complete"}
            </p>
          </div>
        </div>
      </div>

      <ProfileOperationalSignals
        ownerEmail={account.owner?.email ?? null}
        relayPcName={account.device?.name ?? null}
        proxy={
          account.proxy
            ? {
                country: account.proxy.country,
                label: account.proxy.label,
                status: account.proxy.lastCheckVerdict ?? "Never checked",
                healthy: account.proxy.lastCheckVerdict === "ALIVE",
              }
            : null
        }
      />

      <Disclosure summary="Operational boundary" icon={Info} className="mb-5 mt-3">
        <p className="leading-6">
          These states describe configuration and permissions. Sign-in, OTP/CAPTCHA, and typing
          remain human-controlled; they do not prove browser identity isolation.
        </p>
      </Disclosure>

      {/* Chỉ hiện khi nick THẬT SỰ đang bị cách ly. Bản ghi cũ có thể còn sót lý do từ lần
          trước, và hộp đỏ "dừng đăng ngay" nằm dưới nhãn "Khỏe" là màn hình tự cãi nhau. */}
      {account.quarantineReason && isQuarantinedStatus(account.status) ? (
        <div className="mb-5 flex items-start gap-3 rounded-xl border border-red-400/20 bg-red-400/[0.06] px-4 py-3 text-sm text-red-200">
          <ShieldAlert size={17} className="mt-0.5 shrink-0" />
          <strong>Quarantine reason:</strong> {account.quarantineReason}
        </div>
      ) : null}

      {/* Đứng trên mọi thẻ: nick chưa đủ điều kiện thì bốn cái nút bên dưới đều báo lỗi, và
          người đọc cần biết TẠI SAO trước khi bấm chứ không phải sau. Nick sẵn sàng thì khối
          này không vẽ gì — một dải xanh "mọi thứ ổn" trên mỗi trang là thứ mắt học cách bỏ qua. */}
      <AccountReadinessPanel readiness={readiness} />

      {/* ── Việc tiếp theo ─────────────────────────────────────────────────────
          Hai thẻ dưới đây là chặng 2 và chặng 3 của luồng nhập một nick, và **không bao giờ hiện
          cùng lúc**: chưa có profile thì chưa có chỗ nào để đăng nhập vào.

          Đứng ngay dưới dải Sẵn sàng, tức TRÊN thẻ Thao tác, vì với một nick chưa xong cấu hình
          thì bốn cái nút kia đều báo lỗi — thứ người ta cần trước là việc phải làm, không phải
          những nút chưa dùng được. Nick đã xong thì cả hai thẻ biến mất và Thao tác lên đầu. */}
      {account.antidetectProfileId === null ? (
        <Card title="Next step — create browser profile">
          <AntidetectProfileCard
            accountId={account.id}
            username={account.username}
            platform={account.platform}
            proxyCountry={account.proxy?.country ?? null}
            proxyLabel={account.proxy?.label ?? null}
          />
        </Card>
      ) : browserNick && account.firstLoginAt === null ? (
        <Card title="Next step - complete first sign-in">
          <FirstLoginCard accountId={account.id} usesGoogleLogin={usesGoogleLogin} />
        </Card>
      ) : null}

      <Card title="Quick actions" icon={Activity}>
        <AccountVaultActionsPanel
          accountId={account.id}
          hasTotp={account.totpSecretEnc !== null}
          hasOwnPassword={account.passwordEnc !== null}
          usesGoogleLogin={usesGoogleLogin}
          canLaunch={presentation.canLaunch}
          launchBlockedReason={presentation.hint}
          relayDevices={relayDevices.map((device) => ({ id: device.id, name: device.name }))}
          nickDeviceName={account.device?.name ?? null}
        />
      </Card>

      <Disclosure summary="Full nick record" icon={ListTree} className="mb-5">
        <dl className="grid gap-x-8 gap-y-4 sm:grid-cols-2">
          {facts.map(([label, value]) => (
            <div key={label}>
              <dt className="font-mono text-[10px] uppercase tracking-[0.1em] text-neutral-600">{label}</dt>
              <dd className="mt-1 break-words text-sm text-neutral-200">{value}</dd>
            </div>
          ))}
        </dl>
        {account.purchaseNote ? (
          <p className="mt-4 border-t border-white/[0.07] pt-4 text-sm text-neutral-400">
            <span className="font-mono text-[10px] uppercase tracking-[0.1em] text-neutral-600">Purchase notes: </span>
            {account.purchaseNote}
          </p>
        ) : null}
      </Disclosure>

      {/* OPERATOR thấy thẻ ở dạng CHỈ ĐỌC, không phải thẻ biến mất.

          Ẩn hẳn thì đúng về bảo mật nhưng sai về giao tiếp: họ tạo xong nick, bấm "Mở profile",
          nhận câu "chưa ghim vào máy nào" — và trên màn hình của họ không có gì nói chỗ đó ở đâu
          hay ai làm được. Chặn THẬT nằm ở `adminAction` bọc ngoài server action, nên hiện thông
          tin ra không nới lỏng gì cả. */}
      {viewer?.role !== "ADMIN" ? (
        <Card
          title="Nick assignment"
          description="An administrator owns changes to the owner and Relay PC pair."
          icon={UserRound}
        >
          <dl className="mb-4 grid gap-x-8 gap-y-3 sm:grid-cols-2">
            <div>
              <dt className="text-xs uppercase tracking-wide text-neutral-500">Nick owner</dt>
              <dd className="mt-0.5 text-sm">{account.owner?.email ?? "Not assigned"}</dd>
            </div>
            <div>
              <dt className="text-xs uppercase tracking-wide text-neutral-500">Relay PC</dt>
              <dd className="mt-0.5 text-sm">{account.device?.name ?? "— Relay PC not assigned"}</dd>
            </div>
          </dl>
          <p className="text-sm text-neutral-400">
            Ask an administrator to change either field. The owner controls secret access; the
            Relay PC is the encrypted ticket destination.
          </p>
        </Card>
      ) : (
        <Card
          title="Nick assignment"
          description="Assign the owner and their Relay PC as one security boundary."
          icon={UserRound}
        >
          {teamMembers.length === 0 ? (
            <p className="text-sm text-amber-700 dark:text-amber-400">
              No teammate has signed in yet, so there is nobody to assign. This list includes only
              people who have signed in at least once. Granting access is not enough; that person
              must sign in once so the tool can identify them.
            </p>
          ) : (
            <AccountClusterAssignmentForm
              action={assignAccountCluster}
              accountId={account.id}
              revision={account.updatedAt.toISOString()}
              initialOwner={
                account.owner ? { id: account.ownerId!, label: account.owner.email } : null
              }
              initialDevice={
                account.device ? { id: account.deviceId!, label: account.device.name } : null
              }
              teamMembers={teamMembers.map((member) => ({ id: member.id, label: member.email }))}
              relayDevices={assignableDevices.map((device) => ({
                id: device.id,
                label: device.name,
                ownerEmail: device.user.email,
              }))}
            />
          )}
          <Disclosure summary="Assignment and transfer rules" icon={Info} className="mt-4">
            <ul className="space-y-2 text-xs leading-5">
              <li>The Relay PC must belong to the selected nick owner; mismatched pairs are rejected.</li>
              <li>Clearing the owner also clears the Relay PC assignment.</li>
              <li>Browser profiles do not move automatically. Verify import on the new PC, then remove the old local copy.</li>
            </ul>
          </Disclosure>
        </Card>
      )}

      <Card
        title="Edit nick"
        description="Status and lifecycle changes immediately recheck pending jobs. Platform is fixed."
        icon={PencilLine}
      >
        <AccountVaultForm
          action={updateAccount}
          submitLabel="Save"
          revision={account.updatedAt.toISOString()}
          proxyChange={
            isAdmin
              ? {
                  initial: account.proxy
                    ? {
                        id: account.proxy.id,
                        label: `${account.proxy.label} - ${account.proxy.country}`,
                      }
                    : null,
                  options: proxyOptions,
                }
              : undefined
          }
        >
          <input type="hidden" name="id" value={account.id} />
          <AccountFormFields
            proxies={proxyOptions}
            defaults={account}
            platform={account.platform}
            proxyEditAccess={{ isAdmin, adminContactEmail }}
          />
        </AccountVaultForm>
      </Card>

      <Card
        title="Delete nick"
        description="Use Dead for retirement. Permanent deletion is only for an unused record with no history."
        icon={Trash2}
        tone="danger"
      >
        <DeleteEntityButton
          action={deleteAccount.bind(null, account.id)}
          label={`nick "${account.username}"`}
          redirectTo="/accounts"
        />
      </Card>

      <Disclosure summary={`Recent activity - ${auditLogs.length}`} icon={Activity} className="mb-5">
        {auditLogs.length === 0 ? (
          <p className="text-sm text-neutral-500">No activity has been recorded yet.</p>
        ) : (
          <ul className="space-y-1 text-sm">
            {auditLogs.map((log) => (
              <li key={log.id} className="flex gap-3">
                <span className="shrink-0 font-mono text-xs text-neutral-500">
                  {formatFullDateTime(log.at)}
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
      </Disclosure>
    </PageShell>
  );
}
