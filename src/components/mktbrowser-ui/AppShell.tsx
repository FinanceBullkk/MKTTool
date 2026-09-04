"use client";

import type { ReactNode } from "react";
import { LeftRail } from "./LeftRail";
import { TopBar } from "./TopBar";

export function AppShell({
  children,
  relayName,
  sessionBadge,
}: {
  children: ReactNode;
  /**
   * Bắt buộc, và KHÔNG có giá trị mặc định — mặc định ở đây từng là chuỗi cứng
   * `"Relay v15 (MSI)"` (**historical**, không phải candidate hiện tại), tức mọi trang quên
   * truyền đều báo một bản cầu nối có thật cho một chiếc máy không có thật. Dựng nhãn bằng
   * `relayStatusLabel()` để chỉ hiện phiên bản máy đã khai báo.
   */
  relayName: string;
  sessionBadge?: ReactNode;
}) {
  return (
    <div className="app-canvas flex h-[100dvh] overflow-hidden font-sans antialiased">
      <LeftRail />

      <div className="flex h-full min-w-0 flex-1 flex-col overflow-hidden">
        <TopBar
          relayStatusText={relayName}
          sessionBadge={sessionBadge}
        />

        <main id="main-content" className="flex-1 overflow-y-auto pb-20 md:pb-0">
          {children}
        </main>
      </div>
    </div>
  );
}
