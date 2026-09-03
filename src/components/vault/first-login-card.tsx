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
import { markFirstLogin } from "@/lib/accounts/account-first-login-actions";

const BUTTON_CLASS =
  "rounded-md bg-neutral-900 px-3 py-2 text-sm font-medium text-white transition " +
  "hover:bg-neutral-700 disabled:opacity-40 dark:bg-neutral-100 dark:text-neutral-900";

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
    <div className="space-y-3">
      <p className="text-sm text-neutral-600 dark:text-neutral-400">
        This nick has a browser profile, but <strong>nobody has signed in to it yet</strong>. The
        profile is a blank local browser workspace with the assigned proxy and no signed-in session.
        This local state does not prove identity isolation. Finish the handoff with the controls in
        the actions card below:
      </p>

      <ol className="ml-5 list-decimal space-y-1 text-sm text-neutral-600 dark:text-neutral-400">
        <li>
          Select <strong>Open browser profile</strong> to open the local browser window with this
          nick&apos;s proxy.
        </li>
        <li>
          Go to the platform and sign in{" "}
          {usesGoogleLogin ? (
            <>
              with <em>Continue with Google</em>, using <strong>Google password</strong> and{" "}
              <strong>OTP code</strong> from the actions card
            </>
          ) : (
            <>
              using <strong>Nick password</strong> and <strong>OTP code</strong> from the actions card
            </>
          )}
        </li>
        <li>Return here and confirm the first sign-in with the button below.</li>
      </ol>

      <button type="button" className={BUTTON_CLASS} disabled={pending} onClick={danhDau}>
        {pending ? "Saving..." : "First sign-in completed"}
      </button>

      <p className="text-xs text-neutral-500">
        Do this at the start of cold-start, not on the planned posting day: a first sign-in from a
        new IP is when verification is most likely. The operator must handle sign-in, OTP, and
        CAPTCHA manually; the tool does not automate this step.
      </p>

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
