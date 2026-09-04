import type { Metadata } from "next";
import { Fira_Code, Fira_Sans } from "next/font/google";
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
const sans = Fira_Sans({
  subsets: ["latin", "vietnamese"],
  weight: ["400", "500", "600", "700"],
  variable: "--font-sans-loaded",
});
const mono = Fira_Code({ subsets: ["latin"], variable: "--font-mono-loaded" });

export const metadata: Metadata = {
  title: "MKTTool — Team Nick Vault",
  description: "Shared nick vault, proxy ownership, and Relay PC registry for the team",
};

/**
 * Khung ngoài của mọi trang — và là **ranh giới đăng nhập**, không chỉ là chỗ để CSS.
 *
 * Chưa đăng nhập thì không dựng AppShell, và cũng không hỏi database câu nào. Hai việc đó là
 * một: thanh đầu trang hiện trạng thái Relay lấy từ sổ máy, nên dựng nó cho khách là đem một
 * phần inventory nội bộ ra ngoài cửa. Đo thật 19/08/2026: mở `/login` lúc đăng xuất thấy
 * `1 total` và `Relay v15 (AnhHao)` — một **bản ghi lịch sử** về số lượng profile và tên máy
 * thật của một người trong đội, không phải trạng thái phát hành hiện tại. Khi đã đăng nhập,
 * nhãn Relay phải đọc phiên bản máy khai báo; không dùng ví dụ lịch sử này để suy ra identity
 * isolation hay readiness.
 *
 * Trang `/login` tự lo phần trình bày của nó. Nó cũng không cần rail điều hướng hay các điều
 * khiển kho nội bộ — chúng dẫn tới chỗ người chưa đăng nhập không vào được.
 */
export default async function RootLayout({ children }: { children: React.ReactNode }) {
  const viewer = await readActor();

  return (
    <html lang="en" className={`dark ${sans.variable} ${mono.variable}`}>
      <body
        suppressHydrationWarning
        className="min-h-[100dvh] overflow-hidden"
      >
        {viewer ? <SignedInShell>{children}</SignedInShell> : children}
      </body>
    </html>
  );
}

/** Phần chỉ dựng sau khi đã biết người đang xem là ai. */
async function SignedInShell({ children }: { children: React.ReactNode }) {
  const activeDevice = await prisma.relayDevice.findFirst({
    where: { revokedAt: null },
    select: { name: true, relayVersion: true },
  }).catch(() => null);

  return (
    <AppShell
      relayName={relayStatusLabel(activeDevice)}
      sessionBadge={<SessionBadge />}
    >
      <OpsAlertTray />
      {children}
    </AppShell>
  );
}
