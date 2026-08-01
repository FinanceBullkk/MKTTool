"use client";

/**
 * Gọi /api/rules/preview mỗi lần người dùng đổi lựa chọn.
 *
 * Hủy request cũ khi lựa chọn đổi tiếp — nếu không, phản hồi chậm của lần chọn trước
 * có thể về sau và ghi đè verdict của lần chọn hiện tại (đèn xanh sai = mất nick).
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

export function useRulePreview(selection: PreviewSelection): PreviewState {
  const { contentItemId, accountId, targetId, scheduledAt } = selection;
  const [preview, setPreview] = useState<PreviewState>({ status: "idle" });

  useEffect(() => {
    if (!contentItemId || !accountId || !targetId || !scheduledAt) {
      setPreview({ status: "idle" });
      return;
    }

    const controller = new AbortController();
    setPreview({ status: "loading" });

    fetch("/api/rules/preview", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ contentItemId, accountId, targetId, scheduledAt }),
      signal: controller.signal,
    })
      .then((response) => response.json())
      .then((data: { ok: boolean; evaluation?: RuleEvaluation; message?: string }) => {
        if (data.ok && data.evaluation) setPreview({ status: "ready", evaluation: data.evaluation });
        else setPreview({ status: "error", message: data.message ?? "Không chạy được bộ luật." });
      })
      .catch((error: unknown) => {
        if (error instanceof DOMException && error.name === "AbortError") return;
        setPreview({ status: "error", message: "Không gọi được bộ luật." });
      });

    return () => controller.abort();
  }, [contentItemId, accountId, targetId, scheduledAt]);

  return preview;
}
