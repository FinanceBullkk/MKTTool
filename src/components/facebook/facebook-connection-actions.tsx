"use client";

/** Nút kiểm tra toàn bộ token và nút ngắt kết nối một nick. */
import { useState, useTransition } from "react";
import type { ActionResult } from "@/lib/accounts/account-actions";
import { checkAllPageTokens, disconnectConnection } from "@/lib/facebook/facebook-page-actions";

const BUTTON_CLASS =
  "rounded-md border border-neutral-300 px-3 py-1.5 text-xs transition hover:bg-neutral-100 " +
  "disabled:opacity-50 dark:border-neutral-700 dark:hover:bg-neutral-800";

function ResultText({ result }: { result: ActionResult | null }) {
  if (!result) return null;
  return (
    <p
      className={
        result.ok
          ? "text-xs text-emerald-700 dark:text-emerald-400"
          : "text-xs text-red-700 dark:text-red-400"
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
        {pending ? "Đang kiểm tra…" : "Kiểm tra token tất cả Page"}
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
            Ngắt {name} và gỡ {pageCount} Page?
          </button>
          <button type="button" className={BUTTON_CLASS} onClick={() => setConfirming(false)}>
            Thôi
          </button>
        </div>
      ) : (
        <button type="button" className={BUTTON_CLASS} onClick={() => setConfirming(true)}>
          Ngắt kết nối
        </button>
      )}
      <ResultText result={result} />
    </div>
  );
}
