"use server";

/**
 * Nút "Dò cả đàn" ở trang Sức khỏe.
 *
 * Trước đợt này, dải cảnh báo "N nick chưa được dò gần đây" ở trang Hôm nay không kèm đường
 * xử lý nào — bấm vào chỉ sang bảng, còn muốn chạy thật thì phải mở terminal. Cảnh báo không
 * có đường xử lý là cảnh báo được học cách phớt lờ.
 */
import { revalidatePath } from "next/cache";
import type { ActionResult } from "@/lib/actions/action-result";
import { guardedAction } from "@/lib/auth/guarded-action";
import { prisma } from "@/lib/db/prisma-client";
import { launchHealthCheckProcess } from "./health-check-process-launcher";
import { readHealthCheckLockStatus } from "./health-check-lock";

export const startHerdHealthCheck = guardedAction(async function startHerdHealthCheck(
  _actor,
): Promise<ActionResult> {
  // Kiểm khóa trước để câu thông báo nói được điều có ích. Tầng dưới (`acquireHealthCheckLock`)
  // vẫn là chỗ chặn thật — nhưng nó chặn bên trong tiến trình con, nơi không ai đọc được.
  const running = await readHealthCheckLockStatus();
  if (running.running) {
    return {
      ok: false,
      message:
        `Đang có một lượt dò chạy dở (máy ${running.host}, tiến trình ${running.pid}, bắt đầu ` +
        `${running.minutesElapsed} phút trước). Chờ nó xong rồi bấm lại — hai lượt chồng nhau ` +
        `làm proxy quan sát viên bắn request dồn dập và bị Reddit chặn.`,
    };
  }

  // Sinh một tiến trình chắc chắn chết ngay ở dòng đầu là cách tệ nhất để báo thiếu cấu hình:
  // `stdio: "ignore"` nuốt hết câu lỗi, người dùng chỉ thấy "đã khởi động" rồi không có gì xảy ra.
  const observerCount = await prisma.observerProxy.count({ where: { active: true } });
  if (observerCount === 0) {
    return {
      ok: false,
      message:
        "Chưa có proxy quan sát viên nào đang bật, nên bộ dò không chạy được. Khai một cái ở " +
        "trang Proxy — dò bằng IP nhà hoặc bằng chính proxy của nick còn tệ hơn không dò.",
    };
  }

  const { pid } = launchHealthCheckProcess();
  if (pid === null) {
    return { ok: false, message: "Không sinh được tiến trình dò. Xem log của dev server." };
  }

  revalidatePath("/health");
  revalidatePath("/");

  return {
    ok: true,
    message:
      `Đã khởi động lượt dò ở tiến trình ${pid}. Lượt đầy đủ mất gần mười phút vì phải nghỉ ` +
      `30-90 giây giữa các nick — tải lại trang này để xem bảng đầy dần. Đóng tab cũng không sao.`,
  };
});

/**
 * Trạng thái lượt đang chạy.
 *
 * Hiện **không có chỗ nào gọi**: trang Sức khỏe là server component nên nó gọi thẳng
 * `readHealthCheckLockStatus()` chứ không cần đi vòng qua server action. Vẫn gác vì trong file
 * `"use server"` thì mọi export đều là một endpoint POST thật, dùng hay không dùng cũng vậy —
 * "không ai gọi" là chuyện của mã nguồn mình, không phải của người biết địa chỉ.
 */
export const getHerdHealthCheckStatus = guardedAction(async function getHerdHealthCheckStatus(
  _actor,
) {
  return readHealthCheckLockStatus();
});
