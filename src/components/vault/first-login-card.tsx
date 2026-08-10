"use client";

/**
 * Chặng cuối của luồng nhập một nick: **đăng nhập nick vào profile vừa dựng**.
 *
 * ## Vì sao có một thẻ riêng cho một việc không có nút bấm nào của riêng nó
 *
 * The "Create profile on this machine" button creates a **clean** browser with a proxy and
 * fingerprint but no cookies. Previously this state did not exist: operators created profiles
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
        setFeedback({ kind: "error", text: "Không gọi được máy chủ. Tải lại trang rồi thử lại." });
      }
    });
  }

  return (
    <div className="space-y-3">
      <p className="text-sm text-neutral-600 dark:text-neutral-400">
        Profile của nick này đã dựng xong nhưng <strong>chưa ai đăng nhập vào nó lần nào</strong> —
        công cụ tạo ra một trình duyệt trắng, mang sẵn proxy và vân tay, không có phiên đăng nhập
        nào. Làm nốt bằng ba nút ở thẻ <strong>Thao tác</strong> ngay bên dưới:
      </p>

      <ol className="ml-5 list-decimal space-y-1 text-sm text-neutral-600 dark:text-neutral-400">
        <li>
          <strong>Mở profile</strong> — cửa sổ Chromium mang proxy của nick hiện ra
        </li>
        <li>
          Vào trang nền tảng và đăng nhập{" "}
          {usesGoogleLogin ? (
            <>
              bằng nút <em>Continue with Google</em>, lấy bí mật ở nút{" "}
              <strong>Mật khẩu Google</strong> và <strong>Mã OTP</strong>
            </>
          ) : (
            <>
              bằng nút <strong>Mật khẩu nick</strong> và <strong>Mã OTP</strong>
            </>
          )}
        </li>
        <li>Quay lại đây bấm nút bên dưới</li>
      </ol>

      <button type="button" className={BUTTON_CLASS} disabled={pending} onClick={danhDau}>
        {pending ? "Đang ghi…" : "Đã đăng nhập được"}
      </button>

      <p className="text-xs text-neutral-500">
        Làm ngay đầu cold-start, đừng để tới hôm định đăng bài: đăng nhập lần đầu từ một IP lạ là
        lúc hay bị đòi xác minh nhất, và lúc đang vội là lúc người ta làm ẩu.
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
