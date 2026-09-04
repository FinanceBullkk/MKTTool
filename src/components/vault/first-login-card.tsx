"use client";

/**
 * Chặng cuối của luồng nhập một nick: **đăng nhập nick vào profile vừa dựng**.
 *
 * ## Vì sao có một thẻ riêng cho một việc không có nút bấm nào của riêng nó
 *
 * The "Create profile on this machine" button creates a **new local** browser profile with a proxy
 * and profile settings but no cookies. Previously this state did not exist: operators created profiles
 * manually in MKT Browser, signed in there, and only then copied the ID into MKTTool, so
 * *"has a profile"* and *"has signed in"* were the same state. They are now separate, and the state
 * between them looks deceptively complete.
 *
 * Thẻ này lấp đúng khoảng đó: nói ra việc phải làm, và nhận lấy lời khai khi làm xong.
 *
 * ## Vì sao KHÔNG gom sẵn nút Mở profile / Mật khẩu / OTP vào đây
 *
 * Ba nút ấy đã nằm ở thẻ **Thao tác** ngay bên dưới, cùng với cả bộ máy vé, ping cầu nối, chọn
 * máy, và dải "cầu nối bản cũ". Dựng lại chúng ở đây là chép một trong những đoạn khó nhất của
 * dự án ra làm hai bản — rồi có ngày một bản được vá còn bản kia thì không. Thẻ này chỉ trỏ
 * xuống, và đứng ngay trên để chỗ trỏ tới nằm trong tầm mắt.
 */
import { useState, useTransition } from "react";
import { Check, CheckCircle2, ExternalLink, Info, KeyRound } from "lucide-react";
import { Disclosure, PRIMARY_BUTTON_CLASS } from "@/components/ui/page-section";
import { markFirstLogin } from "@/lib/accounts/account-first-login-actions";

export function FirstLoginCard({
  accountId,
  /** Nick đăng nhập bằng tài khoản Google — quyết định gọi tên nút nào ở thẻ Thao tác. */
  usesGoogleLogin,
}: {
  accountId: string;
  usesGoogleLogin: boolean;
}) {
  const [pending, startTransition] = useTransition();
  const [feedback, setFeedback] = useState<{ kind: "ok" | "error"; text: string } | null>(null);

  function danhDau() {
    startTransition(async () => {
      try {
        const result = await markFirstLogin(accountId);
        setFeedback({ kind: result.ok ? "ok" : "error", text: result.message });
      } catch {
        setFeedback({ kind: "error", text: "Could not reach the server. Refresh and try again." });
      }
    });
  }

  return (
    <div className="space-y-4">
      <p className="flex items-center gap-2 text-sm font-medium text-amber-200">
        <KeyRound size={17} aria-hidden="true" />
        Browser profile ready. Platform sign-in still required.
      </p>

      <ol className="grid gap-2 sm:grid-cols-3">
        <li className="rounded-xl border border-white/[0.07] bg-black/10 p-3 text-xs leading-5 text-neutral-300">
          <span className="mb-2 flex items-center gap-2 font-semibold text-white">
            <ExternalLink size={15} className="text-amber-300" aria-hidden="true" />
            1. Open
          </span>
          Use <strong>Open browser profile</strong> in Quick actions.
        </li>
        <li className="rounded-xl border border-white/[0.07] bg-black/10 p-3 text-xs leading-5 text-neutral-300">
          <span className="mb-2 flex items-center gap-2 font-semibold text-white">
            <KeyRound size={15} className="text-amber-300" aria-hidden="true" />
            2. Sign in
          </span>
          Sign in{" "}
          {usesGoogleLogin ? (
            <>
              with <em>Continue with Google</em> using the password and OTP in Quick actions.
            </>
          ) : (
            <>
              using the nick password and OTP in Quick actions.
            </>
          )}
        </li>
        <li className="rounded-xl border border-white/[0.07] bg-black/10 p-3 text-xs leading-5 text-neutral-300">
          <span className="mb-2 flex items-center gap-2 font-semibold text-white">
            <CheckCircle2 size={15} className="text-amber-300" aria-hidden="true" />
            3. Confirm
          </span>
          Return here and mark the first sign-in complete.
        </li>
      </ol>

      <button type="button" className={PRIMARY_BUTTON_CLASS} disabled={pending} onClick={danhDau}>
        <Check size={16} aria-hidden="true" />
        {pending ? "Saving..." : "First sign-in completed"}
      </button>

      <Disclosure summary="Timing and safety" icon={Info}>
        <p className="text-xs leading-5">
          Do this at the start of cold-start, not on the planned posting day. A first sign-in from a
          new IP is when verification is most likely. The operator must handle sign-in, OTP, and
          CAPTCHA manually; this tool does not automate them. A configured local profile does not
          prove identity isolation.
        </p>
      </Disclosure>

      {feedback ? (
        <p
          role={feedback.kind === "ok" ? "status" : "alert"}
          className={
            feedback.kind === "ok"
              ? "text-sm text-emerald-300"
              : "text-sm text-red-300"
          }
        >
          {feedback.text}
        </p>
      ) : null}
    </div>
  );
}
