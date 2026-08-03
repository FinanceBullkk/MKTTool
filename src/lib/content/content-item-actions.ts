"use server";

/**
 * Server action cho kho content.
 *
 * Content chỉ là văn bản team tự viết — không mã hóa, nhưng cũng không bao giờ log ra console
 * vì thân bài hay chứa link sản phẩm kèm tham số theo dõi.
 */
import { revalidatePath } from "next/cache";
import {
  contentItemCreateSchema,
  contentItemUpdateSchema,
  firstError,
  formToObject,
} from "@/lib/accounts/vault-form-schemas";
import type { ActionResult } from "@/lib/actions/action-result";
import { prisma } from "@/lib/db/prisma-client";
import { describeUnexpectedDbError } from "@/lib/db/prisma-error-helpers";
import { blockDeleteWhenReferenced } from "@/lib/db/reference-guard";
import { describeRecheck, recheckJobsMatching } from "@/lib/queue/recheck-jobs-batch";
import { parseLinksInput, stringifyLinks } from "./content-types";

export async function createContentItem(
  _prev: ActionResult | null,
  formData: FormData,
): Promise<ActionResult> {
  const parsed = contentItemCreateSchema.safeParse(formToObject(formData));
  if (!parsed.success) return { ok: false, message: firstError(parsed.error) };

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

/**
 * Sửa content rồi chấm lại mọi job đang chờ dùng nó.
 *
 * Bắt buộc phải chấm lại: độ trùng nội dung (luật 7) và chính sách link (luật 9) đều tính
 * trên thân bài, còn tỷ lệ promo (luật 6) tính trên `type`. Sửa xong mà để verdict cũ nằm im
 * là hàng đợi hiện đèn xanh cho một bài đã khác hẳn bài từng được chấm.
 */
export async function updateContentItem(
  _prev: ActionResult | null,
  formData: FormData,
): Promise<ActionResult> {
  const parsed = contentItemUpdateSchema.safeParse(formToObject(formData));
  if (!parsed.success) return { ok: false, message: firstError(parsed.error) };

  const { id, linksText, ...rest } = parsed.data;

  try {
    await prisma.contentItem.update({
      where: { id },
      data: { ...rest, links: stringifyLinks(parseLinksInput(linksText)) },
    });
  } catch (error) {
    return { ok: false, message: describeUnexpectedDbError(error, "sửa content") };
  }

  const recheck = await recheckJobsMatching({ contentItemId: id });

  revalidatePath("/content");
  revalidatePath(`/content/${id}`);
  revalidatePath("/queue");
  return { ok: true, message: `Đã lưu "${rest.title}".${describeRecheck(recheck)}` };
}

export async function deleteContentItem(contentItemId: string): Promise<ActionResult> {
  const item = await prisma.contentItem.findUnique({
    where: { id: contentItemId },
    include: { _count: { select: { jobs: true } } },
  });
  if (!item) return { ok: false, message: "Không tìm thấy content." };

  const blocked = blockDeleteWhenReferenced(
    `content "${item.title}"`,
    [{ label: "job đã xếp lịch", count: item._count.jobs }],
    "Bài đã xếp lịch là dữ liệu bộ luật dùng để so trùng cho những bài sau — bỏ qua job đó " +
      "ở hàng đợi thay vì xóa bài gốc.",
  );
  if (blocked) return { ok: false, message: blocked.message };

  try {
    await prisma.contentItem.delete({ where: { id: contentItemId } });
  } catch (error) {
    return { ok: false, message: describeUnexpectedDbError(error, "xóa content") };
  }

  revalidatePath("/content");
  return { ok: true, message: `Đã xóa "${item.title}".` };
}
