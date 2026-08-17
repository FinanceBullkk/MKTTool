"use client";

/**
 * Nút "Đăng nhập bằng Google" — nhịp JavaScript duy nhất của cả màn hình đăng nhập.
 *
 * `signIn.social` gọi `/api/auth/sign-in/social`, nhận về địa chỉ Google rồi chuyển trang.
 * Chuyển trang thành công thì component này biến mất cùng cả trang, nên `pending` không bao
 * giờ phải tự tắt ở nhánh thành công — chỉ nhánh hỏng mới quay lại đây.
 */
import { useState } from "react";
import { authClient } from "@/lib/auth/auth-client";

export function GoogleSignInButton({ callbackURL = "/" }: { callbackURL?: string }) {
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function signIn() {
    setPending(true);
    setError(null);

    const { error: failure } = await authClient.signIn.social({
      provider: "google",
      /** Đăng nhập xong về trang Hôm nay. */
      callbackURL,
      /**
       * Google từ chối hoặc máy chủ dựng tài khoản hỏng thì quay về đúng màn hình này kèm
       * `?error=`, thay vì rơi vào trang lỗi mặc định của Better Auth — trang đó bằng tiếng
       * Anh và nói về khái niệm của thư viện, không nói phải sửa biến nào trong `.env`.
       */
      errorCallbackURL: "/login",
    });

    // Chỉ tới được đây khi CHƯA chuyển trang, tức là hỏng ngay từ nhịp gọi đầu tiên: mất mạng,
    // hoặc máy chủ dừng vì thiếu GOOGLE_CLIENT_ID / BETTER_AUTH_SECRET.
    if (failure) {
      setError(
        failure.message ??
          "Không bắt đầu được luồng đăng nhập. Chạy `npm run auth:check` để xem thiếu biến nào.",
      );
      setPending(false);
    }
  }

  return (
    <div className="space-y-3">
      <button
        type="button"
        onClick={signIn}
        disabled={pending}
        className="flex w-full items-center justify-center gap-3 rounded-md bg-neutral-900 px-4 py-2.5 text-sm font-medium text-white transition hover:bg-neutral-700 disabled:opacity-50 dark:bg-neutral-100 dark:text-neutral-900 dark:hover:bg-neutral-300"
      >
        <GoogleMark />
        {pending ? "Đang chuyển sang Google…" : "Đăng nhập bằng Google"}
      </button>

      {error ? <p className="text-sm text-red-700 dark:text-red-400">{error}</p> : null}
    </div>
  );
}

/** Logo Google bốn màu, nội tuyến để không phải tải thêm file nào. */
function GoogleMark() {
  return (
    <svg aria-hidden="true" viewBox="0 0 48 48" className="size-5">
      <path
        fill="#EA4335"
        d="M24 9.5c3.54 0 6.71 1.22 9.21 3.6l6.85-6.85C35.9 2.38 30.47 0 24 0 14.62 0 6.51 5.38 2.56 13.22l7.98 6.19C12.43 13.72 17.74 9.5 24 9.5z"
      />
      <path
        fill="#4285F4"
        d="M46.98 24.55c0-1.57-.15-3.09-.38-4.55H24v9.02h12.94c-.58 2.96-2.26 5.48-4.78 7.18l7.73 6c4.51-4.18 7.09-10.36 7.09-17.65z"
      />
      <path
        fill="#FBBC05"
        d="M10.53 28.59c-.48-1.45-.76-2.99-.76-4.59s.27-3.14.76-4.59l-7.98-6.19C.92 16.46 0 20.12 0 24c0 3.88.92 7.54 2.56 10.78l7.97-6.19z"
      />
      <path
        fill="#34A853"
        d="M24 48c6.48 0 11.93-2.13 15.89-5.81l-7.73-6c-2.15 1.45-4.92 2.3-8.16 2.3-6.26 0-11.57-4.22-13.47-9.91l-7.98 6.19C6.51 42.62 14.62 48 24 48z"
      />
    </svg>
  );
}
