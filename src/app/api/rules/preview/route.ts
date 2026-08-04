/**
 * Chạy thử bộ luật cho một dự định đăng — UI gọi lại mỗi lần đổi content/nick/đích/giờ.
 *
 * Chỉ đọc, không ghi gì. Trả về verdict đầy đủ để trang tạo job bật đèn xanh/vàng/đỏ ngay
 * trước khi người dùng bấm lưu.
 */
import { NextResponse } from "next/server";
import { z } from "zod";
import { dateTimeInput } from "@/lib/accounts/vault-form-schemas";
import { guardedRoute } from "@/lib/auth/guarded-route";
import { CONTENT_TYPES } from "@/lib/content/content-types";
import { CROSS_ORIGIN_MESSAGE, isSameOrigin } from "@/lib/http/same-origin-guard";
import { previewPostJobRules } from "@/lib/queue/post-job-rule-preview";

export const runtime = "nodejs";

/**
 * Content của lần chấm thử: lấy từ kho, hoặc nháp đang gõ dở ở tab "Viết mới".
 *
 * Nhánh nháp KHÔNG ghi gì vào database — nó chỉ đi vào bộ luật rồi biến mất cùng response.
 * Chỗ cất nháp thành ContentItem là createPostJob, lúc người dùng bấm xếp lịch.
 */
const contentSourceSchema = z.union([
  z.object({ contentItemId: z.string().min(1) }),
  z.object({
    draft: z.object({
      type: z.enum(CONTENT_TYPES),
      title: z.string().min(1),
      body: z.string().min(1),
      links: z.array(z.string()).default([]),
    }),
  }),
]);

const requestSchema = z.object({
  content: contentSourceSchema,
  accountId: z.string().min(1),
  targetId: z.string().min(1),
  scheduledAt: dateTimeInput,
  excludeJobId: z.string().optional(),
});

export const POST = guardedRoute(async function POST(_actor, request: Request) {
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
});
