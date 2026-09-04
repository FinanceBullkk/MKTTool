"use client";

/**
 * Khay cảnh báo vận hành — vùng cố định ngay dưới thanh đầu trang, hiện ở mọi trang.
 *
 * Vẽ **mỗi vấn đề một dòng riêng với việc phải làm riêng**, và đó là toàn bộ lý do khay này tồn
 * tại. Bản 19/08/2026 rút xuống còn `alerts[0]`: cảnh báo thứ hai trở đi biến mất không dấu vết,
 * nên "proxy VN-03 chết" che mất "máy Linh-PC bị thu hồi" chỉ vì nó xếp trước. Một khay giấu bớt
 * cảnh báo tệ hơn không có khay — người đọc tưởng mình đã thấy hết.
 *
 * Cùng bảng màu với `AlertBanner`, nhưng không dùng lại component đó: khay là DANH SÁCH nhiều
 * dòng trong một khung, còn `AlertBanner` là một khung cho một câu. Ép chung sẽ ra một chồng
 * khung viền lồng nhau.
 *
 * **Không có nút đóng.** Đây là lỗi cấu hình hệ thống, không phải thông báo — thứ duy nhất làm
 * nó biến mất là sửa cái đang hỏng. Nút "Thu gọn" chỉ giấu phần *việc phải làm*, giữ nguyên
 * phần *đang hỏng cái gì*.
 */

import { useState } from "react";
import type { OpsAlertTone } from "@/lib/ops-alerts/ops-alert-types";

interface AlertItem {
  id: string;
  tone: OpsAlertTone;
  message: string;
  action: string;
}

/** Đỏ và vàng phải khác nhau nhìn thấy được: một cái là "đang hỏng", một cái là "để ý". */
const TONE: Record<OpsAlertTone, { box: string; text: string; dot: string; chip: string; label: string }> = {
  amber: {
    box: "border-amber-500/20 bg-amber-950/20",
    text: "text-amber-200/90",
    dot: "bg-amber-400",
    chip: "bg-amber-500/20 text-amber-300",
    label: "Attention",
  },
  red: {
    box: "border-red-500/25 bg-red-950/25",
    text: "text-red-200/90",
    dot: "bg-red-400",
    chip: "bg-red-500/20 text-red-300",
    label: "Broken",
  },
};

export function OpsAlertTrayClient({ alerts }: { alerts: AlertItem[] }) {
  const [collapsed, setCollapsed] = useState(true);

  if (alerts.length === 0) return null;

  return (
    // `role="status"` chứ không phải `alert`: khay có mặt sẵn lúc trang nạp, không phải thứ
    // vừa xảy ra cần cắt ngang người dùng.
    <section
      role="status"
      aria-label="Operational alerts"
      className="z-10 mx-auto w-full max-w-[90rem] space-y-1.5 px-4 pb-1 pt-3 sm:px-6 lg:px-8"
    >
      {alerts.map((alert) => {
        const tone = TONE[alert.tone];

        return (
          <div
            key={alert.id}
            className={`grid grid-cols-[auto_1fr_auto] items-start gap-x-2.5 gap-y-2 rounded-xl border px-3.5 py-2.5 text-xs shadow-lg shadow-black/40 sm:grid-cols-[auto_auto_minmax(0,1fr)_auto] sm:items-center ${tone.box} ${tone.text}`}
          >
            <span className={`mt-1 h-2 w-2 shrink-0 rounded-full sm:mt-0 ${tone.dot}`} />
            <span
              className={`w-fit shrink-0 rounded px-1.5 py-0.5 text-[10px] font-bold uppercase tracking-wider ${tone.chip}`}
            >
              {tone.label}
            </span>

            <div className="col-span-3 row-start-2 min-w-0 sm:col-span-1 sm:col-start-3 sm:row-start-1">
              <p className="font-medium leading-5">{alert.message}</p>
              {!collapsed && alert.action ? (
                <p className="mt-1 font-normal leading-5 opacity-80">{alert.action}</p>
              ) : null}
            </div>

            {/* Chỉ dòng đầu mang nút gập, và nó gập cả khay — mỗi dòng một nút là một hàng nút
                chạy dọc mép phải, ồn hơn chính nội dung. */}
            {alert.id === alerts[0].id ? (
              <button
                type="button"
                onClick={() => setCollapsed(!collapsed)}
                className="col-start-3 row-start-1 shrink-0 cursor-pointer text-[11px] font-medium underline opacity-70 hover:opacity-100 sm:col-start-4"
              >
                {collapsed ? "Details" : "Collapse"}
              </button>
            ) : null}
          </div>
        );
      })}
    </section>
  );
}
