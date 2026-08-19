import { ParkedScopeBanner } from "@/components/layout/parked-scope-banner";
import Link from "next/link";
import { ActionForm } from "@/components/ui/form-controls";
import { Card, DataTable, EmptyState, PageHeading, StatusBadge } from "@/components/ui/page-section";
import { TargetFormFields } from "@/components/vault/target-form-fields";
import { createTarget } from "@/lib/accounts/vault-create-actions";
import { prisma } from "@/lib/db/prisma-client";

export const dynamic = "force-dynamic";

export default async function TargetsPage() {
  const targets = await prisma.platformTarget.findMany({
    orderBy: [{ platform: "asc" }, { name: "asc" }],
  });

  return (
    <>
      <ParkedScopeBanner what="target Reddit/Facebook" />
      <PageHeading
        title="Đích đăng"
        description="Subreddit hoặc Fanpage/Group. Các ngưỡng ở đây là đầu vào cho bộ luật an toàn ở Phase 02 — nhập đúng luật thật của từng sub."
      />

      <Card title="Danh sách">
        {targets.length === 0 ? (
          <EmptyState>
            Chưa có đích nào. Đọc luật từng subreddit rồi nhập vào đây: karma tối thiểu, tuổi nick
            tối thiểu, tỷ lệ tự quảng cáo cho phép.
          </EmptyState>
        ) : (
          <DataTable
            headers={[
              "Nền tảng",
              "Tên",
              "Karma tối thiểu",
              "Tuổi nick (ngày)",
              "Tỷ lệ promo",
              "Cho link",
              "Đang dùng",
              "",
            ]}
          >
            {targets.map((target) => (
              <tr key={target.id}>
                <td className="py-2 pr-4 text-xs text-neutral-600 dark:text-neutral-400">
                  {target.platform}
                </td>
                <td className="py-2 pr-4 font-medium">
                  <Link href={`/targets/${target.id}`} className="hover:underline">
                    {target.name}
                  </Link>
                </td>
                <td className="py-2 pr-4">{target.minKarma}</td>
                <td className="py-2 pr-4">{target.minAccountAgeDays}</td>
                <td className="py-2 pr-4">{target.promoRatio}:1</td>
                <td className="py-2 pr-4">{target.allowsLinks ? "có" : "không"}</td>
                <td className="py-2 pr-4">
                  {target.active ? (
                    "có"
                  ) : (
                    <StatusBadge
                      label="đã nghỉ"
                      className="bg-neutral-200 text-neutral-600 dark:bg-neutral-800 dark:text-neutral-400"
                    />
                  )}
                </td>
                <td className="py-2 pr-4 text-right">
                  <Link
                    href={`/targets/${target.id}`}
                    className="text-xs text-neutral-500 hover:underline"
                  >
                    Sửa
                  </Link>
                </td>
              </tr>
            ))}
          </DataTable>
        )}
      </Card>

      <Card title="Thêm đích">
        <ActionForm action={createTarget} submitLabel="Thêm đích">
          <TargetFormFields />
        </ActionForm>
      </Card>
    </>
  );
}
