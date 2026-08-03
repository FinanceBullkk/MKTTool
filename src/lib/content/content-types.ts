/**
 * Từ vựng chung của hàng đợi content: loại content, trạng thái job, loại tương tác.
 *
 * Tách riêng khỏi logic để cả rules engine, server action và UI cùng dùng một bộ hằng số —
 * tránh cảnh mỗi nơi gõ chuỗi "PROMO" một kiểu.
 */

export const CONTENT_TYPES = ["VALUE", "PROMO"] as const;
export type ContentType = (typeof CONTENT_TYPES)[number];

export const CONTENT_TYPE_LABELS: Record<ContentType, string> = {
  VALUE: "Hữu ích",
  PROMO: "Quảng cáo",
};

export function isContentType(value: string): value is ContentType {
  return (CONTENT_TYPES as readonly string[]).includes(value);
}

export const JOB_STATUSES = ["PENDING", "BLOCKED", "POSTED", "FAILED", "SKIPPED"] as const;
export type JobStatus = (typeof JOB_STATUSES)[number];

interface JobStatusPresentation {
  label: string;
  className: string;
}

export const JOB_STATUS_PRESENTATION: Record<JobStatus, JobStatusPresentation> = {
  PENDING: {
    label: "Chờ đăng",
    className: "bg-sky-100 text-sky-800 dark:bg-sky-950 dark:text-sky-300",
  },
  BLOCKED: {
    label: "Bị chặn",
    className: "bg-red-100 text-red-800 dark:bg-red-950 dark:text-red-300",
  },
  POSTED: {
    label: "Đã đăng",
    className: "bg-emerald-100 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-300",
  },
  FAILED: {
    label: "Lỗi",
    className: "bg-orange-100 text-orange-800 dark:bg-orange-950 dark:text-orange-300",
  },
  SKIPPED: {
    label: "Bỏ qua",
    className: "bg-neutral-200 text-neutral-700 dark:bg-neutral-800 dark:text-neutral-400",
  },
};

export function getJobStatusPresentation(status: string): JobStatusPresentation {
  return (
    JOB_STATUS_PRESENTATION[status as JobStatus] ?? {
      label: status,
      className: "bg-neutral-200 text-neutral-700 dark:bg-neutral-800 dark:text-neutral-400",
    }
  );
}

/** Job còn "chiếm chỗ" trong lịch — dùng để đếm hạn mức, tỷ lệ promo, so trùng nội dung. */
export const ACTIVE_JOB_STATUSES: JobStatus[] = ["PENDING", "POSTED"];

/**
 * Job chưa chốt: còn đổi trạng thái và còn chấm lại luật được.
 *
 * POSTED/SKIPPED/FAILED là trạng thái cuối. Lật chúng lại làm bẩn đúng dữ liệu mà bộ luật
 * dựa vào để đếm, nên mọi đường ghi đều phải hỏi qua đây trước.
 */
export const OPEN_JOB_STATUSES: JobStatus[] = ["PENDING", "BLOCKED"];

export function isOpenJobStatus(status: string): boolean {
  return (OPEN_JOB_STATUSES as string[]).includes(status);
}

export const INTERACTION_KINDS = ["POST", "COMMENT", "UPVOTE"] as const;
export type InteractionKind = (typeof INTERACTION_KINDS)[number];

export const INTERACTION_KIND_LABELS: Record<InteractionKind, string> = {
  POST: "đăng bài",
  COMMENT: "bình luận",
  UPVOTE: "upvote",
};

export function getInteractionKindLabel(kind: string): string {
  return INTERACTION_KIND_LABELS[kind as InteractionKind] ?? kind;
}

/** Links lưu dạng JSON array trong SQLite. Dữ liệu hỏng thì coi như không có link. */
export function parseLinks(raw: string | null): string[] {
  if (!raw) return [];
  try {
    const parsed: unknown = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed.filter((item): item is string => typeof item === "string") : [];
  } catch {
    return [];
  }
}

export function stringifyLinks(links: string[]): string | null {
  return links.length > 0 ? JSON.stringify(links) : null;
}

/**
 * Ô link là textarea: mỗi dòng một link, cho phép dán cả cụm rồi tự tách.
 *
 * Nằm ở đây chứ không ở content-item-actions.ts vì file đó là `"use server"` — mọi thứ export
 * ra từ đó đều thành endpoint HTTP. Kho content và tab "Viết mới" ở trang xếp lịch phải tách
 * link y hệt nhau, nếu không cùng một ô nhập lại ra hai kết quả khác nhau tùy đường vào.
 */
export function parseLinksInput(raw: string | undefined): string[] {
  if (!raw) return [];
  return [...new Set(raw.split(/[\s,]+/).map((item) => item.trim()).filter(Boolean))];
}
