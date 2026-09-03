"use client";

/**
 * Mã máy trong sổ đăng ký, kèm nút chép.
 *
 * ## Vì sao mã này phải hiện ra ở đây
 *
 * Luồng cài cầu nối đi **hai chiều**: khóa công khai của máy đi lên (dán vào form đăng ký), rồi
 * mã máy đi xuống (dán vào `relay-config.json` → `deviceId`). Chiều xuống không có đường nào
 * khác: mã chỉ tồn tại *sau* khi ADMIN ghi máy vào sổ, mà cầu nối thì không nối mạng ra ngoài
 * (QĐ 5) nên nó không tự hỏi lại được.
 *
 * Thiếu ô này thì người cài kẹt ở giữa: cầu nối chạy, sổ có máy, và không ai lấy được con số
 * nối hai thứ đó lại.
 *
 * ## Vì sao hiện đủ, không cắt ngắn như khóa công khai
 *
 * Khóa công khai cắt ngắn được vì nó chỉ dùng để **đối chiếu bằng mắt**. Mã máy thì để **chép
 * đi dán**, và một chuỗi cắt ngắn dán vào cấu hình sẽ hỏng ở tận lượt bấm nút đầu tiên, dưới
 * dạng câu *"vé này phát cho máy khác"* — câu không hề chỉ về phía chuỗi bị cụt.
 *
 * Mã máy **không phải bí mật**: vé được mã hóa cho khóa của đúng máy nhận, nên biết mã mà không
 * có khóa riêng thì không mở được gì. Không cần giấu với người trong team.
 */
import { useState } from "react";

export function RelayDeviceIdCell({ deviceId }: { deviceId: string }) {
  const [copied, setCopied] = useState<"idle" | "done" | "failed">("idle");

  async function copy() {
    try {
      await navigator.clipboard.writeText(deviceId);
      setCopied("done");
    } catch {
      // `navigator.clipboard` chỉ có ở ngữ cảnh bảo mật. Mở web app qua http trong mạng LAN là
      // rơi vào đây, và nút im lặng không làm gì là kiểu hỏng tệ nhất — nên nói ra cách làm tay.
      setCopied("failed");
    }
  }

  return (
    <div className="space-y-1">
      <div className="flex items-center gap-2">
        {/* `select-all`: một cú bấm chọn trọn chuỗi, để đường chép tay cũng không phải kéo chuột. */}
        <code className="select-all rounded bg-neutral-100 px-1 py-0.5 font-mono text-xs dark:bg-neutral-800">
          {deviceId}
        </code>
        <button
          type="button"
          onClick={copy}
          className="rounded-md border border-neutral-300 px-2 py-0.5 text-xs transition hover:bg-neutral-100 dark:border-neutral-700 dark:hover:bg-neutral-800"
        >
          {copied === "done" ? "Copied" : "Copy"}
        </button>
      </div>
      {copied === "failed" ? (
        <p className="text-xs text-amber-700 dark:text-amber-500">
          The browser blocked automatic copying. Select the full ID, then press Ctrl+C.
        </p>
      ) : null}
    </div>
  );
}
