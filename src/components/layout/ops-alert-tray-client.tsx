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
  const [collapsed, setCollapsed] = useState(false);

  if (alerts.length === 0) return null;

  return (
    // `role="status"` chứ không phải `alert`: khay có mặt sẵn lúc trang nạp, không phải thứ
    // vừa xảy ra cần cắt ngang người dùng.
    <section
      role="status"
      aria-label="Operational alerts"
      className="max-w-6xl mx-auto w-full px-6 pt-3 pb-1 z-10 space-y-1.5"
    >
      {alerts.map((alert) => {
        const tone = TONE[alert.tone];

        return (
          <div
            key={alert.id}
            className={`rounded-xl border backdrop-blur-md px-3.5 py-2 text-xs shadow-lg shadow-black/40 flex items-start justify-between gap-3 ${tone.box} ${tone.text}`}
          >
            <div className="flex items-start gap-2.5 min-w-0 flex-1">
              <span className={`w-2 h-2 rounded-full mt-1 flex-shrink-0 ${tone.dot}`} />
              <span
                className={`px-1.5 py-0.5 rounded text-[10px] font-bold uppercase tracking-wider flex-shrink-0 ${tone.chip}`}
              >
                {tone.label}
              </span>
              {/* Không `truncate`: một cảnh báo bị cắt mất vế sau là một cảnh báo đọc sai. */}
              <div className="min-w-0">
                <p className="font-medium">{alert.message}</p>
                {/* Việc phải làm tách dòng riêng — gộp vào cuối câu thì nó bị đọc lướt qua cùng
                    phần mô tả, và cảnh báo không ai làm gì tiếp là cảnh báo vô ích. */}
                {!collapsed && alert.action ? (
                  <p className="mt-1 font-normal opacity-80">{alert.action}</p>
                ) : null}
              </div>
            </div>

            {/* Chỉ dòng đầu mang nút gập, và nó gập cả khay — mỗi dòng một nút là một hàng nút
                chạy dọc mép phải, ồn hơn chính nội dung. */}
            {alert.id === alerts[0].id ? (
              <button
                type="button"
                onClick={() => setCollapsed(!collapsed)}
                className="text-[11px] opacity-70 hover:opacity-100 underline font-medium cursor-pointer flex-shrink-0"
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
