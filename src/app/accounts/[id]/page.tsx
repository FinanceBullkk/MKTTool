import Link from "next/link";
import { notFound } from "next/navigation";
import { DeleteEntityButton } from "@/components/ui/delete-entity-button";
import { ActionForm, SelectField } from "@/components/ui/form-controls";
import { Card, PageHeading, StatusBadge } from "@/components/ui/page-section";
import { AccountFormFields } from "@/components/vault/account-form-fields";
import { AccountVaultForm } from "@/components/vault/account-vault-form";
import { AccountReadinessPanel } from "@/components/vault/account-readiness-badge";
import { AntidetectProfileCard } from "@/components/vault/antidetect-profile-card";
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
import { readActor } from "@/lib/auth/require-actor";
import { prisma } from "@/lib/db/prisma-client";
import { formatFullDate, formatFullDateTime } from "@/lib/format/vietnamese-date-format";
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
      persona: true,
      proxy: true,
      owner: { select: { email: true } },
      device: { select: { name: true, revokedAt: true, userId: true } },
    },
  });

  if (!account) notFound();

  const viewer = await readActor();

  const presentation = getStatusPresentation(account.status);
  const coldDays = coldStartDaysRemaining(account.coldStartUntil);
  const age = accountAgeInDays(account.platformCreatedAt);
  const readiness = describeAccountReadiness(account);

  const [auditLogs, personas, selectableProxies, teamMembers, relayDevices, assignableDevices] =
    await Promise.all([
      prisma.auditLog.findMany({ where: { accountId: id }, orderBy: { at: "desc" }, take: 20 }),
      prisma.persona.findMany({ orderBy: { name: "asc" }, select: { id: true, name: true } }),
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

  const facts: [string, string][] = [
    ["Nền tảng", account.platform],
    ["Nhân vật", `${account.persona.name} — ${account.persona.voice}`],
    ["Mảng nội dung", account.persona.contentAngle],
    [
      "Proxy",
      account.proxy
        ? `${account.proxy.label} — ${account.proxy.protocol}://${account.proxy.host}:${account.proxy.port} ` +
          `(${account.proxy.country})`
        : "— không gắn (đăng Fanpage bằng Graph API thì không cần)",
    ],
    [
      "Người phụ trách",
      account.owner
        ? account.owner.email
        : "— chưa phân công (chỉ quản trị viên lấy được mật khẩu và OTP)",
    ],
    ["Profile antidetect", account.antidetectProfileId ?? "— không có (không mở profile được)"],
    [
      "Máy giữ profile",
      account.device
        ? `${account.device.name}${account.device.revokedAt ? " — ĐÃ THU HỒI, phải gán lại" : ""}`
        : "— chưa ghim (id profile chỉ có nghĩa trên đúng máy tạo ra nó)",
    ],
    ["Email gốc", account.emailAddress],
    ["Karma", String(account.karma)],
    ["Tuổi nick", age === null ? "—" : `${age} ngày`],
    ["Ngày tạo trên nền tảng", formatDate(account.platformCreatedAt)],
    ["Ngày mua", formatDate(account.purchasedAt)],
    ["Cold-start tới", account.coldStartUntil ? formatDate(account.coldStartUntil) : "—"],
    ["Hoạt động gần nhất", account.lastActionAt ? formatFullDateTime(account.lastActionAt) : "—"],
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

      {/* Chỉ hiện khi nick THẬT SỰ đang bị cách ly. Bản ghi cũ có thể còn sót lý do từ lần
          trước, và hộp đỏ "dừng đăng ngay" nằm dưới nhãn "Khỏe" là màn hình tự cãi nhau. */}
      {account.quarantineReason && isQuarantinedStatus(account.status) ? (
        <div className="mb-6 rounded-md border border-red-300 bg-red-50 px-4 py-3 text-sm text-red-800 dark:border-red-900 dark:bg-red-950 dark:text-red-300">
          <strong>Lý do cách ly:</strong> {account.quarantineReason}
        </div>
      ) : null}

      {/* Đứng trên mọi thẻ: nick chưa đủ điều kiện thì bốn cái nút bên dưới đều báo lỗi, và
          người đọc cần biết TẠI SAO trước khi bấm chứ không phải sau. Nick sẵn sàng thì khối
          này không vẽ gì — một dải xanh "mọi thứ ổn" trên mỗi trang là thứ mắt học cách bỏ qua. */}
      <AccountReadinessPanel readiness={readiness} />

      <Card title="Thao tác">
        <AccountVaultActionsPanel
          accountId={account.id}
          hasTotp={account.totpSecretEnc !== null}
          canLaunch={presentation.canLaunch}
          launchBlockedReason={presentation.hint}
          relayDevices={relayDevices.map((device) => ({ id: device.id, name: device.name }))}
          nickDeviceName={account.device?.name ?? null}
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

      {/* OPERATOR thấy thẻ ở dạng CHỈ ĐỌC, không phải thẻ biến mất.

          Ẩn hẳn thì đúng về bảo mật nhưng sai về giao tiếp: họ tạo xong nick, bấm "Mở profile",
          nhận câu "chưa ghim vào máy nào" — và trên màn hình của họ không có gì nói chỗ đó ở đâu
          hay ai làm được. Chặn THẬT nằm ở `adminAction` bọc ngoài server action, nên hiện thông
          tin ra không nới lỏng gì cả. */}
      {viewer?.role !== "ADMIN" ? (
        <Card title="Phân công cụm">
          <dl className="mb-4 grid gap-x-8 gap-y-3 sm:grid-cols-2">
            <div>
              <dt className="text-xs uppercase tracking-wide text-neutral-500">Người phụ trách</dt>
              <dd className="mt-0.5 text-sm">{account.owner?.email ?? "— chưa phân công"}</dd>
            </div>
            <div>
              <dt className="text-xs uppercase tracking-wide text-neutral-500">Máy giữ profile</dt>
              <dd className="mt-0.5 text-sm">{account.device?.name ?? "— chưa ghim"}</dd>
            </div>
          </dl>
          <p className="text-sm text-neutral-600 dark:text-neutral-400">
            Hai ô này do <strong>quản trị viên</strong> gán. Người phụ trách là người duy nhất
            ngoài quản trị viên xin được mật khẩu và mã OTP của nick; máy giữ profile quyết định
            vé bay về đâu. Cần đổi thì nhắn quản trị viên — kể cả khi nick này là của bạn.
          </p>
        </Card>
      ) : (
        <Card title="Phân công cụm">
          <p className="mb-4 text-sm text-neutral-600 dark:text-neutral-400">
            Hai ô này đi cùng nhau. <strong>Người phụ trách</strong> là người duy nhất ngoài quản
            trị viên <em>xin</em> được mật khẩu và mã OTP của nick; <strong>máy giữ profile</strong>{" "}
            quyết định vé bay <em>về đâu</em>. Ngoài hai chuyện đó thì không có gì bị chia: cả team
            vẫn thấy nick, job và lịch sử của nhau, và bộ luật vẫn quét toàn bộ đàn nick — luật
            chống đụng độ thread phải nêu đúng tên nick của đồng nghiệp thì mới dùng được.
          </p>
          <p className="mb-4 text-sm text-neutral-600 dark:text-neutral-400">
            Máy phải là máy <strong>của chính người phụ trách</strong>, vì vé được mã hóa cho đúng
            một máy. Chọn lệch thì công cụ từ chối kèm lý do chứ không lưu. Để trống ô người là{" "}
            <strong>gỡ chủ</strong>, và gỡ chủ thì gỡ luôn máy.
          </p>
          <p className="mb-4 text-sm text-amber-700 dark:text-amber-400">
            <strong>Đổi sang máy khác:</strong> profile MultiZen không tự đi theo. Export ở máy cũ
            → import ở máy mới → <strong>xóa bản ở máy cũ</strong>. Bỏ bước cuối là nick sống ở hai
            máy cùng lúc — một phiên đăng nhập, hai bộ tín hiệu thiết bị.
          </p>

          {teamMembers.length === 0 ? (
            <p className="text-sm text-amber-700 dark:text-amber-400">
              Chưa ai trong team đăng nhập lần nào nên chưa có người để giao. Danh sách này chỉ
              gồm người đã đăng nhập ít nhất một lần — khai email vào{" "}
              <code>ALLOWED_EMAILS</code> thôi thì chưa đủ, họ phải vào một lần để công cụ biết
              họ là ai.
            </p>
          ) : (
            <ActionForm action={assignAccountCluster} submitLabel="Lưu phân công">
              <input type="hidden" name="accountId" value={account.id} />
              <SelectField
                label="Người phụ trách"
                name="ownerId"
                defaultValue={account.ownerId ?? ""}
                options={teamMembers.map((member) => ({
                  value: member.id,
                  label: member.email,
                }))}
                hint="Chỉ hiện người đã đăng nhập ít nhất một lần."
              />
              <SelectField
                label="Máy giữ profile"
                name="deviceId"
                defaultValue={account.deviceId ?? ""}
                options={assignableDevices.map((device) => ({
                  value: device.id,
                  label: `${device.name} — ${device.user.email}`,
                }))}
                hint={
                  assignableDevices.length === 0
                    ? "Chưa máy nào đăng ký cầu nối. Cài cầu nối và đăng ký máy TRƯỚC khi giao nick."
                    : "Để trống nếu nick không cần trình duyệt (Fanpage đăng bằng Graph API)."
                }
              />
            </ActionForm>
          )}
        </Card>
      )}

      {/* Chỉ hiện khi nick CHƯA có profile: đã có rồi thì thẻ này không còn việc gì, và một thẻ
          trống thường trực là thứ mắt học cách bỏ qua. Thẻ tự ẩn nốt nếu cầu nối không gọi được
          — xem chú thích đầu `antidetect-profile-card.tsx`. */}
      {account.antidetectProfileId === null ? (
        <Card title="Profile antidetect">
          <AntidetectProfileCard
            accountId={account.id}
            username={account.username}
            proxyCountry={account.proxy?.country ?? null}
            proxyLabel={account.proxy?.label ?? null}
          />
        </Card>
      ) : null}

      <Card title="Sửa nick">
        <p className="mb-4 text-sm text-neutral-600 dark:text-neutral-400">
          Karma, trạng thái và cold-start là đầu vào của luật 1, 2 và 3 — sửa xong là mọi job
          đang chờ của nick này được chấm lại ngay, job hết an toàn chuyển sang BỊ CHẶN.
          Nền tảng không đổi được sau khi tạo.
        </p>
        <AccountVaultForm action={updateAccount} submitLabel="Lưu">
          <input type="hidden" name="id" value={account.id} />
          <AccountFormFields
            personas={personas.map((persona) => ({ id: persona.id, label: persona.name }))}
            proxies={selectableProxies.map((proxy) => ({
              id: proxy.id,
              label: `${proxy.label} — ${proxy.country}`,
            }))}
            defaults={account}
          />
        </AccountVaultForm>
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
      </Card>
    </>
  );
}
