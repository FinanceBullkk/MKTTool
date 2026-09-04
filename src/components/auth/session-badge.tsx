/**
 * Đang đăng nhập bằng ai, vai trò gì — góc phải thanh đầu trang.
 *
 * Không phải trang trí: đây là **chỗ duy nhất trả lời "đăng nhập đã ăn chưa"**. Thiếu nó thì
 * đăng nhập xong quay về trang Hôm nay và mọi thứ trông y hệt lúc chưa đăng nhập, không có gì
 * phân biệt phiên còn hạn với phiên vừa hết.
 *
 * Hiện cả **vai trò** vì hai vai trò làm được hai việc khác nhau: OPERATOR bấm nút lấy mật khẩu
 * của nick người khác sẽ bị từ chối, và biết trước mình đang là vai nào thì đó là quy định,
 * không phải lỗi.
 */
import Link from "next/link";
import { readActor } from "@/lib/auth/require-actor";
import { SignOutButton } from "./sign-out-button";

const ROLE_LABEL = { ADMIN: "administrator", OPERATOR: "operator" } as const;

export async function SessionBadge() {
  const actor = await readActor();

  if (!actor) {
    return (
      <Link
        href="/login"
        className="rounded-md px-2 py-1 text-sm font-medium text-neutral-600 underline-offset-2 transition hover:text-neutral-900 hover:underline dark:text-neutral-400 dark:hover:text-neutral-100"
      >
        Sign in
      </Link>
    );
  }

  return (
    <div className="flex min-w-0 items-center gap-2 text-xs">
      <span className="max-w-36 truncate text-neutral-400 sm:max-w-none" title={actor.email}>
        <span className="hidden sm:inline">{actor.email}</span>
        <span className="ml-0 rounded bg-white/[0.07] px-1.5 py-1 text-[10px] text-neutral-300 sm:ml-1">
          {ROLE_LABEL[actor.role]}
        </span>
      </span>
      <SignOutButton />
    </div>
  );
}
