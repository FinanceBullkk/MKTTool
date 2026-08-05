"use client";

/**
 * Panel thao tác kho danh tính: mật khẩu, mã OTP, mở profile.
 *
 * ## Trang này không còn chạm vào bí mật, và không phải vì lịch sự
 *
 * Bản cũ gọi server action rồi nhận mật khẩu dạng trần về, chép vào clipboard. Nghĩa là mật khẩu
 * đi qua bộ nhớ của một trang web hosted — chỗ mà một script chèn được, một extension, hay chính
 * máy chủ bị chiếm đều đọc được. Nay nó chỉ cầm một tấm **vé**: một chuỗi đã mã hóa cho riêng
 * chiếc máy đang ngồi, hết hạn sau 30 giây. Mở devtools lúc bấm nút thì đó là tất cả những gì
 * thấy được.
 *
 * ## Hai kiểu gọi cầu nối, và vì sao phải là hai (QĐ 3)
 *
 * | Việc | Đường đi | Vì sao |
 * |---|---|---|
 * | Mật khẩu, OTP | **mở tab** của cầu nối | Tab đó **cùng nguồn với cầu nối** nên không dính luật Local Network Access — lấy được mật khẩu kể cả trên máy chưa bấm "Cho phép". Và bí mật hiện ra ở tab của cầu nối, không bao giờ vào trang web |
 * | Mở profile | fetch ngầm | Không có gì để hiện cho người dùng xem; mở thêm một tab trống chỉ để đóng lại là phiền |
 *
 * ## Ràng buộc 1 của spike GĐ0 nằm ở đâu trong file này
 *
 * Ở `launchProfile()`: `pingRelay()` là **dòng đầu tiên và không được await**. Xem chú thích đầu
 * `relay-browser-client.ts` — sai chỗ này thì trên chiếc máy chưa cấp quyền, hộp xin quyền không
 * bao giờ hiện ra và nút im lặng mãi mãi.
 */
import { useState } from "react";
import {
  requestCredentialTicket,
  requestOtpTicket,
} from "@/lib/accounts/vault-credential-actions";
import { describeRelayFailure, pingRelay, sendTicketToRelay } from "@/lib/relay/relay-browser-client";
import { relaySecretUrl } from "@/lib/relay/relay-endpoints";

type Feedback = { kind: "ok" | "error"; text: string } | null;

const BUTTON_CLASS =
  "rounded-md border border-neutral-300 px-3 py-1.5 text-sm transition " +
  "hover:bg-neutral-100 disabled:opacity-50 dark:border-neutral-700 dark:hover:bg-neutral-800";

/** Cửa sổ nhỏ vừa đủ cho một mật khẩu và một nút chép. */
const SECRET_WINDOW_FEATURES = "width=460,height=360,noopener";

const POPUP_BLOCKED_MESSAGE =
  "Trình duyệt chặn cửa sổ bật lên, nên không mở được tab của cầu nối. Cho phép popup cho trang " +
  "này rồi bấm lại — bí mật chỉ hiện ở tab do cầu nối phục vụ, không hiện trên trang này.";

export interface RelayDeviceOption {
  id: string;
  name: string;
}

