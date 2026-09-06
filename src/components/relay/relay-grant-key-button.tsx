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
 * ## Why this button deliberately ignores row locality
 *
 * Other local-only actions use `relayDeviceLocality` because they operate on the selected PC's
 * disk. This action instead asks the operator's current Relay to seal a grant for the selected
 * recipient public key. Restricting it to the selected row's PC would hide the action where it is
 * specifically intended to work.
 *
 * ## `pingRelay()` ở dòng đầu, không await
 *
 * Ràng buộc 1 của spike GĐ0: lời gọi đầu tiên xuống `127.0.0.1` trên mỗi máy phải mang kích hoạt
 * người dùng, và kích hoạt mất sau vòng `await` đầu tiên. Bắn ping trước rồi mới await là cách
 * vừa giữ được kích hoạt cho hộp xin quyền, vừa có sẵn kết quả để nói đúng câu hỏng.
 */
import { useState, useTransition } from "react";
import { SMALL_BUTTON_CLASS } from "@/components/ui/page-section";
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
            `The operator key could not be sealed: ${describeRelayFailure(sealedOutcome, await ping)} ` +
            `Relay ON YOUR PC must be running and already hold the operator key because it is the key custodian.`,
        });
        return;
      }

      const { ephemeralPublicKey, sealed } = sealedOutcome.data;
      if (!ephemeralPublicKey || !sealed) {
        setResult({
          ok: false,
          message:
            "Relay responded, but the sealed key grant is incomplete. Update Relay, then grant the operator key again.",
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
        setResult({
          ok: false,
          message: "The sealed key grant could not be saved. Check the development server log, then try again.",
        });
      }
    });
  }

  return (
    <div className="space-y-2 text-right">
      <button
        type="button"
        disabled={pending}
        onClick={grant}
        className={SMALL_BUTTON_CLASS}
        title={`Seal the operator key for Relay PC "${deviceName}"`}
      >
        {pending ? "Granting..." : alreadyReady ? "Grant operator key again" : "Grant operator key"}
      </button>

      {result ? (
        <p
          className={
            result.ok
              ? "text-xs text-emerald-300"
              : "text-xs text-red-300"
          }
        >
          {result.message}
        </p>
      ) : null}
    </div>
  );
}
