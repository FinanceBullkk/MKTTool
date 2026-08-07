"use server";

/**
 * Đánh dấu **lần đầu đăng nhập được nick vào profile của nó** — chặng 3, chặng cuối của luồng
 * nhập một nick.
 *
 * ## Vì sao phải có một cái nút cho việc này
 *
 * Trước 07/08/2026, *"có profile"* và *"đã đăng nhập"* là một: người ta tự dựng profile trong
 * MultiZen, đăng nhập ngay trong đó, **rồi mới** chép id sang MKTTool. Nút "Tạo profile trên máy
 * này" đảo ngược thứ tự — nó sinh ra một trình duyệt trắng tinh, có proxy và vân tay, không một
 * cookie nào. Từ đó tồn tại một trạng thái chưa từng có: nick đủ mọi thứ mà chưa ai đăng nhập.
 *
 * Không đánh dấu thì cột "Sẵn sàng" khoe màu xanh cho nick đó, và chuyện chỉ lộ ra vào đúng hôm
 * ai đó ngồi xuống định đăng bài — đúng lớp hỏng mà cả dự án tránh ở chỗ khác.
 *
 * ## Đây là LỜI KHAI, và file này không giả vờ ngược lại
 *
 * Máy chủ không có cách nào biết một profile trên máy người khác đã đăng nhập hay chưa. Nó tin
 * người bấm, y như nó tin `karma` và `platformCreatedAt` do người dùng gõ vào. Đổi lại, nút nằm
 * ngay trong thẻ chứa nút "Mở profile" và các nút lấy bí mật, nên người bấm chính là người vừa
 * đăng nhập xong.
 *
 * Đường đo thật thì có: hỏi MultiZen xem profile có cookie phiên Reddit không (`get_cookies` của
 * MCP). Nhưng nó cần thêm một đường ở cầu nối, một bản `.exe` mới, và một lượt cả team cài lại —
 * chưa đáng cho một cái mốc bấm một lần rồi thôi.
 *
 * ## Vì sao chỉ ghi được MỘT LẦN
 *
 * `firstLoginAt` là *lần đầu*, không phải *lần gần nhất*. Cho ghi đè thì mỗi lượt bấm nhầm lại
 * đẩy mốc về hiện tại, và con số dùng để trả lời *"nick nằm không bao lâu trước khi ai đó chạm
 * vào"* mất nghĩa. Bấm lại là một lượt không-làm-gì thành công, không phải một câu từ chối khó
 * hiểu — trình duyệt gọi lại sau khi mất mạng giữa chừng là chuyện thường.
 */
import { revalidatePath } from "next/cache";
import type { ActionResult } from "@/lib/actions/action-result";
import { AUDIT_ACTIONS } from "@/lib/audit/audit-log-actions";
import { guardedAction } from "@/lib/auth/guarded-action";
import { requireNickOwner } from "@/lib/auth/require-actor";
import { prisma } from "@/lib/db/prisma-client";

export const markFirstLogin = guardedAction(async function markFirstLogin(
  actor,
  accountId: string,
): Promise<ActionResult> {
  // Cùng ranh giới với mọi thao tác đụng tới nick: chủ nick hoặc ADMIN. Người ngoài không được
  // khai hộ rằng một nick đã đăng nhập được — đó là lời khai làm cột "Sẵn sàng" chuyển xanh.
  await requireNickOwner(actor, accountId);

  const account = await prisma.account.findUnique({
    where: { id: accountId },
    select: { username: true, antidetectProfileId: true, firstLoginAt: true },
  });
  if (!account) return { ok: false, message: "Không tìm thấy nick." };

  if (account.firstLoginAt) {
    return { ok: true, message: `Nick "${account.username}" đã được đánh dấu từ trước.` };
  }

  // Chưa có profile mà khai đã đăng nhập là một câu vô nghĩa — không có chỗ nào để đăng nhập vào.
  // Chặn ở đây thay vì tin, kẻo cột "Sẵn sàng" bỏ qua luôn cả blocker "chưa có profile".
  if (!account.antidetectProfileId) {
    return {
      ok: false,
      message:
        `Nick "${account.username}" chưa có profile antidetect nên chưa có chỗ nào để đăng nhập ` +
        `vào. Dựng profile trước.`,
    };
  }

  await prisma.$transaction([
    prisma.account.update({ where: { id: accountId }, data: { firstLoginAt: new Date() } }),
    prisma.auditLog.create({
      data: {
        accountId,
        action: AUDIT_ACTIONS.ACCOUNT_FIRST_LOGIN,
        detail: `${actor.email} khai đã đăng nhập được nick vào profile của nó`,
        actorId: actor.userId,
      },
    }),
  ]);

  revalidatePath("/accounts");
  revalidatePath(`/accounts/${accountId}`);
  return {
    ok: true,
    message:
      `Đã ghi nhận. Nick "${account.username}" xong phần cấu hình — từ giờ chỉ còn chờ hết ` +
      `cold-start là đăng bài được.`,
  };
});
