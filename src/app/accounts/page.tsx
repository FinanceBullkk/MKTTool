import Link from "next/link";
import {
  Card,
  DataTable,
  EmptyState,
  PageHeading,
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
        device: { select: { userId: true, revokedAt: true } },
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
    <>
      <PageHeading
        title="Tài khoản"
        description="Một nick = một proxy = một profile cấu hình. Database ép ràng buộc này; đây không phải bằng chứng cô lập danh tính."
      />

      <Card title={`Danh sách — ${accounts.length} nick`}>
        {sorted.length === 0 ? (
          <EmptyState>Chưa có nick nào.</EmptyState>
        ) : (
          <DataTable
            headers={[
              "Nick",
              "Kiểm tra thao tác",
              "Nền tảng",
              "Trạng thái",
              "Giọng viết",
              "Proxy",
              "Karma",
              "Tuổi nick",
            ]}
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
                  {/* Cột này đứng thứ hai có chủ ý: nó là câu hỏi người ta mở trang này để hỏi.
                      "Trạng thái" bên phải nói về sức khỏe nick, khác hẳn — một nick "Khỏe" vẫn
                      có thể chưa dùng được vì chưa ghim máy. */}
                  <td className="py-2 pr-4">
                    <AccountReadinessCell readiness={describeAccountReadiness(account)} />
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
                    {account.voice ?? "—"}
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
            {viewer?.role === "ADMIN" ? (
              <>
                Cần có ít nhất 1 proxy chưa gắn nick trước đã.{" "}
                <Link href="/proxies" className="underline">
                  Thêm proxy
                </Link>
              </>
            ) : (
              <>
                Kho hiện chưa có proxy rảnh. ADMIN phụ trách nạp và gán proxy; liên hệ quản trị
                viên tại{" "}
                <a href={`mailto:${adminContactEmail}`} className="underline">
                  {adminContactEmail}
                </a>{" "}
                rồi chờ proxy được chuẩn bị.
              </>
            )}
          </EmptyState>
        ) : (
          <AccountVaultForm action={createAccount} submitLabel="Thêm nick">
            <AccountFormFields
              proxies={freeProxies.map((proxy) => ({
                id: proxy.id,
                label: `${proxy.label} — ${proxy.country}`,
              }))}
              defaultColdStartUntil={defaultColdStartUntil}
              viewer={
                viewer
                  ? { userId: viewer.userId, email: viewer.email, isAdmin: viewer.role === "ADMIN" }
                  : undefined
              }
              teamMembers={teamMembers}
            />
          </AccountVaultForm>
        )}
      </Card>
    </>
  );
}
