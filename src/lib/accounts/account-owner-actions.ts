"use server";

/**
 * Phân công **cụm danh tính**: nick này của ai, và nằm ở chiếc máy nào.
 *
 * ## Vì sao hai ô phải đi cùng một lượt
 *
 * `Account.antidetectProfileId` is the primary key of a SQLite file on **exactly one machine**.
 * MKT Browser does not synchronize profiles across machines. Therefore the project's core routing invariant
 * (`1 account = 1 proxy = 1 profile configuration`) extends to `= 1 machine = 1 operator`.
 * These database/routing bindings do not prove browser identity isolation.
 *
 * Tách thành hai lần bấm là dựng ra trạng thái nửa vời — nick có chủ mà chưa có máy, hoặc tệ
 * hơn, nick ghim vào máy của người không còn là chủ. Một form, một transaction, một hàng
 * `AuditLog` cho mỗi thứ vừa đổi.
 *
 * ## Chủ nick quyết định gì, chiếc máy quyết định gì
 *
 * | Ô | Quyết định |
 * |---|---|
 * | `ownerId` | ai được **xin** bí mật của nick (`requireNickOwner`) |
 * | `deviceId` | vé bay về **máy nào** (`resolveNickDeviceRecipient`) |
 *
 * Hai câu hỏi khác nhau nên hai ô, dù chúng luôn trỏ về cùng một người. Nick Facebook là chỗ
 * chúng tách hẳn: có chủ để đọc mật khẩu, nhưng không có máy nào vì Fanpage đăng bằng Graph API.
 *
 * Ngoài hai việc đó thì không có gì bị chia: ai cũng vẫn thấy nick, job, tương tác và lịch sử
 * của người khác, và bộ luật vẫn quét toàn bộ đàn nick bất kể của ai. Cố ý như vậy — luật 8
 * (đụng độ thread) chỉ có ích khi nó nêu đúng tên nick của đồng nghiệp.
 *
 * ## Vì sao `adminAction`
 *
 * Tự phân công nick cho mình thì ranh giới bí mật không còn nghĩa gì: một OPERATOR chỉ cần gán
 * chủ cho mọi nick rồi đọc sạch mật khẩu. Việc này phải nằm ở người khác.
 */
import { revalidatePath } from "next/cache";
import { z } from "zod";
import type { ActionResult } from "@/lib/actions/action-result";
import { isEmailAllowed, readEmailAccessList } from "@/lib/auth/allowed-emails";
import { adminAction } from "@/lib/auth/guarded-action";
import { prisma } from "@/lib/db/prisma-client";
import {
  accountRevisionSchema,
  firstError,
  formToObject,
  STALE_ACCOUNT_WRITE_MESSAGE,
} from "./vault-form-schemas";
import { describeClusterChange } from "./account-cluster-change";

/**
 * Cả hai ô cố ý nhận chuỗi rỗng: để trống là **gỡ**, và đó là cách duy nhất gỡ chủ hoặc gỡ
 * ghim máy. Coi nó là lỗi nhập liệu thì không còn đường nào để gỡ.
 */
const clusterAssignmentSchema = z.object({
  accountId: z.string().min(1, "Select a nick to assign, then try again."),
  revision: accountRevisionSchema,
  ownerId: z.string().default(""),
  deviceId: z.string().default(""),
});

/**
 * Gán (hoặc gỡ) chủ và máy của một nick.
 *
 * Bất biến ép ở đây, vì Postgres không diễn đạt được ràng buộc bắc qua hai bảng mà không cần
 * trigger: **`deviceId` có giá trị ⟹ máy đó thuộc `ownerId` và chưa bị thu hồi.**
 */
