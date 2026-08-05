"use client";

/**
 * Nav chính, chia theo TẦN SUẤT dùng chứ không theo số lượng trang.
 *
 * Ba mục nằm ngang là ba trang dùng mỗi ngày: hôm nay đăng gì, hàng đợi ra sao, nick còn sống
 * không. Bảy trang còn lại là kho — dựng một lần rồi thỉnh thoảng mới sửa — nên gom vào một
 * dropdown. Xếp cả mười trang cùng trọng số khiến mỗi lần đăng một bài đều có cảm giác phải
 * đi qua cả mười.
 *
 * Không trang nào bị xóa, chỉ đổi trọng số hiển thị: mọi link cũ vẫn vào được.
 */
import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";

const DAILY_ITEMS = [
  { href: "/", label: "Hôm nay" },
  { href: "/queue", label: "Hàng đợi" },
  { href: "/health", label: "Sức khỏe" },
];

const STORE_ITEMS = [
  { href: "/accounts", label: "Nick" },
  { href: "/personas", label: "Nhân vật" },
  { href: "/proxies", label: "Proxy" },
  { href: "/targets", label: "Đích đăng" },
  { href: "/content", label: "Content" },
  { href: "/facebook", label: "Facebook" },
  { href: "/relay-devices", label: "Máy cầu nối" },
];

const ITEM_CLASS =
  "rounded-md px-3 py-1.5 transition focus-visible:outline-none focus-visible:ring-2 " +
  "focus-visible:ring-neutral-500 hover:bg-neutral-200 hover:text-neutral-900 " +
  "dark:hover:bg-neutral-800 dark:hover:text-neutral-100";

const IDLE_CLASS = "text-neutral-600 dark:text-neutral-400";
const ACTIVE_CLASS = "bg-neutral-200 font-medium text-neutral-900 dark:bg-neutral-800 dark:text-neutral-100";

/** Trang con (`/accounts/abc`) vẫn tính là đang ở mục cha. Riêng "/" phải khớp tuyệt đối. */
function isActive(pathname: string, href: string): boolean {
  return href === "/" ? pathname === "/" : pathname === href || pathname.startsWith(`${href}/`);
}

export function PrimaryNav() {
  const pathname = usePathname();
  const [open, setOpen] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);

  const storeActive = STORE_ITEMS.some((item) => isActive(pathname, item.href));

  // Bấm ra ngoài thì đóng. Bàn phím đi ra ngoài đã có onBlur lo, nhưng chuột thì không sinh
  // blur nếu chỗ vừa bấm không nhận focus.
  useEffect(() => {
    if (!open) return;

    function closeOnOutsidePointer(event: PointerEvent) {
      if (!containerRef.current?.contains(event.target as Node)) setOpen(false);
    }

    document.addEventListener("pointerdown", closeOnOutsidePointer);
    return () => document.removeEventListener("pointerdown", closeOnOutsidePointer);
  }, [open]);

  return (
    <nav className="flex flex-wrap items-center gap-1 text-sm">
      {DAILY_ITEMS.map((item) => (
        <Link
          key={item.href}
          href={item.href}
          aria-current={isActive(pathname, item.href) ? "page" : undefined}
          className={`${ITEM_CLASS} ${isActive(pathname, item.href) ? ACTIVE_CLASS : IDLE_CLASS}`}
        >
          {item.label}
        </Link>
      ))}

      <div
        ref={containerRef}
        className="relative"
        onKeyDown={(event) => {
          if (event.key !== "Escape" || !open) return;
          setOpen(false);
          triggerRef.current?.focus();
        }}
        onBlur={(event) => {
          // Tab ra khỏi cả cụm mới đóng; nhảy giữa các mục bên trong thì giữ nguyên.
          if (!event.currentTarget.contains(event.relatedTarget)) setOpen(false);
        }}
      >
        <button
          ref={triggerRef}
          type="button"
          aria-expanded={open}
          aria-haspopup="menu"
          onClick={() => setOpen((visible) => !visible)}
          className={`${ITEM_CLASS} ${storeActive ? ACTIVE_CLASS : IDLE_CLASS}`}
        >
          Kho <span aria-hidden="true">▾</span>
        </button>

        {open ? (
          <div
            role="menu"
            className="absolute right-0 z-20 mt-1 w-44 rounded-md border border-neutral-200 bg-white p-1 shadow-lg dark:border-neutral-700 dark:bg-neutral-900"
          >
            {STORE_ITEMS.map((item) => (
              <Link
                key={item.href}
                href={item.href}
                role="menuitem"
                onClick={() => setOpen(false)}
                aria-current={isActive(pathname, item.href) ? "page" : undefined}
                className={`block ${ITEM_CLASS} ${isActive(pathname, item.href) ? ACTIVE_CLASS : IDLE_CLASS}`}
              >
                {item.label}
              </Link>
            ))}
          </div>
        ) : null}
      </div>
    </nav>
  );
}
