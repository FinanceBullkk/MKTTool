"use client";

/**
 * Panel thao tác kho danh tính: copy mật khẩu, hiện mã OTP, mở profile.
 *
 * Nguyên tắc: mật khẩu KHÔNG BAO GIỜ được render ra màn hình — bấm copy là chép
 * thẳng vào clipboard. Người đứng sau lưng không đọc được, ảnh chụp màn hình
 * không lộ, log không dính.
 */
import { useEffect, useState } from "react";
import { requestOtpCode, revealCredential } from "@/lib/accounts/vault-credential-actions";

type Feedback = { kind: "ok" | "error"; text: string } | null;

const BUTTON_CLASS =
  "rounded-md border border-neutral-300 px-3 py-1.5 text-sm transition " +
  "hover:bg-neutral-100 disabled:opacity-50 dark:border-neutral-700 dark:hover:bg-neutral-800";

export function AccountVaultActionsPanel({
  accountId,
  hasTotp,
  canLaunch,
  launchBlockedReason,
}: {
  accountId: string;
  hasTotp: boolean;
  canLaunch: boolean;
  launchBlockedReason: string;
}) {
  const [feedback, setFeedback] = useState<Feedback>(null);
  const [busy, setBusy] = useState(false);
  const [otp, setOtp] = useState<{ code: string; secondsRemaining: number } | null>(null);

  // Đếm ngược mã OTP. Hết giờ thì xóa mã đi thay vì hiện mã đã hết hạn.
  useEffect(() => {
    if (!otp) return;
    if (otp.secondsRemaining <= 0) {
      setOtp(null);
      return;
    }
    const timer = setTimeout(() => {
      setOtp((current) =>
        current ? { ...current, secondsRemaining: current.secondsRemaining - 1 } : null,
      );
    }, 1000);
    return () => clearTimeout(timer);
  }, [otp]);

  async function copySecret(field: "password" | "emailPassword", label: string) {
    setBusy(true);
    setFeedback(null);
    try {
      const result = await revealCredential(accountId, field);
      if ("ok" in result) {
        setFeedback({ kind: "error", text: result.message });
        return;
      }
      await navigator.clipboard.writeText(result.value);
      setFeedback({ kind: "ok", text: `Đã copy ${label} vào clipboard.` });
    } catch {
      setFeedback({ kind: "error", text: `Không copy được ${label}.` });
    } finally {
      setBusy(false);
    }
  }

  async function showOtp() {
    setBusy(true);
    setFeedback(null);
    try {
      const result = await requestOtpCode(accountId);
      if ("ok" in result) {
        setFeedback({ kind: "error", text: result.message });
        return;
      }
      setOtp(result);
    } catch {
      // Thiếu nhánh này là lỗi phía server biến thành promise reject không ai bắt:
      // nút bấm xong không hiện gì cả, người dùng không biết chuyện gì đang xảy ra.
      setFeedback({ kind: "error", text: "Không sinh được mã OTP. Xem log của dev server." });
    } finally {
      setBusy(false);
    }
  }

  async function launchProfile() {
    setBusy(true);
    setFeedback(null);
    try {
      const response = await fetch(`/api/accounts/${accountId}/launch`, { method: "POST" });
      const body = (await response.json()) as { ok: boolean; message: string };
      setFeedback({ kind: body.ok ? "ok" : "error", text: body.message });
    } catch {
      setFeedback({ kind: "error", text: "Không gọi được API mở profile." });
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap gap-2">
        <button
          type="button"
          className={BUTTON_CLASS}
          disabled={busy}
          onClick={() => copySecret("password", "mật khẩu nick")}
        >
          Copy mật khẩu nick
        </button>
        <button
          type="button"
          className={BUTTON_CLASS}
          disabled={busy}
          onClick={() => copySecret("emailPassword", "mật khẩu email")}
        >
          Copy mật khẩu email
        </button>
        <button type="button" className={BUTTON_CLASS} disabled={busy || !hasTotp} onClick={showOtp}>
          {hasTotp ? "Hiện mã OTP" : "Chưa có 2FA"}
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

      {!canLaunch ? (
        <p className="text-sm text-red-700 dark:text-red-400">{launchBlockedReason}</p>
      ) : null}

      {otp ? (
        <div className="flex items-baseline gap-3 rounded-md bg-neutral-100 px-4 py-3 dark:bg-neutral-800">
          <span className="font-mono text-2xl tracking-[0.3em]">{otp.code}</span>
          <span className="text-sm text-neutral-500">hết hạn sau {otp.secondsRemaining}s</span>
        </div>
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
