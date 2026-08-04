import type { Metadata } from "next";
import Link from "next/link";
import { SessionBadge } from "@/components/auth/session-badge";
import { PrimaryNav } from "@/components/layout/primary-nav";
import "./globals.css";

export const metadata: Metadata = {
  title: "MKTTool — Bảng điều khiển nhiều tài khoản",
  description: "Bảng điều khiển nhiều tài khoản cho team marketing",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="vi">
      {/* Extension trình duyệt (Grammarly...) chèn attribute vào body trước khi React hydrate */}
      <body suppressHydrationWarning>
        <div className="mx-auto max-w-6xl px-6 py-8">
          <header className="mb-8 flex flex-wrap items-center justify-between gap-4 border-b border-neutral-200 pb-4 dark:border-neutral-800">
            <Link href="/" className="text-lg font-semibold">
              MKTTool
            </Link>
            <div className="flex flex-wrap items-center gap-4">
              <PrimaryNav />
              <SessionBadge />
            </div>
          </header>
          <main>{children}</main>
        </div>
      </body>
    </html>
  );
}
