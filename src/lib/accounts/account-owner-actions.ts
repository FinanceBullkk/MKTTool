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
import { firstError, formToObject } from "./vault-form-schemas";
import { describeClusterChange } from "./account-cluster-change";

/**
 * Cả hai ô cố ý nhận chuỗi rỗng: để trống là **gỡ**, và đó là cách duy nhất gỡ chủ hoặc gỡ
 * ghim máy. Coi nó là lỗi nhập liệu thì không còn đường nào để gỡ.
 */
const clusterAssignmentSchema = z.object({
  accountId: z.string().min(1, "Thiếu nick cần phân công"),
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

  const { accountId } = parsed.data;
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
  if (!account) return { ok: false, message: "Không tìm thấy nick." };

  // Gỡ chủ là gỡ luôn máy. Nick không có chủ mà vẫn ghim vào máy của ai đó là đúng hàng lệch
  // mà bất biến ở trên cấm — và để nó tồn tại thì vé vẫn bay về chiếc máy ấy dù sổ nói nick
  // không thuộc về ai.
  if (ownerId === "" && deviceId !== "") {
    return {
      ok: false,
      message: "Gỡ chủ thì phải gỡ cả máy — nick không có chủ không ghim vào máy của ai được.",
    };
  }

  let ownerEmail: string | null = null;
  if (ownerId !== "") {
    const owner = await prisma.user.findUnique({
      where: { id: ownerId },
      select: { email: true },
    });
    if (!owner) return { ok: false, message: "Không tìm thấy người dùng này." };

    // Hàng `User` chỉ chứng minh họ **từng** đăng nhập được, không chứng minh bây giờ vẫn còn
    // trong team. Gán nick cho người đã bị gỡ khỏi `ALLOWED_EMAILS` là dựng ra một nick mà
    // không ai mở được bí mật — chủ danh nghĩa thì bị chặn ở mọi request, còn ADMIN thì tưởng
    // đã giao cho người khác rồi.
    if (!isEmailAllowed(owner.email, readEmailAccessList())) {
      return {
        ok: false,
        message:
          `${owner.email} không còn trong ALLOWED_EMAILS nên không đăng nhập được nữa — gán nick ` +
          `cho họ thì không ai mở được bí mật của nick đó. Thêm lại vào .env, hoặc chọn người khác.`,
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
    if (!device) return { ok: false, message: "Không tìm thấy máy này trong sổ cầu nối." };

    if (device.revokedAt) {
      return {
        ok: false,
        message:
          `Máy "${device.name}" đã bị thu hồi nên không nhận được vé nào nữa. Chọn máy khác, ` +
          `hoặc để trống ô máy rồi ghim lại sau khi người đó đăng ký máy mới.`,
      };
    }

    if (device.userId !== ownerId) {
      return {
        ok: false,
        message:
          `Máy "${device.name}" là của ${device.user.email}, không phải của người bạn vừa chọn. ` +
          `Vé được mã hóa cho đúng một máy, nên ghim lệch là phát một tấm vé chắc chắn hỏng.`,
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
    return { ok: true, message: `Không có gì đổi cho nick "${account.username}".` };
  }

  await prisma.$transaction([
    prisma.account.update({
      where: { id: accountId },
      data: { ownerId: ownerId || null, deviceId: deviceId || null },
    }),
    ...change.auditActions.map(({ action, detail }) =>
      prisma.auditLog.create({
        data: { accountId, action, detail: `${actor.email} ${detail}`, actorId: actor.userId },
      }),
    ),
  ]);

  revalidatePath("/accounts");
  revalidatePath(`/accounts/${accountId}`);
  return { ok: true, message: `Nick "${account.username}": ${change.message}` };
});
