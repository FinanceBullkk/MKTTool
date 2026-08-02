/**
 * Chạy thử bộ luật cho một dự định đăng — UI gọi lại mỗi lần đổi content/nick/đích/giờ.
 *
 * Chỉ đọc, không ghi gì. Trả về verdict đầy đủ để trang tạo job bật đèn xanh/vàng/đỏ ngay
 * trước khi người dùng bấm lưu.
 */
import { NextResponse } from "next/server";
import { z } from "zod";
import { CROSS_ORIGIN_MESSAGE, isSameOrigin } from "@/lib/http/same-origin-guard";
import { previewPostJobRules } from "@/lib/queue/post-job-rule-preview";

export const runtime = "nodejs";

const requestSchema = z.object({
  contentItemId: z.string().min(1),
  accountId: z.string().min(1),
  targetId: z.string().min(1),
  scheduledAt: z.coerce.date(),
  excludeJobId: z.string().optional(),
});

export async function POST(request: Request) {
  if (!isSameOrigin(request)) {
    return NextResponse.json({ ok: false, message: CROSS_ORIGIN_MESSAGE }, { status: 403 });
  }

  let payload: unknown;
  try {
    payload = await request.json();
  } catch {
    return NextResponse.json({ ok: false, message: "Body không phải JSON." }, { status: 400 });
  }

  const parsed = requestSchema.safeParse(payload);
  if (!parsed.success) {
    return NextResponse.json({ ok: false, message: "Thiếu content, nick, đích hoặc giờ đăng." }, { status: 400 });
  }

  const result = await previewPostJobRules(parsed.data);
  return NextResponse.json(result, { status: result.ok ? 200 : 404 });
}
