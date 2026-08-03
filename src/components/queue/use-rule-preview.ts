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
 *
 * Khóa CHÍNH LÀ body của request: một chuỗi duy nhất vừa nhận dạng lựa chọn vừa là thứ gửi đi,
 * nên không có đường nào để hai cái lệch nhau.
 */
import { useEffect, useState } from "react";
import type { ContentType } from "@/lib/content/content-types";
import type { RuleEvaluation } from "@/lib/rules/rules-engine";

export type PreviewState =
  | { status: "idle" }
  | { status: "loading" }
  | { status: "error"; message: string }
  | { status: "ready"; evaluation: RuleEvaluation };

/** Content lấy từ kho, hoặc nháp đang gõ dở ở tab "Viết mới". */
export type PreviewContent =
  | { contentItemId: string }
  | { draft: { type: ContentType; title: string; body: string; links: string[] } };

export interface PreviewSelection {
  /** `null` = chưa gõ/chọn đủ để chấm được. */
  content: PreviewContent | null;
  accountId: string;
  targetId: string;
  scheduledAt: string;
}

/**
 * Gõ ở tab "Viết mới" là mỗi ký tự một lần đổi lựa chọn. Không chờ thì mỗi phím gõ thành một
 * request; chờ chút rồi bắn giữ nguyên cảm giác "đèn chạy theo tay" mà không dội bộ luật.
 */
const DEBOUNCE_MS = 350;

/** Hai nhánh cuối của PreviewState — thứ duy nhất cần lưu, vì hai nhánh đầu suy ra được. */
type SettledState = Extract<PreviewState, { status: "error" | "ready" }>;

/** Body của request, cũng là khóa nhận dạng lựa chọn. Chuỗi rỗng = chưa chấm được. */
function requestBody(selection: PreviewSelection): string {
  const { content, accountId, targetId, scheduledAt } = selection;
  if (!content || !accountId || !targetId || !scheduledAt) return "";
  return JSON.stringify({ content, accountId, targetId, scheduledAt });
}

export function useRulePreview(selection: PreviewSelection): PreviewState {
  const key = requestBody(selection);
  const [settled, setSettled] = useState<{ key: string; state: SettledState } | null>(null);

  useEffect(() => {
    if (!key) return;

    const controller = new AbortController();
    const timer = setTimeout(() => {
      fetch("/api/rules/preview", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: key,
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
    }, DEBOUNCE_MS);

    return () => {
      clearTimeout(timer);
      controller.abort();
    };
  }, [key]);

  if (!key) return { status: "idle" };
  return settled?.key === key ? settled.state : { status: "loading" };
}
