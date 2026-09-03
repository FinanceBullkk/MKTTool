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
    <div className="flex h-screen w-screen overflow-hidden bg-[#0a0b0f] text-[#f1f5f9] font-sans antialiased">
      {/* 1. Left Rail */}
      <LeftRail />

      {/* 2. Main Content Canvas */}
      <div className="flex-1 flex flex-col min-w-0 h-full overflow-hidden">
        <TopBar
          relayStatusText={relayName}
          sessionBadge={sessionBadge}
        />

        {/* Scrollable Work Area */}
        <main className="flex-1 overflow-y-auto">
          {children}
        </main>
      </div>
    </div>
  );
}
