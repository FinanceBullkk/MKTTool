import type { Metadata } from "next";
import { Space_Grotesk, JetBrains_Mono } from "next/font/google";
import { AppShell } from "@/components/mktbrowser-ui/AppShell";
import { OpsAlertTray } from "@/components/layout/ops-alert-tray";
import { SessionBadge } from "@/components/auth/session-badge";
import { readActor } from "@/lib/auth/require-actor";
import { prisma } from "@/lib/db/prisma-client";
import { relayStatusLabel } from "@/lib/relay/relay-status-label";
import "./globals.css";

// globals.css named these two families but nothing ever loaded them: no
// next/font, no <link>. Every screen has been rendering in the Segoe UI
// fallback. Self-hosted through next/font rather than an @import from a CDN,
// because an operator machine may have no route to the internet.
const sans = Space_Grotesk({ subsets: ["latin", "vietnamese"], variable: "--font-sans-loaded" });
const mono = JetBrains_Mono({ subsets: ["latin", "vietnamese"], variable: "--font-mono-loaded" });

export const metadata: Metadata = {
  title: "MKT Browser / Tool — Multi-Profile Console",
  description: "Bảng điều khiển quản lý và vận hành profile TikTok & Antidetect",
};

/**
 * Khung ngoài của mọi trang — và là **ranh giới đăng nhập**, không chỉ là chỗ để CSS.
 *
 * Chưa đăng nhập thì không dựng AppShell, và cũng không hỏi database câu nào. Hai việc đó là
 * một: thanh đầu trang hiện số nick trong kho và tên máy cầu nối, nên dựng nó cho khách là
 * đem hai thứ đó ra ngoài cửa. Đo thật 19/08/2026: mở `/login` lúc đăng xuất thấy
 * `1 total` và `Relay v15 (AnhHao)` — số lượng danh tính và tên máy thật của một người
 * trong đội, cho bất kỳ ai gõ đúng URL.
 *
 * Trang `/login` tự lo phần trình bày của nó. Nó cũng không cần rail điều hướng lẫn ô tìm
 * profile — hai thứ dẫn tới chỗ người chưa đăng nhập không vào được.
 */
export default async function RootLayout({ children }: { children: React.ReactNode }) {
  const viewer = await readActor();

  return (
    <html lang="vi" className={`dark ${sans.variable} ${mono.variable}`}>
      <body
        suppressHydrationWarning
        className="bg-[#0a0b0f] text-[#f1f5f9] min-h-screen overflow-hidden"
      >
        {viewer ? <SignedInShell>{children}</SignedInShell> : children}
      </body>
    </html>
  );
}

/** Phần chỉ dựng sau khi đã biết người đang xem là ai. */
async function SignedInShell({ children }: { children: React.ReactNode }) {
  const [totalCount, activeDevice] = await Promise.all([
    prisma.account.count().catch(() => 0),
    prisma.relayDevice.findFirst({
      where: { revokedAt: null },
      select: { name: true, relayVersion: true },
    }).catch(() => null),
  ]);

  return (
    <AppShell
      totalProfiles={totalCount}
      relayName={relayStatusLabel(activeDevice)}
      sessionBadge={<SessionBadge />}
    >
      <OpsAlertTray />
      {children}
    </AppShell>
  );
}
