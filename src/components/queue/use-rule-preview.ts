"use client";

/**
 * Gọi /api/rules/preview mỗi lần người dùng đổi lựa chọn.
 *
 * Hủy request cũ khi lựa chọn đổi tiếp — nếu không, phản hồi chậm của lần chọn trước
 * có thể về sau và ghi đè verdict của lần chọn hiện tại (đèn xanh sai = mất nick).
 *
 * "Chưa chọn đủ" và "đang chạy" đều SUY RA từ lựa chọn hiện tại chứ không lưu thành state:
 * kết quả trả về mang theo khóa của lựa chọn đã sinh ra nó, nên khóa lệch nghĩa là thứ đang
 * cầm thuộc về lựa chọn cũ. Nhờ vậy effect chỉ ghi state trong callback bất đồng bộ, không
 * ghi thẳng trong thân effect — bớt một lượt render thừa mỗi lần đổi lựa chọn, và khóa trở
 * thành lớp chặn thứ hai cho phản hồi lạc nếu abort vì lý do nào đó không kịp.
 */
import { useEffect, useState } from "react";
import type { RuleEvaluation } from "@/lib/rules/rules-engine";

export type PreviewState =
  | { status: "idle" }
  | { status: "loading" }
  | { status: "error"; message: string }
  | { status: "ready"; evaluation: RuleEvaluation };

export interface PreviewSelection {
  contentItemId: string;
  accountId: string;
  targetId: string;
  scheduledAt: string;
}

/** Hai nhánh cuối của PreviewState — thứ duy nhất cần lưu, vì hai nhánh đầu suy ra được. */
type SettledState = Extract<PreviewState, { status: "error" | "ready" }>;

/** Khóa nhận dạng một lựa chọn. Chuỗi rỗng = chưa chọn đủ bốn ô. */
function selectionKey(selection: PreviewSelection): string {
  const { contentItemId, accountId, targetId, scheduledAt } = selection;
  if (!contentItemId || !accountId || !targetId || !scheduledAt) return "";
  return JSON.stringify([contentItemId, accountId, targetId, scheduledAt]);
}

export function useRulePreview(selection: PreviewSelection): PreviewState {
  const { contentItemId, accountId, targetId, scheduledAt } = selection;
  const key = selectionKey(selection);
  const [settled, setSettled] = useState<{ key: string; state: SettledState } | null>(null);

  useEffect(() => {
    if (!key) return;

    const controller = new AbortController();

    fetch("/api/rules/preview", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ contentItemId, accountId, targetId, scheduledAt }),
      signal: controller.signal,
    })
      .then((response) => response.json())
      .then((data: { ok: boolean; evaluation?: RuleEvaluation; message?: string }) => {
        setSettled({
          key,
          state:
            data.ok && data.evaluation
              ? { status: "ready", evaluation: data.evaluation }
              : { status: "error", message: data.message ?? "Không chạy được bộ luật." },
        });
      })
      .catch((error: unknown) => {
        if (error instanceof DOMException && error.name === "AbortError") return;
        setSettled({ key, state: { status: "error", message: "Không gọi được bộ luật." } });
      });

    return () => controller.abort();
  }, [key, contentItemId, accountId, targetId, scheduledAt]);

  if (!key) return { status: "idle" };
  return settled?.key === key ? settled.state : { status: "loading" };
}
