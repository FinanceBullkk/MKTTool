"use server";

/**
 * Tạo job đăng bài.
 *
 * Bộ luật chạy LẠI ở đây chứ không tin kết quả xem trước gửi từ trình duyệt —
 * dữ liệu có thể đã đổi giữa lúc xem và lúc bấm lưu, và không bao giờ tin dữ liệu từ client.
 *
 * Content vào job theo hai đường: chọn từ kho, hoặc gõ mới ngay tại trang xếp lịch. Đường thứ
 * hai vẫn kết thúc bằng một ContentItem thật trong kho — xem saveDraftAsContentItem.
 *
 * Ghi đè luật thì bắt buộc có lý do và luôn để lại AuditLog.
 */
import { revalidatePath } from "next/cache";
import { z } from "zod";
import {
  contentItemCreateSchema,
  dateTimeInput,
  firstError,
  formToObject,
} from "@/lib/accounts/vault-form-schemas";
import type { ActionResult } from "@/lib/actions/action-result";
import { AUDIT_ACTIONS } from "@/lib/audit/audit-log-actions";
import { guardedAction } from "@/lib/auth/guarded-action";
import { parseLinksInput, stringifyLinks } from "@/lib/content/content-types";
import { prisma } from "@/lib/db/prisma-client";
import {
  isPlatformInRolloutScope,
  rolloutPlatformLabel,
} from "@/lib/platforms/rollout-scope";
import type { ContentSource } from "@/lib/rules/rule-context-builder";
import { serializeEvaluation, summarizeEvaluation } from "@/lib/rules/rules-engine";
import { canOverride } from "./post-job-override-policy";
import { joinReasons, previewPostJobRules } from "./post-job-rule-preview";

const jobFieldsSchema = z.object({
  accountId: z.string().min(1, "Select a nick"),
  targetId: z.string().min(1, "Select a posting target"),
  scheduledAt: dateTimeInput,
  overrideReason: z.preprocess(
    (value) => (typeof value === "string" && value.trim() === "" ? undefined : value),
    z.string().min(10, "Explain the override reason in at least 10 characters").optional(),
  ),
});

const fromLibrarySchema = z.object({ contentItemId: z.string().min(1, "Select content") });

/** Nháp dùng ĐÚNG bộ ô của kho content — vì lát nữa nó thành một bản ghi trong kho thật. */
const draftSchema = contentItemCreateSchema;

type DraftContent = z.infer<typeof draftSchema>;

type ContentInput =
  | { kind: "library"; contentItemId: string }
  | { kind: "draft"; draft: DraftContent; links: string[] };

/**
 * `contentMode` thiếu thì coi như chọn từ kho — đó là hành vi cũ, và mọi form gửi lên trước
 * khi có tab "Viết mới" đều thuộc dạng này.
 */
function parseContentInput(
  raw: Record<string, unknown>,
): { ok: true; input: ContentInput } | { ok: false; message: string } {
  if (raw.contentMode === "draft") {
    const parsed = draftSchema.safeParse(raw);
    if (!parsed.success) return { ok: false, message: firstError(parsed.error) };
    return {
      ok: true,
      input: { kind: "draft", draft: parsed.data, links: parseLinksInput(parsed.data.linksText) },
    };
  }

  const parsed = fromLibrarySchema.safeParse(raw);
  if (!parsed.success) return { ok: false, message: firstError(parsed.error) };
  return { ok: true, input: { kind: "library", contentItemId: parsed.data.contentItemId } };
}

function toContentSource(input: ContentInput): ContentSource {
  if (input.kind === "library") return { contentItemId: input.contentItemId };

  const { type, title, body } = input.draft;
  return { draft: { type, title, body, links: input.links } };
}

function parkedPostingMessage(platform: string): string {
  return (
    `${rolloutPlatformLabel(platform)} left the team rollout scope on 02/09/2026, so posting is disabled. ` +
    "This page is available only for viewing history. Return to the nick vault at /accounts; " +
    "contact the project owner if this workflow should be reopened."
  );
}

/**
 * Cất nháp vào kho rồi trả id để job trỏ vào.
 *
 * Bắt buộc phải lưu: luật 7 so bài mới với các ContentItem trong 30 ngày gần nhất. Job trỏ vào
 * một content ảo nghĩa là mỗi bài viết thẳng lại xóa một mẩu trí nhớ của luật đó, và nó mù dần
 * mà không có gì báo.
 *
 * Lưu SAU khi chấm luật, không phải trước — lưu trước thì bài này nằm trong kho đúng lúc luật 7
 * đi so, và nó tự thấy chính mình trùng 100% với chính mình.
 */
async function saveDraftAsContentItem(input: Extract<ContentInput, { kind: "draft" }>) {
  const { title, body, type, authorName } = input.draft;
  return prisma.contentItem.create({
    data: { title, body, type, authorName, links: stringifyLinks(input.links) },
    select: { id: true, title: true },
  });
}

