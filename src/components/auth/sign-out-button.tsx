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
      className="inline-flex min-h-11 items-center rounded-lg px-2 text-neutral-500 transition-colors hover:bg-white/[0.04] hover:text-neutral-100 disabled:opacity-40"
    >
      {pending ? "Signing out..." : "Sign out"}
    </button>
  );
}
