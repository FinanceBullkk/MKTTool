/**
 * Mở profile antidetect của một nick.
 *
 * Ba lớp chặn trước khi mở:
 *  1. Trạng thái nick phải cho phép (CHECKPOINT / SHADOWBANNED / DEAD thì không).
 *  2. Proxy phải còn gắn với nick — mở nhầm proxy là mất nick.
 *  3. Proxy phải ĐẨY ĐƯỢC sang trình duyệt. Đẩy hỏng thì dừng, không mở:
 *     profile không có proxy sẽ chạy thẳng bằng IP nhà, và không ai nhận ra cho tới khi mất nick.
 */
import { NextResponse } from "next/server";
import { getStatusPresentation } from "@/lib/accounts/account-status";
import { AntidetectError } from "@/lib/antidetect/antidetect-browser-adapter";
import { getAntidetectAdapter } from "@/lib/antidetect/antidetect-adapter-factory";
import { ProxyConfigError, buildProxyConfig } from "@/lib/antidetect/proxy-config-builder";
import { prisma } from "@/lib/db/prisma-client";

export const runtime = "nodejs";

export async function POST(_request: Request, context: { params: Promise<{ id: string }> }) {
  const { id } = await context.params;

  const account = await prisma.account.findUnique({
    where: { id },
    include: { proxy: true },
  });

  if (!account) {
    return NextResponse.json({ ok: false, message: "Không tìm thấy nick." }, { status: 404 });
  }

  const presentation = getStatusPresentation(account.status);
  if (!presentation.canLaunch) {
    return NextResponse.json(
      { ok: false, message: `Không mở được: ${presentation.hint}` },
      { status: 409 },
    );
  }

  const adapter = getAntidetectAdapter();

  try {
    // Đẩy proxy TRƯỚC khi mở. Thứ tự này quan trọng: profile đã mở rồi mới đổi proxy
    // thì phiên đang chạy vẫn đi bằng IP cũ.
    const proxyConfig = buildProxyConfig(account.proxy);
    await adapter.applyProxy(account.antidetectProfileId, proxyConfig);

    const launched = await adapter.launchProfile(account.antidetectProfileId);

    await prisma.$transaction([
      prisma.account.update({ where: { id }, data: { lastActionAt: new Date() } }),
      prisma.auditLog.create({
        data: {
          accountId: id,
          action: "PROFILE_LAUNCHED",
          detail: `${adapter.providerName} / proxy ${account.proxy.label} (${proxyConfig.protocol})`,
        },
      }),
    ]);

    return NextResponse.json({
      ok: true,
      message:
        `Đã đẩy proxy ${account.proxy.label} (${account.proxy.country}, ${proxyConfig.protocol}) ` +
        `vào profile rồi mở qua ${adapter.providerName}. ` +
        `Vẫn nên mở ipinfo.io kiểm tra IP khớp proxy trước khi thao tác — ` +
        `đẩy thành công không bảo đảm proxy còn sống.`,
      // Chỉ dùng cho Phase 05; không hiển thị cho người dùng cuối.
      // MultiZen không trả về endpoint này — đó là bình thường, không phải lỗi.
      cdpEndpoint: launched.cdpEndpoint ?? null,
    });
  } catch (error) {
    const message =
      error instanceof AntidetectError || error instanceof ProxyConfigError
        ? error.message
        : "Lỗi không xác định khi mở profile antidetect.";

    await prisma.auditLog.create({
      data: { accountId: id, action: "PROFILE_LAUNCH_FAILED", detail: message.slice(0, 500) },
    });

    return NextResponse.json({ ok: false, message }, { status: 502 });
  }
}
