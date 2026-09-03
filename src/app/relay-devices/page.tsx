import { RelayDeviceIdCell } from "@/components/relay/relay-device-id-cell";
import { RelayCompatibilityRollbackButton } from "@/components/relay/relay-compatibility-rollback-button";
import { RelayCompatibilityUpdateButton } from "@/components/relay/relay-compatibility-update-button";
import { RelayDeviceRevokeButton } from "@/components/relay/relay-device-revoke-button";
import { RelayDeviceRetirementButton } from "@/components/relay/relay-device-retirement-button";
import { RelayDeviceRetirementReceiptButton } from "@/components/relay/relay-device-retirement-receipt-button";
import { RelayDeviceVersionCell } from "@/components/relay/relay-device-version-cell";
import { RelayGrantKeyButton } from "@/components/relay/relay-grant-key-button";
import { ActionForm, Field, SelectField } from "@/components/ui/form-controls";
import { Card, DataTable, EmptyState, PageHeading, StatusBadge } from "@/components/ui/page-section";
import { isEmailAllowed, readEmailAccessList } from "@/lib/auth/allowed-emails";
import { readActor } from "@/lib/auth/require-actor";
import { prisma } from "@/lib/db/prisma-client";
import { formatFullDateTime } from "@/lib/format/vietnamese-date-format";
import { registerRelayDevice, revokeRelayDevice } from "@/lib/tickets/relay-device-actions";
import { MIN_RELAY_VERSION } from "@/lib/tickets/ticket-types";

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
        label: `Relay PC reported its key at ${formatFullDateTime(device.operatorKeyReadyAt)}`,
        className:
          "bg-emerald-100 text-emerald-700 dark:bg-emerald-950 dark:text-emerald-400",
      };
    }
    if (device.operatorKeyGrant) {
      return {
        label: "granted - waiting for this Relay PC to open the web app",
        className: "bg-sky-100 text-sky-700 dark:bg-sky-950 dark:text-sky-400",
      };
    }
    return {
      label: "not granted",
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
        title="Relay PC registry"
        description="Each Relay PC has its own key pair. The server encrypts every ticket for the receiving PC's public key, so the browser only delivers the ticket and cannot read its contents."
      />

      {/* Thẻ này đứng ngay dưới tiêu đề chứ không đứng TRÊN nó (sửa 07/08/2026): một thẻ nổi phía
          trên tiêu đề trang làm thứ tự đọc bị lộn. Vẫn ở gần đầu vì với ADMIN đây là việc cần bấm
          ngay — máy đang chờ khóa là máy chưa làm được gì cả. */}
      {isAdmin && awaitingKey.length > 0 ? (
        <Card title={`Waiting for operator keys - ${awaitingKey.length} ${awaitingKey.length === 1 ? "Relay PC" : "Relay PCs"}`}>
          <p className="mb-4 text-sm text-neutral-600 dark:text-neutral-400">
            These Relay PCs are registered but do not have the operator key, so they cannot retrieve
            passwords or open browser profiles. Select <strong>Grant operator key</strong>. Relay on
            your PC seals the key for each receiving PC, and it arrives automatically the next time
            that PC opens the web app.
          </p>
          <DataTable headers={["Relay PC", "User", "Registered", ""]}>
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
            A Relay PC that received the key through manual entry remains here until it opens the
            web app and reports its status. The server cannot observe the manual path, so granting
            the key again is safe.
          </p>
        </Card>
      ) : null}

      <Card title={`Registry - ${active} active, ${devices.length - active} revoked`}>
        {devices.length === 0 ? (
          <EmptyState>
            No Relay PCs are registered. Install Relay on the PC that will be used, open the web app
            <strong> on that same PC</strong>, then select &quot;Find Relay&quot; in the card below.
            You do not need to send its public key anywhere.
          </EmptyState>
        ) : (
          <DataTable
            headers={[
              "Relay PC",
              "User",
              "Relay PC ID",
              "Public key",
              "Registered",
              "Status",
              "Relay",
              "Operator key",
              "",
            ]}
          >
            {devices.map((device) => (
              <tr key={device.id} className={device.revokedAt ? "text-neutral-400" : undefined}>
                <td className="py-2 pr-4 font-medium">
                  {device.name}
                  {!device.revokedAt && device._count.accounts > 0 ? (
                    <span className="mt-1 block text-xs font-normal text-neutral-500">
                      {device._count.accounts} {device._count.accounts === 1 ? "nick is" : "nicks are"} assigned - revocation unassigns {device._count.accounts === 1 ? "it" : "all of them"}
                    </span>
                  ) : null}
                </td>
                <td className="py-2 pr-4">
                  {device.user.email}
                  {!device.revokedAt && !canStillSignIn(device.user.email) ? (
                    <span
                      className="mt-1 block text-xs text-amber-700 dark:text-amber-500"
                      title="This email no longer has sign-in access"
                    >
                      sign-in access removed - this Relay PC cannot request tickets
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
                      label={`revoked ${formatFullDateTime(device.revokedAt)}`}
                      className="bg-red-100 text-red-700 dark:bg-red-950 dark:text-red-400"
                    />
                  ) : (
                    <StatusBadge
                      label="active"
                      className="bg-emerald-100 text-emerald-700 dark:bg-emerald-950 dark:text-emerald-400"
                    />
                  )}
                </td>
                <td className="py-2 pr-4">
                  <RelayDeviceVersionCell device={device} floor={MIN_RELAY_VERSION} />
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
                          deviceName={device.name}
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
          The <strong className="text-neutral-700 dark:text-neutral-300">Relay PC ID</strong> lets
          that PC recognize its own tickets. Select &quot;Find Relay&quot; in the card below and the
          web app <strong>writes it automatically</strong>. Only a manual registration requires you
          to send this ID back for entry in the{" "}
          <code className="rounded bg-neutral-100 px-1 py-0.5 font-mono dark:bg-neutral-800">
            deviceId
          </code>{" "}
          trong{" "}
          <code className="rounded bg-neutral-100 px-1 py-0.5 font-mono dark:bg-neutral-800">
            relay-config.json
          </code>
          field. A missing or incorrect value makes every action report that the ticket belongs to
          another Relay PC.
        </p>
      </Card>

      {/* Hiện cho MỌI vai trò: người ngồi ở máy chính là người cài nó, và bắt họ đợi ADMIN đăng
          nhập hộ trên máy mình là dựng lại đúng vòng chờ mà nút này sinh ra để dẹp. Ranh giới nằm
          ở chủ máy — OPERATOR chỉ đăng ký được máy của chính họ. */}
      <Card title="Set up this Relay PC">
        <p className="text-sm text-neutral-600 dark:text-neutral-400">
          The guided current-PC controller now lives on <a href="/setup" className="underline">/setup</a>.
          This registry remains available for administrator approval, revocation, and support.
        </p>
      </Card>

      {isAdmin ? (
        <Card title="Register another Relay PC manually">
          <p className="mb-4 text-sm text-neutral-600 dark:text-neutral-400">
            Use this only when you cannot access that PC. Ask its user to send the public key, then
            send the Relay PC ID back after registration so they can enter it manually.
          </p>
          <ActionForm action={registerRelayDevice} submitLabel="Register Relay PC">
            <Field
              label="Relay PC name"
              name="name"
              required
              placeholder="Ha's Dell laptop"
              hint="Use a name you can identify quickly if this Relay PC must be revoked."
            />
            <SelectField
              label="Relay PC user"
              name="userId"
              required
              options={teamMembers.map((member) => ({ value: member.id, label: member.email }))}
              hint="Only people who have signed in at least once are listed."
            />
            <Field
              label="Relay PC public key"
              name="publicKey"
              required
              placeholder="64 hexadecimal characters"
              hint="Copy the complete line printed by Relay during installation. This is the PUBLIC key; the private key remains on that PC and must never be sent anywhere."
            />
          </ActionForm>
        </Card>
      ) : null}

      <Card title="What Relay PC revocation does">
        <ul className="space-y-2 text-sm text-neutral-600 dark:text-neutral-400">
          <li>
            <strong className="text-neutral-900 dark:text-neutral-100">It blocks:</strong> a revoked
            Relay PC cannot receive new tickets. This takes effect immediately without changing any
            other team PC.
          </li>
          <li>
            <strong className="text-neutral-900 dark:text-neutral-100">It cannot block:</strong>
            secrets previously retrieved by that PC remain on its drive and can still be opened. If
            the PC is actually lost, revoke it and then rotate the operator key with{" "}
            <code className="rounded bg-neutral-100 px-1 py-0.5 font-mono text-xs dark:bg-neutral-800">
              npm run vault:rekey -- --domain=operator
            </code>
            . Revocation is the immediate barrier while the key rotation is completed.
          </li>
          <li>
            Revocation is irreversible. A revoked key cannot be registered again. If the PC is
            recovered, reinstall Relay to generate a new key pair, then register it again.
          </li>
        </ul>
      </Card>
    </>
  );
}