export function AccountVaultActionsPanel({
  accountId,
  hasTotp,
  canLaunch,
  launchBlockedReason,
  relayDevices,
}: {
  accountId: string;
  hasTotp: boolean;
  canLaunch: boolean;
  launchBlockedReason: string;
  /** Máy chạy cầu nối đang dùng của **người đang xem**. Xem resolveTicketRecipient. */
  relayDevices: RelayDeviceOption[];
}) {
  const [feedback, setFeedback] = useState<Feedback>(null);
  const [busy, setBusy] = useState(false);
  // Một máy thì không hỏi; nhiều máy thì máy mới nhất là mặc định hợp lý nhất — người vừa cài
  // thêm một máy thường đang ngồi ở chính nó.
  const [deviceId, setDeviceId] = useState(relayDevices[0]?.id ?? "");

  /**
   * Mở tab của cầu nối kèm vé.
   *
   * Cửa sổ được mở **trước** khi xin vé, lúc cú bấm còn nguyên giá trị: mở sau một vòng `await`
   * là rơi thẳng vào bộ chặn popup của mọi trình duyệt. Xin vé hỏng thì đóng lại ngay.
   */
  async function openSecretTab(request: () => Promise<unknown>, label: string) {
    const win = window.open("", "_blank", SECRET_WINDOW_FEATURES);
    if (!win) {
      setFeedback({ kind: "error", text: POPUP_BLOCKED_MESSAGE });
      return;
    }

    setBusy(true);
    setFeedback(null);
    try {
      const result = (await request()) as
        | { ticket: string; deviceName: string }
        | { ok: false; message: string };

      if ("ok" in result) {
        win.close();
        setFeedback({ kind: "error", text: result.message });
        return;
      }

      win.location.href = relaySecretUrl(result.ticket);
      setFeedback({
        kind: "ok",
        text:
          `Đã gửi vé ${label} sang máy "${result.deviceName}". Cửa sổ vừa mở là của cầu nối trên ` +
          `máy bạn — không thấy gì hiện ra nghĩa là cầu nối chưa chạy.`,
      });
    } catch {
      win.close();
      setFeedback({
        kind: "error",
        text: `Không xin được vé ${label}. Tải lại trang rồi thử lại.`,
      });
    } finally {
      setBusy(false);
    }
  }

  async function launchProfile() {
    // ⚠️ Dòng đầu, KHÔNG await — ràng buộc 1 của spike GĐ0. Xem chú thích đầu file.
    const ping = pingRelay();

    setBusy(true);
    setFeedback(null);
    try {
      const query = deviceId ? `?deviceId=${encodeURIComponent(deviceId)}` : "";
      const response = await fetch(`/api/accounts/${accountId}/launch${query}`, { method: "POST" });
      const body = (await response.json()) as { ok: boolean; message: string; ticket?: string };

      if (!body.ok || !body.ticket) {
        setFeedback({ kind: "error", text: body.message });
        return;
      }

      const sent = await sendTicketToRelay(body.ticket);
      if (sent.status === "ok") {
        setFeedback({ kind: "ok", text: `${sent.data.message} ${body.message}` });
        return;
      }

      setFeedback({ kind: "error", text: describeRelayFailure(sent, await ping) });
    } catch {
      setFeedback({ kind: "error", text: "Không gọi được API phát vé mở profile." });
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="space-y-4">
      {relayDevices.length === 0 ? (
        <p className="rounded-md border border-amber-300 bg-amber-50 px-3 py-2 text-sm text-amber-800 dark:border-amber-900 dark:bg-amber-950 dark:text-amber-300">
          Máy bạn đang ngồi chưa có trong sổ cầu nối, nên chưa lấy được mật khẩu, mã OTP hay mở
          được profile. Cài cầu nối rồi nhờ quản trị viên ghi khóa công khai của nó vào sổ ở{" "}
          <a href="/relay-devices" className="underline">
            /relay-devices
          </a>
          .
        </p>
      ) : null}

      {relayDevices.length > 1 ? (
        <label className="block text-sm">
          <span className="mb-1 block text-xs font-medium text-neutral-600 dark:text-neutral-400">
            Máy bạn đang ngồi
          </span>
          <select
            className="rounded-md border border-neutral-300 bg-white px-3 py-2 text-sm dark:border-neutral-700 dark:bg-neutral-900"
            value={deviceId}
            onChange={(event) => setDeviceId(event.target.value)}
          >
            {relayDevices.map((device) => (
              <option key={device.id} value={device.id}>
                {device.name}
              </option>
            ))}
          </select>
          <span className="mt-1 block text-xs text-neutral-500">
            Vé được mã hóa cho đúng một máy. Chọn nhầm thì máy kia không mở được, và cầu nối sẽ
            nói thẳng là vé không phải của nó.
          </span>
        </label>
      ) : null}

      <div className="flex flex-wrap gap-2">
        <button
          type="button"
          className={BUTTON_CLASS}
          disabled={busy}
          onClick={() =>
            openSecretTab(
              () => requestCredentialTicket(accountId, "password", deviceId || undefined),
              "mật khẩu nick",
            )
          }
        >
          Mật khẩu nick
        </button>
        <button
          type="button"
          className={BUTTON_CLASS}
          disabled={busy}
          onClick={() =>
            openSecretTab(
              () => requestCredentialTicket(accountId, "emailPassword", deviceId || undefined),
              "mật khẩu email",
            )
          }
        >
          Mật khẩu email
        </button>
        <button
          type="button"
          className={BUTTON_CLASS}
          disabled={busy || !hasTotp}
          onClick={() =>
            openSecretTab(() => requestOtpTicket(accountId, deviceId || undefined), "mã OTP")
          }
        >
          {hasTotp ? "Mã OTP" : "Chưa có 2FA"}
        </button>
        <button
          type="button"
          className={BUTTON_CLASS}
          disabled={busy || !canLaunch}
          onClick={launchProfile}
          title={canLaunch ? undefined : launchBlockedReason}
        >
          Mở profile
        </button>
      </div>

      <p className="text-xs text-neutral-500">
        Mật khẩu và mã OTP hiện ở một cửa sổ nhỏ do <strong>cầu nối trên máy bạn</strong> phục vụ,
        không phải trang này. Trang này chỉ cầm tấm vé đã mã hóa — nó không đọc được thứ nó vừa
        chuyển đi.
      </p>

      {!canLaunch ? (
        <p className="text-sm text-red-700 dark:text-red-400">{launchBlockedReason}</p>
      ) : null}

      {feedback ? (
        <p
          className={
            feedback.kind === "ok"
              ? "text-sm text-emerald-700 dark:text-emerald-400"
              : "text-sm text-red-700 dark:text-red-400"
          }
        >
          {feedback.text}
        </p>
      ) : null}
    </div>
  );
}
