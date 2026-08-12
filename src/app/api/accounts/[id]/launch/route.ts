/**
 * Phát vé mở profile antidetect cho một nick.
 *
 * ## Route này từng tự mở profile. Nay nó phát vé, và lý do là địa lý
 *
 * MKT Browser exposes its configurable MCP server only on the operator machine loopback interface.
 * While this app runs on that same machine, the server can call it directly. Once the app runs on
 * Railway, the server loopback points to a different machine, so profile launch must go through the
 * operator Relay and the server sends a signed ticket instead.
 *
 * ## Năm lớp chặn, và chỉ lớp cuối rời khỏi máy chủ
 *
 *  1. Trạng thái nick phải cho phép (CHECKPOINT / SHADOWBANNED / DEAD thì không) — **ở đây**.
 *  2. Proxy phải còn gắn với nick — mở nhầm proxy là mất nick — **ở đây**.
 *  3. Proxy phải CÒN SỐNG và thật sự đổi IP — **ở đây**, vì mật khẩu proxy thuộc vùng khóa máy
 *     chủ nên chính máy chủ mới đi hỏi được. Đây cũng là lớp duy nhất hỏi người ngoài xem nick
 *     sắp lộ ra bằng IP nào.
 *  4. Nick phải ĐANG GHIM vào một chiếc máy còn dùng được, **và người bấm phải là chủ chiếc máy
 *     đó** — **ở đây**, xem `resolveNickDeviceRecipient`.
 *  5. The proxy must be applied successfully before the browser opens. The **Relay** enforces this
 *     because only it can communicate with MKT Browser. The rule stays the same; only the
 *     enforcement point moves.
 *
 * Bốn lớp đầu chạy TRƯỚC khi phát vé có chủ ý: vé đã ký là đã ra khỏi tầm với: máy chủ không thu
 * hồi được tấm vé nào. Kiểm sau khi ký là kiểm quá muộn.
 *
 * ## Lớp 4 thêm vào 07/08/2026, và nó đóng hai lỗ cùng lúc
 *
 * Previously, the ticket went to the **machine of the person clicking the button**. Clicking an
 * account owned by a colleague still issued a ticket, but the other Relay did not have that
 * profile and could only report a vague MKT Browser error. Worse, the ticket contains the
 * **decrypted proxy password**, and launch tickets intentionally bypass rate limiting. Any signed-in
 * user could therefore extract passwords for the entire proxy vault by clicking the button even
 * though `/proxies` never displays those passwords.
 *
 * Hỏi cuốn sổ *"nick này nằm ở máy nào"* thay vì đoán *"chắc là máy người đang bấm"* đóng cả hai.
 *
 * ## Nhật ký ghi "đã phát vé", không ghi "đã mở"
 *
 * Máy chủ không biết profile có mở được không — cầu nối theo QĐ 5 không nối mạng để báo về, và
 * tin lời trình duyệt khai thì hàng nhật ký chỉ đáng tin bằng chiếc tab đang mở. Ghi đúng thứ
 * mình biết còn hơn ghi thứ nghe kể.
 */
import { NextResponse } from "next/server";
import { getStatusPresentation } from "@/lib/accounts/account-status";
import { ProxyConfigError, buildProxyConfig } from "@/lib/antidetect/proxy-config-builder";
import { AUDIT_ACTIONS } from "@/lib/audit/audit-log-actions";
import { guardedRoute } from "@/lib/auth/guarded-route";
import { prisma } from "@/lib/db/prisma-client";
import { CROSS_ORIGIN_MESSAGE, isSameOrigin } from "@/lib/http/same-origin-guard";
import { checkProxyLiveness } from "@/lib/proxies/proxy-liveness-check";
import { issueTicket } from "@/lib/tickets/ticket-issuer";
import { resolveNickDeviceRecipient } from "@/lib/tickets/ticket-recipient-lookup";
import { TICKET_KINDS } from "@/lib/tickets/ticket-types";

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

  // Kiểm TRƯỚC khi phát vé: nhét một proxy đã chết vào profile rồi mới phát hiện là đã muộn —
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

  const recipient = await resolveNickDeviceRecipient(actor, id);
  if (!recipient.ok) {
    return NextResponse.json({ ok: false, message: recipient.message }, { status: 409 });
  }

  let ticket: string;
  try {
    const proxyConfig = buildProxyConfig(proxy);
    ticket = issueTicket(
      {
        kind: TICKET_KINDS.LAUNCH_PROFILE,
        accountId: id,
        antidetectProfileId,
        proxyLabel: proxy.label,
        proxy: proxyConfig,
      },
      recipient.recipient,
    );
  } catch (error) {
    const message =
      error instanceof ProxyConfigError
        ? error.message
        : "Không dựng được vé mở profile. Xem log của máy chủ.";
    return NextResponse.json({ ok: false, message }, { status: 502 });
  }

  await prisma.$transaction([
    prisma.account.update({ where: { id }, data: { lastActionAt: new Date() } }),
    prisma.auditLog.create({
      data: {
        accountId: id,
        action: AUDIT_ACTIONS.PROFILE_LAUNCH_TICKET_ISSUED,
        detail: `proxy ${proxy.label} (${proxy.protocol}) → máy "${recipient.recipient.deviceName}"`,
        actorId: actor.userId,
      },
    }),
  ]);

  return NextResponse.json({
    ok: true,
    ticket,
    deviceName: recipient.recipient.deviceName,
    // Câu này nói về phép đo của MÁY CHỦ. Việc đẩy proxy và mở profile có thành công không thì
    // cầu nối trả lời, và giao diện ghép hai câu lại.
    message:
      `Proxy ${proxy.label} (${proxy.country}, ${proxy.protocol}) kiểm xong: ${liveness.message} ` +
      `Lưu ý phép đo đó là của công cụ chứ không phải của trình duyệt — lần đầu mở một profile ` +
      `mới vẫn nên vào ipinfo.io đối chiếu lại.`,
  });
});
