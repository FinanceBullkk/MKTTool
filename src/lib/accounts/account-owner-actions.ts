"use server";

/**
 * Phân công nick: ai là người phụ trách nick nào.
 *
 * ## Chủ nick quyết định đúng MỘT thứ
 *
 * Chỉ chủ nick (hoặc ADMIN) lấy được **mật khẩu và mã OTP** của nick đó — xem
 * `requireNickOwner`. Ngoài ra không có gì bị chia: ai cũng vẫn thấy nick, job, tương tác và
 * lịch sử của người khác, và bộ luật vẫn quét toàn bộ đàn nick bất kể của ai.
 *
 * Cố ý như vậy. Luật 8 (đụng độ thread) chỉ có ích khi nó nêu đúng tên nick của đồng nghiệp:
 * "nick `abc` của người khác vừa comment ở thread này". Chia tầm nhìn theo chủ sở hữu là làm
 * luật đó mù đúng vào ca nó sinh ra để bắt — hai nick cùng nhà đụng một thread.
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

/**
 * Ô chọn người để trống nghĩa là **gỡ chủ**, nên `ownerId` cố ý nhận cả chuỗi rỗng.
 * Đây cũng là cách duy nhất gỡ chủ một nick, nên nó phải là một giá trị hợp lệ chứ không
 * phải một lỗi nhập liệu.
 */
const ownerAssignmentSchema = z.object({
  accountId: z.string().min(1, "Thiếu nick cần phân công"),
  ownerId: z.string().default(""),
});

/**
 * Gán hoặc gỡ chủ của một nick.
 *
 * Kiểm lại danh sách trắng trước khi gán, dù người đó đã có hàng trong `User`: hàng `User` chỉ
 * chứng minh họ **từng** đăng nhập được, không chứng minh bây giờ vẫn còn trong team. Gán nick
 * cho người đã bị gỡ khỏi `ALLOWED_EMAILS` là dựng ra một nick mà không ai mở được bí mật —
 * chủ danh nghĩa thì bị chặn ở mọi request, còn ADMIN thì tưởng đã giao cho người khác rồi.
 */
export const assignAccountOwner = adminAction(async function assignAccountOwner(
  actor,
  _prev: ActionResult | null,
  formData: FormData,
): Promise<ActionResult> {
  const parsed = ownerAssignmentSchema.safeParse(formToObject(formData));
  if (!parsed.success) return { ok: false, message: firstError(parsed.error) };

  const { accountId, ownerId } = parsed.data;

  const account = await prisma.account.findUnique({
    where: { id: accountId },
    select: { username: true },
  });
  if (!account) return { ok: false, message: "Không tìm thấy nick." };

  const trimmed = ownerId.trim();

  if (trimmed === "") {
    await prisma.account.update({ where: { id: accountId }, data: { ownerId: null } });
    await prisma.auditLog.create({
      data: {
        accountId,
        action: "ACCOUNT_OWNER_CLEARED",
        detail: `${actor.email} gỡ chủ của nick`,
        actorId: actor.userId,
      },
    });

    revalidatePath("/accounts");
    revalidatePath(`/accounts/${accountId}`);
    return {
      ok: true,
      message:
        `Đã gỡ chủ của nick "${account.username}". Từ giờ chỉ quản trị viên lấy được mật khẩu ` +
        `và OTP của nó — nick không có chủ thì OPERATOR nào cũng bị từ chối.`,
    };
  }

  const owner = await prisma.user.findUnique({
    where: { id: trimmed },
    select: { email: true, name: true },
  });
  if (!owner) return { ok: false, message: "Không tìm thấy người dùng này." };

  if (!isEmailAllowed(owner.email, readEmailAccessList())) {
    return {
      ok: false,
      message:
        `${owner.email} không còn trong ALLOWED_EMAILS nên không đăng nhập được nữa — gán nick ` +
        `cho họ thì không ai mở được bí mật của nick đó. Thêm lại vào .env, hoặc chọn người khác.`,
    };
  }

  await prisma.account.update({ where: { id: accountId }, data: { ownerId: trimmed } });
  await prisma.auditLog.create({
    data: {
      accountId,
      action: "ACCOUNT_OWNER_ASSIGNED",
      detail: `${actor.email} giao nick cho ${owner.email}`,
      actorId: actor.userId,
    },
  });

  revalidatePath("/accounts");
  revalidatePath(`/accounts/${accountId}`);
  return {
    ok: true,
    message:
      `Đã giao nick "${account.username}" cho ${owner.email}. Họ lấy được mật khẩu và OTP của ` +
      `nick này; người khác thì không, trừ quản trị viên.`,
  };
});
