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
        `Đã mở profile qua ${adapter.providerName} với proxy ${account.proxy.label} ` +
        `(${account.proxy.country}). Kiểm tra IP trong trình duyệt trước khi thao tác.`,
      // Chỉ dùng cho Phase 05; không hiển thị cho người dùng cuối.
      cdpEndpoint: launched.cdpEndpoint,
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
