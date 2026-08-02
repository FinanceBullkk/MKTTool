import type { Metadata } from "next";
import Link from "next/link";
import "./globals.css";

export const metadata: Metadata = {
  title: "MKTTool — Bảng điều khiển nhiều tài khoản",
  description: "Bảng điều khiển nhiều tài khoản cho team marketing",
};

const NAV_ITEMS = [
  { href: "/", label: "Tổng quan" },
  { href: "/queue", label: "Hàng đợi" },
  { href: "/content", label: "Content" },
  { href: "/accounts", label: "Tài khoản" },
  { href: "/personas", label: "Nhân vật" },
  { href: "/proxies", label: "Proxy" },
  { href: "/targets", label: "Đích đăng" },
  { href: "/facebook", label: "Facebook" },
];

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="vi">
      <body>
        <div className="mx-auto max-w-6xl px-6 py-8">
          <header className="mb-8 flex flex-wrap items-center justify-between gap-4 border-b border-neutral-200 pb-4 dark:border-neutral-800">
            <Link href="/" className="text-lg font-semibold">
              MKTTool
            </Link>
            <nav className="flex flex-wrap gap-1 text-sm">
              {NAV_ITEMS.map((item) => (
                <Link
                  key={item.href}
                  href={item.href}
                  className="rounded-md px-3 py-1.5 text-neutral-600 transition hover:bg-neutral-200 hover:text-neutral-900 dark:text-neutral-400 dark:hover:bg-neutral-800 dark:hover:text-neutral-100"
                >
                  {item.label}
                </Link>
              ))}
            </nav>
          </header>
          <main>{children}</main>
        </div>
      </body>
    </html>
  );
}
