"use server";

/**
 * Server action cho kho content.
 *
 * Content chỉ là văn bản team tự viết — không mã hóa, nhưng cũng không bao giờ log ra console
 * vì thân bài hay chứa link sản phẩm kèm tham số theo dõi.
 */
import { revalidatePath } from "next/cache";
import { z } from "zod";
import type { ActionResult } from "@/lib/accounts/account-actions";
import { prisma } from "@/lib/db/prisma-client";
import { CONTENT_TYPES, stringifyLinks } from "./content-types";

const contentItemSchema = z.object({
  title: z.string().min(1, "Tiêu đề không được để trống"),
  body: z.string().min(1, "Thân bài không được để trống"),
  type: z.enum(CONTENT_TYPES),
  authorName: z.string().min(1, "Ghi tên người viết để sau còn truy được"),
  linksText: z.string().optional(),
});

/** Ô link là textarea: mỗi dòng một link, cho phép dán cả cụm rồi tự tách. */
function parseLinksInput(raw: string | undefined): string[] {
  if (!raw) return [];
  return [...new Set(raw.split(/[\s,]+/).map((item) => item.trim()).filter(Boolean))];
}

export async function createContentItem(
  _prev: ActionResult | null,
  formData: FormData,
): Promise<ActionResult> {
  const parsed = contentItemSchema.safeParse(Object.fromEntries(formData.entries()));
  if (!parsed.success) {
    return { ok: false, message: parsed.error.issues[0]?.message ?? "Dữ liệu không hợp lệ" };
  }

  const { linksText, ...rest } = parsed.data;

  await prisma.contentItem.create({
    data: { ...rest, links: stringifyLinks(parseLinksInput(linksText)) },
  });

  revalidatePath("/content");
  revalidatePath("/queue/new");
  return {
    ok: true,
    message: `Đã lưu "${parsed.data.title}". Sang hàng đợi để xếp lịch đăng.`,
  };
}
