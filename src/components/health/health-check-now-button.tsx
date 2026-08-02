"use client";

/**
 * "Dò lại ngay" cho một nick.
 *
 * Chỉ một nick mỗi lần — lý do ở đầu `app/api/health/run/route.ts`. Mất vài giây vì phải mở
 * trình duyệt và tải trang qua proxy, nên nút phải nói rõ là đang chạy chứ không đứng im.
 */
import { useRouter } from "next/navigation";
import { useState } from "react";

export function HealthCheckNowButton({ accountId }: { accountId: string }) {
  const router = useRouter();
  const [pending, setPending] = useState(false);
  const [message, setMessage] = useState<{ tone: "ok" | "cho" | "loi"; text: string } | null>(null);

  async function run() {
    setPending(true);
    setMessage(null);
    try {
      const response = await fetch("/api/health/run", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ accountId }),
      });
      const data: { ok: boolean; message: string } = await response.json();

      // 409 = đang có lượt dò khác chạy. Đó là chuyện bình thường, không phải hỏng —
      // tô đỏ nó là dạy người dùng bỏ qua màu đỏ.
      const tone = data.ok ? "ok" : response.status === 409 ? "cho" : "loi";
      setMessage({ tone, text: data.message });
      if (data.ok) router.refresh();
    } catch {
      setMessage({ tone: "loi", text: "Không gọi được bộ dò. Xem log của dev server." });
    } finally {
      setPending(false);
    }
  }

  const TONE_CLASS = {
    ok: "text-neutral-600 dark:text-neutral-400",
    cho: "text-amber-700 dark:text-amber-400",
    loi: "text-red-700 dark:text-red-400",
  } as const;

  return (
    <div className="space-y-1 text-right">
      <button
        type="button"
        onClick={run}
        disabled={pending}
        className="rounded-md border border-neutral-300 px-2 py-1 text-xs transition hover:bg-neutral-100 disabled:opacity-50 dark:border-neutral-700 dark:hover:bg-neutral-800"
      >
        {pending ? "Đang dò…" : "Dò lại ngay"}
      </button>
      {message ? <p className={`text-xs ${TONE_CLASS[message.tone]}`}>{message.text}</p> : null}
    </div>
  );
}
