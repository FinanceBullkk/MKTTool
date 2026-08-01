import {
  ActionForm,
  CheckboxField,
  Field,
  SelectField,
} from "@/components/ui/form-controls";
import { Card, DataTable, EmptyState, PageHeading } from "@/components/ui/page-section";
import { createTarget } from "@/lib/accounts/account-actions";
import { prisma } from "@/lib/db/prisma-client";

export const dynamic = "force-dynamic";

export default async function TargetsPage() {
  const targets = await prisma.platformTarget.findMany({
    orderBy: [{ platform: "asc" }, { name: "asc" }],
  });

  return (
    <>
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
            headers={["Nền tảng", "Tên", "Karma tối thiểu", "Tuổi nick (ngày)", "Tỷ lệ promo", "Cho link"]}
          >
            {targets.map((target) => (
              <tr key={target.id}>
                <td className="py-2 pr-4 text-xs text-neutral-600 dark:text-neutral-400">
                  {target.platform}
                </td>
                <td className="py-2 pr-4 font-medium">
                  <a href={target.url} target="_blank" rel="noreferrer" className="hover:underline">
                    {target.name}
                  </a>
                </td>
                <td className="py-2 pr-4">{target.minKarma}</td>
                <td className="py-2 pr-4">{target.minAccountAgeDays}</td>
                <td className="py-2 pr-4">{target.promoRatio}:1</td>
                <td className="py-2 pr-4">{target.allowsLinks ? "có" : "không"}</td>
              </tr>
            ))}
          </DataTable>
        )}
      </Card>

      <Card title="Thêm đích">
        <ActionForm action={createTarget} submitLabel="Thêm đích">
          <SelectField
            label="Nền tảng"
            name="platform"
            required
            options={[
              { value: "REDDIT", label: "Reddit (subreddit)" },
              { value: "FACEBOOK_PAGE", label: "Facebook Page" },
              { value: "FACEBOOK_GROUP", label: "Facebook Group (đăng tay)" },
            ]}
          />
          <Field label="Tên" name="name" required placeholder="r/selfhosted" />
          <Field
            label="URL"
            name="url"
            required
            placeholder="https://www.reddit.com/r/selfhosted/"
          />
          <Field
            label="Karma tối thiểu"
            name="minKarma"
            type="number"
            defaultValue={0}
            hint="Nhiều sub ngách giờ đòi 100-500"
          />
          <Field
            label="Tuổi nick tối thiểu (ngày)"
            name="minAccountAgeDays"
            type="number"
            defaultValue={0}
          />
          <Field
            label="Tỷ lệ promo"
            name="promoRatio"
            type="number"
            defaultValue={9}
            hint="9 nghĩa là 9 bài hữu ích mới được 1 bài quảng cáo"
          />
          <CheckboxField label="Sub cho phép đăng link" name="allowsLinks" defaultChecked />
          <Field label="Ghi chú" name="notes" placeholder="Mod hoạt động mạnh, luật riêng…" />
        </ActionForm>
      </Card>
    </>
  );
}
