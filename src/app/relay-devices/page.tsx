import { RelayDeviceIdCell } from "@/components/relay/relay-device-id-cell";
import { RelayCompatibilityRollbackButton } from "@/components/relay/relay-compatibility-rollback-button";
import { RelayCompatibilityUpdateButton } from "@/components/relay/relay-compatibility-update-button";
import { RelayDeviceRevokeButton } from "@/components/relay/relay-device-revoke-button";
import { RelayDeviceRetirementButton } from "@/components/relay/relay-device-retirement-button";
import { RelayDeviceRetirementReceiptButton } from "@/components/relay/relay-device-retirement-receipt-button";
import { RelayGrantKeyButton } from "@/components/relay/relay-grant-key-button";
import { ActionForm, Field, SelectField } from "@/components/ui/form-controls";
import { Card, DataTable, EmptyState, PageHeading, StatusBadge } from "@/components/ui/page-section";
import { isEmailAllowed, readEmailAccessList } from "@/lib/auth/allowed-emails";
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
      include: {
        user: { select: { email: true } },
        // Thu hồi máy gỡ ghim mọi nick của nó, nên con số này là thứ người sắp bấm "Thu hồi"
        // cần thấy TRƯỚC khi bấm — không phải đọc trong câu báo sau khi việc đã xong.
        _count: { select: { accounts: true } },
      },
    }),
    // Chỉ người ĐÃ đăng nhập ít nhất một lần mới có hàng `User` để chọn.
    prisma.user.findMany({ orderBy: { email: "asc" }, select: { id: true, email: true } }),
  ]);

  const active = devices.filter((device) => !device.revokedAt).length;

  /**
   * Chủ máy còn đăng nhập được không.
   *
   * Đăng ký có kiểm `ALLOWED_EMAILS`, nhưng đó là kiểm **một lần, lúc ghi vào sổ**. Gỡ một người
   * khỏi danh sách sau đó thì máy của họ vẫn nằm nguyên với badge "đang dùng" — sổ nói sai.
   *
   * Không khai thác được: đường phát vé kiểm người đang gọi ở mỗi request, nên chiếc máy đó
   * không xin được vé nào. Nhưng sổ này tồn tại để trả lời *"máy của tôi ổn chưa"*, và một cuốn
   * sổ trả lời sai câu hỏi duy nhất nó sinh ra để trả lời thì tệ hơn là không có sổ.
   */
  const accessList = readEmailAccessList();
  const canStillSignIn = (email: string) => isEmailAllowed(email, accessList);

  /**
   * Khóa vùng operator của một máy đang ở đâu — **theo những gì máy chủ biết được**.
   *
   * Ba trạng thái, và cách đọc chúng phải cẩn thận đúng ở chỗ này: `chưa cấp` KHÔNG có nghĩa là
   * máy đó không có khóa. Có đường thứ hai để một máy có khóa — người dùng dán tay ở trang trạng
   * thái của cầu nối — và máy chủ mù hoàn toàn với đường đó cho tới khi chính chiếc máy ấy mở web
   * app và tự khai. Nên nhãn nói *"chưa cấp"*, không nói *"chưa có khóa"*.
   */
  const keyStatus = (device: (typeof devices)[number]) => {
    if (device.operatorKeyReadyAt) {
      return {
        label: `máy đã báo có khóa ${formatFullDateTime(device.operatorKeyReadyAt)}`,
        className:
          "bg-emerald-100 text-emerald-700 dark:bg-emerald-950 dark:text-emerald-400",
      };
    }
    if (device.operatorKeyGrant) {
      return {
        label: "đã cấp — chờ máy đó mở web app",
        className: "bg-sky-100 text-sky-700 dark:bg-sky-950 dark:text-sky-400",
      };
    }
    return {
      label: "chưa cấp",
      className: "bg-neutral-100 text-neutral-600 dark:bg-neutral-800 dark:text-neutral-400",
    };
  };

  /** Máy đã vào sổ, còn dùng được, mà chưa có khóa và cũng chưa được cấp. */
  const awaitingKey = devices.filter(
    (device) => !device.revokedAt && !device.operatorKeyGrant && !device.operatorKeyReadyAt,
  );

  return (
    <>
      <PageHeading
        title="Máy chạy cầu nối"
        description="Mỗi máy có cặp khóa riêng. Máy chủ mã hóa nội dung vé bằng khóa công khai của đúng máy nhận, nên trình duyệt chỉ là người đưa thư — nó chuyển vé đi nhưng không đọc được gì bên trong."
      />

      {/* Thẻ này đứng ngay dưới tiêu đề chứ không đứng TRÊN nó (sửa 07/08/2026): một thẻ nổi phía
          trên tiêu đề trang làm thứ tự đọc bị lộn. Vẫn ở gần đầu vì với ADMIN đây là việc cần bấm
          ngay — máy đang chờ khóa là máy chưa làm được gì cả. */}
      {isAdmin && awaitingKey.length > 0 ? (
        <Card title={`Đang chờ cấp khóa — ${awaitingKey.length} máy`}>
          <p className="mb-4 text-sm text-neutral-600 dark:text-neutral-400">
            Mấy máy này đã vào sổ nhưng chưa có khóa vùng operator, nên chưa lấy được mật khẩu hay
            mở được profile. Bấm <strong>Cấp khóa</strong> là xong — khóa được bọc bằng cầu nối
            trên máy bạn, cho riêng từng máy nhận, và tự về máy đó ngay lần sau họ mở web app.
          </p>
          <DataTable headers={["Máy", "Người dùng", "Đăng ký", ""]}>
            {awaitingKey.map((device) => (
              <tr key={device.id}>
                <td className="py-2 pr-4 font-medium">{device.name}</td>
                <td className="py-2 pr-4">{device.user.email}</td>
                <td className="py-2 pr-4 text-xs">{formatFullDateTime(device.createdAt)}</td>
                <td className="py-2 pr-4 text-right">
                  <RelayGrantKeyButton
                    deviceId={device.id}
                    devicePublicKey={device.publicKey}
                    deviceName={device.name}
                    alreadyReady={false}
                  />
                </td>
              </tr>
            ))}
          </DataTable>
          <p className="mt-4 text-xs text-neutral-500">
            Máy nào lấy khóa bằng cách dán tay thì vẫn nằm ở đây cho tới khi chính nó mở web app và
            tự khai — máy chủ không thấy được đường đó. Cấp thêm một lần nữa cũng không sao.
          </p>
        </Card>
      ) : null}

      <Card title={`Sổ đăng ký — ${active} máy đang dùng, ${devices.length - active} đã thu hồi`}>
        {devices.length === 0 ? (
          <EmptyState>
            Chưa có máy nào trong sổ. Cài cầu nối trên máy cần dùng, rồi mở web app{" "}
            <strong>ngay trên chính máy đó</strong> và bấm &quot;Tìm cầu nối&quot; ở thẻ bên dưới —
            không phải chép khóa công khai đi đâu cả.
          </EmptyState>
        ) : (
          <DataTable
            headers={[
              "Máy",
              "Người dùng",
              "Mã máy",
              "Khóa công khai",
              "Đăng ký",
              "Trạng thái",
              "Khóa operator",
              "",
            ]}
          >
            {devices.map((device) => (
              <tr key={device.id} className={device.revokedAt ? "text-neutral-400" : undefined}>
                <td className="py-2 pr-4 font-medium">
                  {device.name}
                  {!device.revokedAt && device._count.accounts > 0 ? (
                    <span className="mt-1 block text-xs font-normal text-neutral-500">
                      {device._count.accounts} nick đang ghim — thu hồi là gỡ ghim hết
                    </span>
                  ) : null}
                </td>
                <td className="py-2 pr-4">
                  {device.user.email}
                  {!device.revokedAt && !canStillSignIn(device.user.email) ? (
                    <span
                      className="mt-1 block text-xs text-amber-700 dark:text-amber-500"
                      title="Email này không còn trong ALLOWED_EMAILS"
                    >
                      không còn quyền đăng nhập — máy này không xin được vé
                    </span>
                  ) : null}
                </td>
                <td className="py-2 pr-4">
                  <RelayDeviceIdCell deviceId={device.id} />
                </td>
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
                <td className="py-2 pr-4">
                  {device.revokedAt ? null : (
                    <StatusBadge {...keyStatus(device)} />
                  )}
                </td>
                <td className="py-2 pr-4 text-right">
                  {isAdmin ? (
                    <div className="space-y-2">
                      {!device.revokedAt && (device.operatorKeyReadyAt || device.operatorKeyGrant) ? (
                        <RelayGrantKeyButton
                          deviceId={device.id}
                          devicePublicKey={device.publicKey}
                          deviceName={device.name}
                          alreadyReady={Boolean(device.operatorKeyReadyAt)}
                        />
                      ) : null}
                      {!device.revokedAt ? (
                        <RelayCompatibilityUpdateButton
                          deviceId={device.id}
                          devicePublicKey={device.publicKey}
                        />
                      ) : null}
                      {!device.revokedAt ? (
                        <RelayCompatibilityRollbackButton
                          deviceId={device.id}
                          deviceName={device.name}
                          devicePublicKey={device.publicKey}
                        />
                      ) : null}
                      {!device.revokedAt ? (
                        <RelayDeviceRevokeButton
                          action={revokeRelayDevice.bind(null, device.id)}
                          deviceName={device.name}
                        />
                      ) : null}
                      {!device.retirementCompletedAt ? (
                        <RelayDeviceRetirementButton
                          deviceId={device.id}
                          deviceName={device.name}
                          devicePublicKey={device.publicKey}
                        />
                      ) : (
                        <div className="space-y-2">
                          <StatusBadge
                            label={`local cleanup confirmed ${formatFullDateTime(device.retirementCompletedAt)}`}
                            className="bg-emerald-100 text-emerald-700 dark:bg-emerald-950 dark:text-emerald-400"
                          />
                          {device.retirementId ? (
                            <RelayDeviceRetirementReceiptButton
                              deviceId={device.id}
                              devicePublicKey={device.publicKey}
                              retirementId={device.retirementId}
                            />
                          ) : null}
                        </div>
                      )}
                    </div>
                  ) : null}
                </td>
              </tr>
            ))}
          </DataTable>
        )}
        <p className="mt-4 text-xs text-neutral-500">
          <strong className="text-neutral-700 dark:text-neutral-300">Mã máy</strong> là thứ chiếc
          máy đó phải biết để nhận ra vé của chính nó. Bấm &quot;Tìm cầu nối&quot; ở thẻ bên dưới
          thì web app <strong>tự ghi nó xuống</strong> — chỉ khi đăng ký hộ bằng form nhập tay mới
          phải chép mã này về cho họ dán vào ô{" "}
          <code className="rounded bg-neutral-100 px-1 py-0.5 font-mono dark:bg-neutral-800">
            deviceId
          </code>{" "}
          trong{" "}
          <code className="rounded bg-neutral-100 px-1 py-0.5 font-mono dark:bg-neutral-800">
            relay-config.json
          </code>
          . Dán thiếu hoặc dán nhầm hàng thì mọi nút đều báo &quot;vé này phát cho máy khác&quot;.
        </p>
      </Card>

      {/* Hiện cho MỌI vai trò: người ngồi ở máy chính là người cài nó, và bắt họ đợi ADMIN đăng
          nhập hộ trên máy mình là dựng lại đúng vòng chờ mà nút này sinh ra để dẹp. Ranh giới nằm
          ở chủ máy — OPERATOR chỉ đăng ký được máy của chính họ. */}
      <Card title="Cài máy này (Máy bạn đang ngồi)">
        <p className="text-sm text-neutral-600 dark:text-neutral-400">
          The guided current-PC controller now lives on <a href="/setup" className="underline">/setup</a>.
          This registry remains available for administrator approval, revocation, and support.
        </p>
      </Card>

      {isAdmin ? (
        <Card title="Đăng ký một máy KHÁC (nhập tay)">
          <p className="mb-4 text-sm text-neutral-600 dark:text-neutral-400">
            Chỉ dùng khi không ngồi được ở máy đó — lúc ấy phải xin họ chép khóa công khai gửi
            sang, và sau khi ghi vào sổ thì còn phải gửi ngược mã máy về cho họ dán tay.
          </p>
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
