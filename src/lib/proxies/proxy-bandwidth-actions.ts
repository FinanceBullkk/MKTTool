"use server";

/**
 * Nút "đo tốc độ" ở `/proxies`.
 *
 * Cố ý CHỈ CÓ bản đo một proxy, không có bản "đo cả kho": mỗi lượt tải 1 MB qua proxy, nhân
 * cả đàn là vài chục MB quota trả tiền mỗi lần bấm. Một cái nút đốt tiền theo mẻ là thứ sớm
 * muộn cũng có người bấm nhầm.
 */
import { revalidatePath } from "next/cache";
import type { ActionResult } from "@/lib/actions/action-result";
import { decryptCredential } from "@/lib/crypto/credential-encryption";
import { prisma } from "@/lib/db/prisma-client";
import { measureProxyBandwidth } from "./proxy-bandwidth-probe";
import { summarizeBandwidth } from "./proxy-bandwidth-report";

export async function measureOneProxySpeed(proxyId: string): Promise<ActionResult> {
  const proxy = await prisma.proxy.findUnique({ where: { id: proxyId } });
  if (!proxy) return { ok: false, message: "Không tìm thấy proxy." };

  let password: string;
  try {
    password = decryptCredential(proxy.passwordEnc);
  } catch {
    // Giải mã hỏng là chuyện của VAULT_KEY, không phải của proxy — không ghi gì vào database,
    // vì ghi tức là khai rằng đã đo, mà thật ra chưa gửi đi byte nào.
    return {
      ok: false,
      message: `${proxy.label} — không giải mã được mật khẩu proxy (VAULT_KEY đã đổi?). Chưa đo được.`,
    };
  }

  const outcome = await measureProxyBandwidth({
    host: proxy.host,
    port: proxy.port,
    username: proxy.username,
    password,
    protocol: proxy.protocol,
  });
  const summary = summarizeBandwidth(outcome);

  await prisma.proxy.update({
    where: { id: proxy.id },
    data: {
      lastSpeedAt: new Date(),
      // null khi không đo được — cột số phải trống thì giao diện mới nói được "chưa đo được"
      // thay vì hiện một con số 0 trông như proxy chậm.
      lastSpeedMbps: summary.mbps,
      lastSpeedDetail: summary.message.slice(0, 500),
    },
  });

  revalidatePath("/proxies");
  return { ok: summary.ok, message: `${proxy.label} — ${summary.message}` };
}
