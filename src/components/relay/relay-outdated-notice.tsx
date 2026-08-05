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
    <p className="rounded-md border border-amber-300 bg-amber-50 px-3 py-2 text-sm text-amber-800 dark:border-amber-900 dark:bg-amber-950 dark:text-amber-300">
      Cầu nối trên máy này là <strong>bản {relayVersion}</strong>, cũ hơn bản máy chủ đang phát
      hành. Mọi thứ vẫn chạy, nhưng nên cập nhật trước khi một tấm vé bị từ chối:{" "}
      <Link href="/relay-download" className="underline">
        tải bản mới
      </Link>{" "}
      rồi chạy lại <code className="font-mono text-xs">setup.bat</code> — cấu hình của máy được
      giữ nguyên.
    </p>
  );
}
