/**
 * Mở profile antidetect của một nick.
 *
 * Bốn lớp chặn trước khi mở:
 *  1. Trạng thái nick phải cho phép (CHECKPOINT / SHADOWBANNED / DEAD thì không).
 *  2. Proxy phải còn gắn với nick — mở nhầm proxy là mất nick.
 *  3. Proxy phải CÒN SỐNG và thật sự đổi IP. Ba lớp còn lại chỉ kiểm những thứ mình TỰ KHAI;
 *     riêng lớp này đi hỏi người ngoài xem nick sắp lộ ra bằng IP nào.
 *  4. Proxy phải ĐẨY ĐƯỢC sang trình duyệt. Đẩy hỏng thì dừng, không mở:
 *     profile không có proxy sẽ chạy thẳng bằng IP nhà, và không ai nhận ra cho tới khi mất nick.
 */
import { NextResponse } from "next/server";
import { getStatusPresentation } from "@/lib/accounts/account-status";
import { AntidetectError } from "@/lib/antidetect/antidetect-browser-adapter";
import { getAntidetectAdapter } from "@/lib/antidetect/antidetect-adapter-factory";
import { ProxyConfigError, buildProxyConfig } from "@/lib/antidetect/proxy-config-builder";
import { AUDIT_ACTIONS } from "@/lib/audit/audit-log-actions";
import { guardedRoute } from "@/lib/auth/guarded-route";
import { prisma } from "@/lib/db/prisma-client";
import { CROSS_ORIGIN_MESSAGE, isSameOrigin } from "@/lib/http/same-origin-guard";
import { checkProxyLiveness } from "@/lib/proxies/proxy-liveness-check";

export const runtime = "nodejs";

export const POST = guardedRoute(async function POST(
  actor,
  request: Request,
  context: { params: Promise<{ id: string }> },
) {
  // Route handler không được Next kiểm Origin sẵn như server action — xem same-origin-guard.ts.
  if (!isSameOrigin(request)) {
    return NextResponse.json({ ok: false, message: CROSS_ORIGIN_MESSAGE }, { status: 403 });
  }

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

  // Nick Facebook được phép không có proxy lẫn profile antidetect — Fanpage đăng bằng Graph API
  // nên không cần cả hai. Nhưng "không cần" khác "mở được": tới đây mà thiếu thì phải nói rõ,
  // vì nhánh dưới sẽ mở một profile không có proxy, tức là chạy bằng IP nhà.
  const { proxy, antidetectProfileId } = account;
  if (!antidetectProfileId || !proxy) {
    const thieu = [
      !antidetectProfileId ? "id profile antidetect" : null,
      !proxy ? "proxy" : null,
    ].filter(Boolean);
    return NextResponse.json(
      {
        ok: false,
        message:
          `Nick này chưa có ${thieu.join(" và ")}, nên không mở profile được. ` +
          (account.platform === "FACEBOOK"
            ? "Nick Facebook không bắt buộc có hai thứ đó vì Fanpage đăng bằng Graph API — " +
              "muốn mở trình duyệt riêng cho nó thì vào trang chi tiết nick khai thêm."
            : "Vào trang chi tiết nick khai đủ rồi thử lại."),
      },
      { status: 409 },
    );
  }

  // Kiểm TRƯỚC khi đẩy: nhét một proxy đã chết vào profile rồi mới phát hiện là đã muộn —
  // profile giữ nguyên cấu hình đó và lần mở sau có thể không đi qua đây nữa.
  const liveness = await checkProxyLiveness(proxy);
  if (liveness.blocksLaunch) {
    await prisma.auditLog.create({
      data: {
        accountId: id,
        action: AUDIT_ACTIONS.PROFILE_LAUNCH_BLOCKED_PROXY,
        detail: `proxy ${proxy.label} — ${liveness.verdict}: ${liveness.message}`.slice(0, 500),
        actorId: actor.userId,
      },
    });
    return NextResponse.json(
      {
        ok: false,
        message:
          `Không mở profile — proxy "${proxy.label}" không dùng được: ${liveness.message} ` +
          `Sửa hoặc đổi proxy ở /proxies rồi thử lại.`,
      },
      { status: 409 },
    );
  }

  const adapter = getAntidetectAdapter();

  try {
    // Đẩy proxy TRƯỚC khi mở. Thứ tự này quan trọng: profile đã mở rồi mới đổi proxy
    // thì phiên đang chạy vẫn đi bằng IP cũ.
    const proxyConfig = buildProxyConfig(proxy);
    await adapter.applyProxy(antidetectProfileId, proxyConfig);

    const launched = await adapter.launchProfile(antidetectProfileId);

    await prisma.$transaction([
      prisma.account.update({ where: { id }, data: { lastActionAt: new Date() } }),
      prisma.auditLog.create({
        data: {
          accountId: id,
          action: AUDIT_ACTIONS.PROFILE_LAUNCHED,
          detail: `${adapter.providerName} / proxy ${proxy.label} (${proxyConfig.protocol})`,
          actorId: actor.userId,
        },
      }),
    ]);

    return NextResponse.json({
      ok: true,
      message:
        `Đã đẩy proxy ${proxy.label} (${proxy.country}, ${proxyConfig.protocol}) ` +
        `vào profile rồi mở qua ${adapter.providerName}. ${liveness.message} ` +
        `Lưu ý phép đo đó là của công cụ chứ không phải của trình duyệt — lần đầu mở một ` +
        `profile mới vẫn nên vào ipinfo.io đối chiếu lại.`,
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
      data: {
        accountId: id,
        action: AUDIT_ACTIONS.PROFILE_LAUNCH_FAILED,
        detail: message.slice(0, 500),
        actorId: actor.userId,
      },
    });

    return NextResponse.json({ ok: false, message }, { status: 502 });
  }
});
