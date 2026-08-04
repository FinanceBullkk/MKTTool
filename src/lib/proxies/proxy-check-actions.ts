"use server";

/**
 * Nút "kiểm proxy" ở `/proxies`.
 *
 * Kết quả ghi vào database chứ không chỉ trả về màn hình: dải cảnh báo ở trang Hôm nay và
 * cột trạng thái trong bảng đều đọc từ đó, nên một lần kiểm phải phục vụ được cả ba chỗ.
 */
import { revalidatePath } from "next/cache";
import type { ActionResult } from "@/lib/actions/action-result";
import { prisma } from "@/lib/db/prisma-client";
import { checkAllProxies, checkProxyLiveness, summarizeProxyChecks } from "./proxy-liveness-check";

/** Kiểm xong thì cả `/proxies` lẫn trang Hôm nay đều có thứ mới để hiện. */
function revalidateProxyViews() {
  revalidatePath("/proxies");
  revalidatePath("/");
}

export async function checkOneProxy(proxyId: string): Promise<ActionResult> {
  const proxy = await prisma.proxy.findUnique({ where: { id: proxyId } });
  if (!proxy) return { ok: false, message: "Không tìm thấy proxy." };

  const liveness = await checkProxyLiveness(proxy);
  revalidateProxyViews();

  // ok=false cho mọi kết luận khác OK, kể cả "không kiểm được": thông báo màu xanh cho một
  // lượt kiểm không đo được gì chính là kiểu báo khỏe giả mà cả dự án đang tránh.
  return { ok: liveness.verdict === "OK", message: `${proxy.label} — ${liveness.message}` };
}

export async function checkEveryProxy(): Promise<ActionResult> {
  const results = await checkAllProxies();
  revalidateProxyViews();

  const allHealthy = results.every((result) => result.liveness.verdict === "OK");
  return { ok: results.length > 0 && allHealthy, message: summarizeProxyChecks(results) };
}