export const assignAccountCluster = adminAction(async function assignAccountCluster(
  actor,
  _prev: ActionResult | null,
  formData: FormData,
): Promise<ActionResult> {
  const parsed = clusterAssignmentSchema.safeParse(formToObject(formData));
  if (!parsed.success) return { ok: false, message: firstError(parsed.error) };

  const { accountId, revision } = parsed.data;
  const ownerId = parsed.data.ownerId.trim();
  const deviceId = parsed.data.deviceId.trim();

  const account = await prisma.account.findUnique({
    where: { id: accountId },
    select: {
      username: true,
      ownerId: true,
      deviceId: true,
      device: { select: { name: true } },
    },
  });
  if (!account) return { ok: false, message: "Nick not found. Return to the nick vault and try again." };

  // Gỡ chủ là gỡ luôn máy. Nick không có chủ mà vẫn ghim vào máy của ai đó là đúng hàng lệch
  // mà bất biến ở trên cấm — và để nó tồn tại thì vé vẫn bay về chiếc máy ấy dù sổ nói nick
  // không thuộc về ai.
  if (ownerId === "" && deviceId !== "") {
    return {
      ok: false,
      message:
        "Removing the nick owner also requires removing its Relay PC assignment. A nick without an owner cannot remain assigned to anyone's Relay PC.",
    };
  }

  let ownerEmail: string | null = null;
  if (ownerId !== "") {
    const owner = await prisma.user.findUnique({
      where: { id: ownerId },
      select: { email: true },
    });
    if (!owner) {
      return {
        ok: false,
        message: "The selected teammate was not found. Refresh the page and choose a current teammate.",
      };
    }

    // Hàng `User` chỉ chứng minh họ **từng** đăng nhập được, không chứng minh bây giờ vẫn còn
    // trong team. Gán nick cho người đã bị gỡ khỏi `ALLOWED_EMAILS` là dựng ra một nick mà
    // không ai mở được bí mật — chủ danh nghĩa thì bị chặn ở mọi request, còn ADMIN thì tưởng
    // đã giao cho người khác rồi.
    if (!isEmailAllowed(owner.email, readEmailAccessList())) {
      return {
        ok: false,
        message:
          `${owner.email} no longer has sign-in access. Assigning the nick to them would leave ` +
          `its secrets inaccessible. Restore their access in the server settings or choose another teammate.`,
      };
    }
    ownerEmail = owner.email;
  }

  let deviceName: string | null = null;
  if (deviceId !== "") {
    const device = await prisma.relayDevice.findUnique({
      where: { id: deviceId },
      select: { name: true, revokedAt: true, userId: true, user: { select: { email: true } } },
    });
    if (!device) {
      return {
        ok: false,
        message: "The selected Relay PC is not registered. Refresh the page or register it before assigning the nick.",
      };
    }

    if (device.revokedAt) {
      return {
        ok: false,
        message:
          `Relay PC "${device.name}" has been revoked and cannot receive tickets. Choose another ` +
          `Relay PC, or leave the field empty and assign a new one after it is registered.`,
      };
    }

    if (device.userId !== ownerId) {
      return {
        ok: false,
        message:
          `Relay PC "${device.name}" belongs to ${device.user.email}, not the selected nick owner. ` +
          `Tickets are encrypted for exactly one Relay PC, so this mismatch would issue unusable tickets.`,
      };
    }
    deviceName = device.name;
  }

  const change = describeClusterChange({
    before: { ownerId: account.ownerId, deviceId: account.deviceId },
    after: { ownerId: ownerId || null, deviceId: deviceId || null },
    ownerEmail,
    deviceName,
    previousDeviceName: account.device?.name ?? null,
  });

  if (change.auditActions.length === 0) {
    return {
      ok: true,
      message: `No assignment changes were made for nick "${account.username}". Review the current owner and Relay PC, then continue.`,
    };
  }

  const didUpdate = await prisma.$transaction(async (tx) => {
    if (deviceId !== "") {
      // Match revocation's device-before-account order and recheck after the lock.
      await tx.$queryRaw`SELECT "id" FROM "RelayDevice" WHERE "id" = ${deviceId} FOR NO KEY UPDATE`;
      const device = await tx.relayDevice.findUnique({
        where: { id: deviceId },
        select: { userId: true, revokedAt: true, retirementId: true },
      });
      if (!device || device.revokedAt || device.retirementId || device.userId !== ownerId) {
        return "device-unavailable";
      }
    }
    const updated = await tx.account.updateMany({
      where: { id: accountId, updatedAt: revision },
      data: { ownerId: ownerId || null, deviceId: deviceId || null },
    });
    if (updated.count === 0) return "stale";

    for (const { action, detail } of change.auditActions) {
      await tx.auditLog.create({
        data: { accountId, action, detail: `${actor.email} ${detail}`, actorId: actor.userId },
      });
    }

    return "updated";
  });

  if (didUpdate === "device-unavailable") {
    return {
      ok: false,
      message: "The selected Relay PC changed or became unavailable while assigning the nick. Reload the page and choose an active PC belonging to its owner.",
    };
  }
  if (didUpdate === "stale") return { ok: false, message: STALE_ACCOUNT_WRITE_MESSAGE };

  revalidatePath("/accounts");
  revalidatePath(`/accounts/${accountId}`);
  const changeMessage = change.message.endsWith(".") ? change.message : `${change.message}.`;
  return {
    ok: true,
    message: `Nick "${account.username}": ${changeMessage} Verify the owner and Relay PC before continuing.`,
  };
});
