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
        `A health check is already running (host ${running.host}, process ${running.pid}, started ` +
        `${running.minutesElapsed} minutes ago). Wait for it to finish, then try again. ` +
        `Overlapping checks would burst requests through the observer proxy and may cause Reddit to block it.`,
    };
  }

  // Sinh một tiến trình chắc chắn chết ngay ở dòng đầu là cách tệ nhất để báo thiếu cấu hình:
  // `stdio: "ignore"` nuốt hết câu lỗi, người dùng chỉ thấy "đã khởi động" rồi không có gì xảy ra.
  const observerCount = await prisma.observerProxy.count({ where: { active: true } });
  if (observerCount === 0) {
    return {
      ok: false,
      message:
        "No observer proxy is enabled, so the health checker cannot run. Configure one on the Proxy page. " +
        "Checking from a home IP or from the nick's own proxy is worse than not checking.",
    };
  }

  const { pid } = launchHealthCheckProcess();
  if (pid === null) {
    return {
      ok: false,
      message: "The health-check process could not be started. Review the development server log and try again.",
    };
  }

  revalidatePath("/health");
  revalidatePath("/");

  return {
    ok: true,
    message:
      `Health check started in process ${pid}. A full run takes almost ten minutes because it waits ` +
      `30-90 seconds between nicks. Reload this page to watch the table fill in; closing the tab will not stop the run.`,
  };
});
