"use client";

/**
 * Một cú bấm để cấp khóa vùng operator cho một chiếc máy đã vào sổ.
 *
 * ## Ba chặng, và vì sao máy chủ chỉ có mặt ở chặng cuối
 *
 *   1. Nhờ **cầu nối của chính người đang bấm** bọc khóa cho khóa công khai của máy nhận.
 *   2. Nhận về một cái hộp — không phải khóa.
 *   3. Đẩy hộp lên máy chủ giữ hộ tới khi máy nhận mở web app.
 *
 * Khóa vùng operator không xuất hiện ở chặng nào trong ba chặng đó. Máy chủ nhận hộp và mở không
 * nổi; trang web cầm hộp và cũng mở không nổi. Đó là ranh giới của GĐ3, và nó được giữ bằng chỗ
 * đặt phép mã hóa chứ không bằng lời hứa của giao diện.
 *
 * ## `pingRelay()` ở dòng đầu, không await
 *
 * Ràng buộc 1 của spike GĐ0: lời gọi đầu tiên xuống `127.0.0.1` trên mỗi máy phải mang kích hoạt
 * người dùng, và kích hoạt mất sau vòng `await` đầu tiên. Bắn ping trước rồi mới await là cách
 * vừa giữ được kích hoạt cho hộp xin quyền, vừa có sẵn kết quả để nói đúng câu hỏng.
 */
import { useState, useTransition } from "react";
import type { ActionResult } from "@/lib/actions/action-result";
import {
  describeRelayFailure,
  pingRelay,
  sealOperatorKey,
} from "@/lib/relay/relay-browser-client";
import { grantOperatorKeyToDevice } from "@/lib/tickets/relay-device-actions";

export function RelayGrantKeyButton({
  deviceId,
  devicePublicKey,
  deviceName,
  /** Máy đã báo có khóa rồi — nút vẫn còn, vì sau mỗi lượt `vault:rekey` phải cấp lại. */
  alreadyReady,
}: {
  deviceId: string;
  devicePublicKey: string;
  deviceName: string;
  alreadyReady: boolean;
}) {
  const [pending, startTransition] = useTransition();
  const [result, setResult] = useState<ActionResult | null>(null);

  function grant() {
    const ping = pingRelay();

    startTransition(async () => {
      setResult(null);

      const sealedOutcome = await sealOperatorKey(devicePublicKey);
      if (sealedOutcome.status !== "ok") {
        setResult({
          ok: false,
          message:
            `Chưa bọc được khóa: ${describeRelayFailure(sealedOutcome, await ping)} — cầu nối ` +
            `TRÊN MÁY BẠN phải đang chạy và đã có khóa vùng operator, vì chính nó là nơi giữ khóa.`,
        });
        return;
      }

      const { ephemeralPublicKey, sealed } = sealedOutcome.data;
      if (!ephemeralPublicKey || !sealed) {
        setResult({
          ok: false,
          message: "Cầu nối trả lời nhưng thiếu phần của hộp khóa. Nhiều khả năng nó chạy bản cũ.",
        });
        return;
      }

      const formData = new FormData();
      formData.set("deviceId", deviceId);
      formData.set("ephemeralPublicKey", ephemeralPublicKey);
      formData.set("sealed", sealed);

      try {
        setResult(await grantOperatorKeyToDevice(null, formData));
      } catch {
        setResult({ ok: false, message: "Không lưu được hộp khóa. Xem log của dev server." });
      }
    });
  }

  return (
    <div className="space-y-2 text-right">
      <button
        type="button"
        disabled={pending}
        onClick={grant}
        className="rounded-md border border-emerald-300 px-3 py-1.5 text-xs text-emerald-700 transition hover:bg-emerald-50 disabled:opacity-50 dark:border-emerald-900 dark:text-emerald-400 dark:hover:bg-emerald-950"
        title={`Bọc khóa vùng operator cho máy "${deviceName}"`}
      >
        {pending ? "Đang cấp…" : alreadyReady ? "Cấp lại khóa" : "Cấp khóa"}
      </button>

      {result ? (
        <p
          className={
            result.ok
              ? "text-xs text-emerald-700 dark:text-emerald-400"
              : "text-xs text-red-700 dark:text-red-400"
          }
        >
          {result.message}
        </p>
      ) : null}
    </div>
  );
}
