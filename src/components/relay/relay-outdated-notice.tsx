"use client";

/**
 * Dải *"cầu nối bản cũ, tải bản mới ở đây"* (QĐ 11).
 *
 * ## Vì sao chỉ hiện sau khi đã gọi được cầu nối
 *
 * Số phiên bản đi kèm **mọi** phản hồi của cầu nối, nên chỉ biết được sau khi có ít nhất một
 * lượt gọi. Không có đường nào hỏi sớm hơn: gọi thăm dò lúc trang vừa mở thì trên máy chưa cấp
 * quyền mạng nội bộ, lời gọi đó vừa treo tới hết hạn giờ vừa làm hiện một hộp xin quyền giữa
 * lúc người ta chưa bấm gì.
 *
 * ## Vì sao là cảnh báo chứ không phải chặn
 *
 * Bản cũ vẫn chạy được cho tới khi máy chủ nâng `MIN_RELAY_VERSION`. Dải này tồn tại đúng để lấp
 * khoảng giữa: nhắc trong lúc mọi thứ còn chạy, thay vì để cả team phát hiện cùng lúc vào đúng
 * ngày một tấm vé bị từ chối. Chặn sớm hơn mức cần thiết là tự tay tạo ra sự cố mình đang tránh.
 */
import Link from "next/link";

export function RelayOutdatedNotice({ relayVersion }: { relayVersion: number }) {
  return (
    <p className="rounded-xl border border-amber-400/20 bg-amber-400/[0.06] px-4 py-3 text-sm text-amber-200">
      Relay on this PC is <strong>version {relayVersion}</strong>, older than the version currently
      distributed by the server. Existing actions still work, but update before a ticket is rejected:{" "}
      <Link href="/setup#download" className="underline">
        download the latest version
      </Link>{" "}
      , then run <code className="font-mono text-xs">setup.bat</code> again. This Relay PC&apos;s
      configuration is preserved.
    </p>
  );
}
