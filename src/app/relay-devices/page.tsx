import { RelayDeviceRevokeButton } from "@/components/relay/relay-device-revoke-button";
import { ActionForm, Field, SelectField } from "@/components/ui/form-controls";
import { Card, DataTable, EmptyState, PageHeading, StatusBadge } from "@/components/ui/page-section";
import { readActor } from "@/lib/auth/require-actor";
import { prisma } from "@/lib/db/prisma-client";
import { formatFullDateTime } from "@/lib/format/vietnamese-date-format";
import { registerRelayDevice, revokeRelayDevice } from "@/lib/tickets/relay-device-actions";

export const dynamic = "force-dynamic";

/**
 * Sổ đăng ký máy chạy cầu nối.
 *
 * ## Vì sao cả team đọc được sổ, nhưng chỉ ADMIN ghi
 *
 * Khóa công khai công khai đúng nghĩa — lộ cũng không mất gì — nên giấu danh sách đi chẳng bảo
 * vệ được thứ gì, mà lại lấy mất câu trả lời cho câu hỏi mà mọi người sẽ hỏi mỗi lần bấm nút
 * hỏng: *"máy của tôi đã vào sổ chưa?"*. Không thấy sổ thì họ chỉ còn cách đi hỏi admin.
 *
 * Cùng nguyên tắc với phần còn lại của dự án: chia **quyền làm**, không chia **tầm nhìn**.
 */
export default async function RelayDevicesPage() {
  const viewer = await readActor();
  const isAdmin = viewer?.role === "ADMIN";

  const [devices, teamMembers] = await Promise.all([
    prisma.relayDevice.findMany({
      // Máy còn dùng lên trước, mới nhất lên đầu: danh sách này được mở ra chủ yếu vào hai lúc
      // — vừa cài xong một máy, và vừa mất một máy. Cả hai đều tìm hàng ở gần đầu.
      orderBy: [{ revokedAt: "asc" }, { createdAt: "desc" }],
      include: { user: { select: { email: true } } },
    }),
    // Chỉ người ĐÃ đăng nhập ít nhất một lần mới có hàng `User` để chọn.
    prisma.user.findMany({ orderBy: { email: "asc" }, select: { id: true, email: true } }),
  ]);

  const active = devices.filter((device) => !device.revokedAt).length;

  return (
    <>
      <PageHeading
        title="Máy chạy cầu nối"
        description="Mỗi máy có cặp khóa riêng. Máy chủ mã hóa nội dung vé bằng khóa công khai của đúng máy nhận, nên trình duyệt chỉ là người đưa thư — nó chuyển vé đi nhưng không đọc được gì bên trong."
      />

      <Card title={`Sổ đăng ký — ${active} máy đang dùng, ${devices.length - active} đã thu hồi`}>
        {devices.length === 0 ? (
          <EmptyState>
            Chưa có máy nào trong sổ. Cài cầu nối trên máy cần dùng, chép khóa công khai nó in ra,
            rồi dán vào form bên dưới.
          </EmptyState>
        ) : (
          <DataTable
            headers={["Máy", "Người dùng", "Khóa công khai", "Đăng ký", "Trạng thái", ""]}
          >
            {devices.map((device) => (
              <tr key={device.id} className={device.revokedAt ? "text-neutral-400" : undefined}>
                <td className="py-2 pr-4 font-medium">{device.name}</td>
                <td className="py-2 pr-4">{device.user.email}</td>
                {/* Cắt ngắn cho vừa bảng, nhưng giữ nguyên bản đầy đủ trong `title` để còn đối
                    chiếu với khóa mà máy đó in ra khi nghi ngờ dán nhầm. */}
                <td
                  className="py-2 pr-4 font-mono text-xs text-neutral-600 dark:text-neutral-400"
                  title={device.publicKey}
                >
                  {device.publicKey.slice(0, 8)}…{device.publicKey.slice(-8)}
                </td>
                <td className="py-2 pr-4 text-xs">{formatFullDateTime(device.createdAt)}</td>
                <td className="py-2 pr-4">
                  {device.revokedAt ? (
                    <StatusBadge
                      label={`thu hồi ${formatFullDateTime(device.revokedAt)}`}
                      className="bg-red-100 text-red-700 dark:bg-red-950 dark:text-red-400"
                    />
                  ) : (
                    <StatusBadge
                      label="đang dùng"
                      className="bg-emerald-100 text-emerald-700 dark:bg-emerald-950 dark:text-emerald-400"
                    />
                  )}
                </td>
                <td className="py-2 pr-4 text-right">
                  {isAdmin && !device.revokedAt ? (
                    <RelayDeviceRevokeButton
                      action={revokeRelayDevice.bind(null, device.id)}
                      deviceName={device.name}
                    />
                  ) : null}
                </td>
              </tr>
            ))}
          </DataTable>
        )}
      </Card>

      {isAdmin ? (
        <Card title="Đăng ký máy mới">
          <ActionForm action={registerRelayDevice} submitLabel="Ghi vào sổ">
            <Field
              label="Tên máy"
              name="name"
              required
              placeholder="Laptop Dell của Hà"
              hint="Tới ngày phải thu hồi gấp, đây là thứ duy nhất để nhận ra máy nào là máy nào."
            />
            <SelectField
              label="Người dùng máy"
              name="userId"
              required
              options={teamMembers.map((member) => ({ value: member.id, label: member.email }))}
              hint="Chỉ hiện người đã đăng nhập ít nhất một lần."
            />
            <Field
              label="Khóa công khai của máy"
              name="publicKey"
              required
              placeholder="64 ký tự hex"
              hint="Chép nguyên dòng mà cầu nối in ra lúc cài. Đây là khóa CÔNG KHAI — khóa riêng ở lại trên máy đó và không bao giờ được gửi đi đâu."
            />
          </ActionForm>
        </Card>
      ) : null}

      <Card title="Thu hồi làm được gì">
        <ul className="space-y-2 text-sm text-neutral-600 dark:text-neutral-400">
          <li>
            <strong className="text-neutral-900 dark:text-neutral-100">Chặn được:</strong> máy đã
            thu hồi không nhận được vé mới. Có hiệu lực ngay, không cần đụng tới máy nào khác của
            team.
          </li>
          <li>
            <strong className="text-neutral-900 dark:text-neutral-100">Không chặn được:</strong> bí
            mật mà máy đó đã lấy về từ trước vẫn nằm trên ổ cứng của nó và vẫn mở được. Máy thật
            sự mất thì thu hồi xong vẫn phải xoay khóa vùng operator —{" "}
            <code className="rounded bg-neutral-100 px-1 py-0.5 font-mono text-xs dark:bg-neutral-800">
              npm run vault:rekey -- --domain=operator
            </code>
            . Thu hồi là cái chặn trong vài giây, để dùng trong lúc chờ xoay khóa xong.
          </li>
          <li>
            Thu hồi là một chiều. Khóa đã gạch tên không đăng ký lại được — máy tìm thấy lại thì
            cài lại cầu nối để sinh cặp khóa mới.
          </li>
        </ul>
      </Card>
    </>
  );
}