export const createPostJob = guardedAction(async function createPostJob(
  actor,
  _prev: ActionResult | null,
  formData: FormData,
): Promise<ActionResult> {
  const raw = formToObject(formData);

  const content = parseContentInput(raw);
  if (!content.ok) return { ok: false, message: content.message };

  const fields = jobFieldsSchema.safeParse(raw);
  if (!fields.success) return { ok: false, message: firstError(fields.error) };

  const { overrideReason, ...job } = fields.data;

  // Chặn phạm vi TRƯỚC bộ luật, không phải sau.
  //
  // Bộ luật trả lời "bài này đăng lúc này có an toàn cho nick không". Phạm vi trả lời một câu
  // khác hẳn: "nền tảng này có còn được giao cho team không". Câu thứ hai không có ghi đè —
  // `overrideReason` mở được luật giữ nhịp, nhưng không mở được một quyết định phạm vi.
  //
  // Đặt trước còn để người bấm nhận đúng câu trả lời: xếp lịch cho một nền tảng đã đóng mà
  // nhận về "vướng luật 3, nhập lý do ghi đè" là chỉ đường sai — họ sẽ nhập lý do và vẫn bị
  // chặn, hoặc tệ hơn là ghi đè thành công vào một đường đăng lẽ ra đã khóa.
  const scheduledTarget = await prisma.platformTarget.findUnique({
    where: { id: job.targetId },
    select: { platform: true, name: true },
  });
  if (!scheduledTarget) {
    return { ok: false, message: "Posting target not found. Refresh the page and choose a target again." };
  }
  if (!isPlatformInRolloutScope(scheduledTarget.platform)) {
    return { ok: false, message: parkedPostingMessage(scheduledTarget.platform) };
  }

  const preview = await previewPostJobRules({ ...job, content: toContentSource(content.input) });
  if (!preview.ok) return { ok: false, message: preview.message };

  const { evaluation } = preview;

  // Cùng một phép quyết định với lúc chấm lại job — xem post-job-override-policy.ts.
  // Chỉ phần câu chữ là khác, vì người dùng cần biết mình vướng cái nào.
  if (evaluation.level === "BLOCK" && !canOverride(evaluation, overrideReason)) {
    return {
      ok: false,
      message: !evaluation.overridable
        ? `Cannot schedule because a blocking rule cannot be overridden. ${joinReasons(evaluation)} Choose another nick, target, or time.`
        : `Blocked: ${joinReasons(evaluation)} Enter an override reason if you still want to schedule.`,
    };
  }

  let contentItemId: string;
  let savedDraftTitle: string | null = null;
  if (content.input.kind === "draft") {
    const saved = await saveDraftAsContentItem(content.input);
    contentItemId = saved.id;
    savedDraftTitle = saved.title;
  } else {
    contentItemId = content.input.contentItemId;
  }

  // Job và dòng nhật ký ghi đè phải cùng sống hoặc cùng không có. Trước đây là hai lệnh rời, nên
  // một lần chết máy giữa chúng để lại một bài ĐÃ GHI ĐÈ LUẬT mà không ai biết ai bấm và vì sao —
  // đúng câu hỏi mà dòng nhật ký đó sinh ra để trả lời. Giao dịch tương tác (không phải mảng) vì
  // phần `detail` cần chính id của job vừa tạo.
  await prisma.$transaction(async (tx) => {
    const postJob = await tx.postJob.create({
      data: {
        ...job,
        contentItemId,
        status: "PENDING",
        ruleVerdicts: serializeEvaluation(evaluation),
        overrideReason: evaluation.level === "BLOCK" ? (overrideReason ?? null) : null,
      },
    });

    if (evaluation.level === "BLOCK") {
      await tx.auditLog.create({
        data: {
          accountId: job.accountId,
          action: AUDIT_ACTIONS.RULE_OVERRIDDEN,
          detail: `job ${postJob.id} — ${joinReasons(evaluation)} — reason: ${overrideReason}`.slice(
            0,
            900,
          ),
          actorId: actor.userId,
        },
      });
    }
  });

  revalidatePath("/queue");
  // Trang Hôm nay nhắc bài đăng tay trong 24 tiếng tới — job vừa xếp có thể thuộc luôn nhóm đó.
  revalidatePath("/");
  if (savedDraftTitle) {
    revalidatePath("/content");
    revalidatePath("/queue/new");
  }

  const savedNote = savedDraftTitle ? ` Content "${savedDraftTitle}" was saved to the library.` : "";
  return {
    ok: true,
    message:
      evaluation.level === "BLOCK"
        ? `Scheduled by overriding the rule. ${summarizeEvaluation(evaluation)}${savedNote}`
        : `Scheduled. ${summarizeEvaluation(evaluation)}${savedNote}`,
  };
});
