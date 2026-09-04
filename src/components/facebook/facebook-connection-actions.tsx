"use client";

/** Nút kiểm tra toàn bộ token và nút ngắt kết nối một nick. */
import { useState, useTransition } from "react";
import { SMALL_BUTTON_CLASS as BUTTON_CLASS } from "@/components/ui/page-section";
import type { ActionResult } from "@/lib/actions/action-result";
import { checkAllPageTokens, disconnectConnection } from "@/lib/facebook/facebook-page-actions";

function ResultText({ result }: { result: ActionResult | null }) {
  if (!result) return null;
  return (
    <p
      className={
        result.ok
          ? "text-xs text-emerald-300"
          : "text-xs text-red-300"
      }
    >
      {result.message}
    </p>
  );
}

/**
 * Gọi thử Graph API bằng từng Page token.
 * Token chết không báo trước — nick admin đổi mật khẩu hay gỡ app là token thành rác ngay,
 * và điều đó chỉ lộ ra ở lần đăng tiếp theo nếu không chủ động kiểm.
 */
export function CheckTokensButton() {
  const [pending, startTransition] = useTransition();
  const [result, setResult] = useState<ActionResult | null>(null);

  return (
    <div className="space-y-2">
      <button
        type="button"
        className={BUTTON_CLASS}
        disabled={pending}
        onClick={() => startTransition(async () => setResult(await checkAllPageTokens()))}
      >
        {pending ? "Checking…" : "Check tokens for all Pages"}
      </button>
      <ResultText result={result} />
    </div>
  );
}

export function DisconnectConnectionButton({
  connectionId,
  name,
  pageCount,
}: {
  connectionId: string;
  name: string;
  pageCount: number;
}) {
  const [pending, startTransition] = useTransition();
  const [result, setResult] = useState<ActionResult | null>(null);
  const [confirming, setConfirming] = useState(false);

  return (
    <div className="space-y-1">
      {confirming ? (
        <div className="flex flex-wrap gap-1">
          <button
            type="button"
            className={BUTTON_CLASS}
            disabled={pending}
            onClick={() =>
              startTransition(async () => setResult(await disconnectConnection(connectionId)))
            }
          >
            Disconnect {name} and remove {pageCount} Pages?
          </button>
          <button type="button" className={BUTTON_CLASS} onClick={() => setConfirming(false)}>
            Cancel
          </button>
        </div>
      ) : (
        <button type="button" className={BUTTON_CLASS} onClick={() => setConfirming(true)}>
          Disconnect
        </button>
      )}
      <ResultText result={result} />
    </div>
  );
}
