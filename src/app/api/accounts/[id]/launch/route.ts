/**
 * Mở profile antidetect của một nick.
 *
 * Hai lớp chặn trước khi mở:
 *  1. Trạng thái nick phải cho phép (CHECKPOINT / SHADOWBANNED / DEAD thì không).
 *  2. Proxy phải còn gắn với nick — mở nhầm proxy là mất nick.
 */
import { NextResponse } from "next/server";
import { getStatusPresentation } from "@/lib/accounts/account-status";
import { AntidetectError } from "@/lib/antidetect/antidetect-browser-adapter";
import { getAntidetectAdapter } from "@/lib/antidetect/antidetect-adapter-factory";
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
    const launched = await adapter.launchProfile(account.antidetectProfileId);

    await prisma.$transaction([
      prisma.account.update({ where: { id }, data: { lastActionAt: new Date() } }),
      prisma.auditLog.create({
        data: {
          accountId: id,
          action: "PROFILE_LAUNCHED",
          detail: `${adapter.providerName} / proxy ${account.proxy.label}`,
        },
      }),
    ]);

    return NextResponse.json({
      ok: true,
      message:
        `Đã mở profile qua ${adapter.providerName}. Proxy gắn với nick này là ` +
        `${account.proxy.label} (${account.proxy.country}) — công cụ KHÔNG tự đẩy proxy sang ` +
        `trình duyệt, proxy phải được cấu hình trong chính profile bên ${adapter.providerName}. ` +
        `Mở ipinfo.io kiểm tra IP có khớp không TRƯỚC khi thao tác bất cứ thứ gì.`,
      // Chỉ dùng cho Phase 05; không hiển thị cho người dùng cuối.
      // MultiZen không trả về endpoint này — đó là bình thường, không phải lỗi.
      cdpEndpoint: launched.cdpEndpoint ?? null,
    });
  } catch (error) {
    const message =
      error instanceof AntidetectError
        ? error.message
        : "Lỗi không xác định khi mở profile antidetect.";

    await prisma.auditLog.create({
      data: { accountId: id, action: "PROFILE_LAUNCH_FAILED", detail: message.slice(0, 500) },
    });

    return NextResponse.json({ ok: false, message }, { status: 502 });
  }
}
