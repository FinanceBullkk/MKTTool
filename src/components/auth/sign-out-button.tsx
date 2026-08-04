"use client";

/**
 * Nút đăng xuất. Xóa phiên ở máy chủ rồi mới rời trang.
 *
 * `router.refresh()` chứ không phải `router.push("/login")`: mọi trang đều là server component
 * đọc phiên lúc dựng, nên phải bảo Next dựng lại thì thanh trạng thái mới đổi. Chuyển trang mà
 * không làm mới thì bản dựng cũ trong bộ nhớ đệm vẫn hiện tên người vừa đăng xuất.
 */
import { useState } from "react";
import { useRouter } from "next/navigation";
import { authClient } from "@/lib/auth/auth-client";

export function SignOutButton() {
  const router = useRouter();
  const [pending, setPending] = useState(false);

  return (
    <button
      type="button"
      disabled={pending}
      onClick={async () => {
        setPending(true);
        await authClient.signOut();
        router.refresh();
      }}
      className="rounded-md px-2 py-1 text-neutral-600 underline-offset-2 transition hover:text-neutral-900 hover:underline disabled:opacity-50 dark:text-neutral-400 dark:hover:text-neutral-100"
    >
      {pending ? "Đang thoát…" : "Đăng xuất"}
    </button>
  );
}
