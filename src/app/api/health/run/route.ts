/**
 * Dò sức khỏe MỘT nick ngay lập tức.
 *
 * Cố ý chỉ nhận một nick: dò cả đàn phải nghỉ 30-90 giây giữa các nick (xem health-check-runner.ts),
 * nên một lượt đầy đủ mất gần mười phút — dài hơn mọi giới hạn chờ hợp lý của một request HTTP.
 * Cả đàn là việc của `npm run health` chạy theo lịch hằng ngày; nút bấm ở đây để soi lại một
 * nick đáng ngờ ngay lúc đang nhìn nó.
 */
import { NextResponse } from "next/server";
import { HealthCheckBusyError } from "@/lib/health/health-check-lock";
import {
  HealthCheckSetupError,
  runHealthCheck,
} from "@/lib/health/health-check-runner";
import { ObserverSessionError } from "@/lib/health/observer-browser-session";
import { CROSS_ORIGIN_MESSAGE, isSameOrigin } from "@/lib/http/same-origin-guard";

export const runtime = "nodejs";
/** Mở trình duyệt + tải trang qua proxy có thể chạm ngưỡng mặc định của Next. */
export const maxDuration = 120;

export async function POST(request: Request) {
  if (!isSameOrigin(request)) {
    return NextResponse.json({ ok: false, message: CROSS_ORIGIN_MESSAGE }, { status: 403 });
  }

  let accountId: unknown;
  try {
    ({ accountId } = await request.json());
  } catch {
    return NextResponse.json({ ok: false, message: "Body không phải JSON." }, { status: 400 });
  }

  if (typeof accountId !== "string" || accountId.trim() === "") {
    return NextResponse.json(
      { ok: false, message: "Thiếu accountId. Dò cả đàn thì chạy `npm run health`." },
      { status: 400 },
    );
  }

  try {
    const result = await runHealthCheck({
      accountIds: [accountId],
      spacing: { minMs: 0, maxMs: 0 },
    });

    if (result.checked === 0) {
      return NextResponse.json(
        { ok: false, message: "Không tìm thấy nick Reddit này, hoặc nick đã ở trạng thái Đã chết." },
        { status: 404 },
      );
    }

    const [verdict] = Object.keys(result.byVerdict);
    const changed = result.statusChanges[0];

    return NextResponse.json({
      ok: true,
      verdict,
      message: changed
        ? `Kết quả: ${verdict}. Trạng thái nick đã đổi sang ${changed.to} — bộ luật sẽ chặn mọi job của nó.`
        : `Kết quả: ${verdict}.`,
    });
  } catch (error) {
    // Bận là chuyện bình thường, không phải hỏng — 409 để giao diện nói "chờ chút" thay vì
    // báo lỗi đỏ, và để lượt chạy theo lịch không bị người bấm nút chen ngang.
    if (error instanceof HealthCheckBusyError) {
      return NextResponse.json({ ok: false, message: error.message }, { status: 409 });
    }

    const message =
      error instanceof HealthCheckSetupError || error instanceof ObserverSessionError
        ? error.message
        : "Lỗi không xác định khi dò sức khỏe nick.";
    return NextResponse.json({ ok: false, message }, { status: 502 });
  }
}
