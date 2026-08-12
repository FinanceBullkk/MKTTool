/**
 * Tải file `.exe` cầu nối. **Sau lớp đăng nhập** (QĐ 11).
 *
 * ## Lớp đăng nhập ở đây bảo vệ cái gì, và không bảo vệ cái gì
 *
 * `.exe` này **không chứa bí mật nào**: khóa riêng do chính nó sinh ra trên từng máy, còn khóa
 * vùng operator thì người cài nhập trên loopback page và Relay lưu trong DPAPI. Ai lấy được file cũng không mở
 * nổi một mật khẩu nào — đó là toàn bộ thiết kế của GĐ3.
 *
 * Nên đừng nhầm: lớp gác này **không** phải là thứ giữ kho an toàn. Nó làm hai việc khiêm tốn
 * hơn — không rải sẵn một bản để người ngoài mang về mổ xẻ tìm lỗ, và giữ đúng một đường tải để
 * không ai trong team đi cài một file `.exe` nhặt được từ chat.
 *
 * ## Stream, không đọc cả file vào bộ nhớ
 *
 * 87 MB. `readFileSync` ở đây là 87 MB trong heap của tiến trình web cho **mỗi** lượt tải cùng
 * lúc — trên gói Railway nhỏ thì hai người cùng bấm là đủ để tiến trình chết vì hết bộ nhớ, và
 * triệu chứng sẽ là "web tự khởi động lại" chứ không phải "tải hỏng".
 */
import { NextResponse } from "next/server";
import { guardedRoute } from "@/lib/auth/guarded-route";
import {
  readRelayRelease,
} from "@/lib/relay/relay-release-file";
import { RELAY_VERSION } from "@/lib/relay/relay-endpoints";

export const runtime = "nodejs";

// File trên đĩa đổi mỗi lần phát hành, và không có gì báo cho Next biết. Dựng sẵn lúc build là
// phục vụ một bản `.exe` đã bị thay từ đời nào.
export const dynamic = "force-dynamic";

export const GET = guardedRoute(async function GET(_actor, request: Request) {
  const release = await readRelayRelease(RELAY_VERSION);

  if (!release.available) {
    return NextResponse.json(
      {
        ok: false,
        message:
          `Máy chủ này chưa có gói cài nào để tải (đã tìm ở ${release.expectedPath}). ` +
          `Người quản trị dựng bằng "npm run relay:build" trên một máy Windows rồi đẩy lên ` +
          `bằng "npm run relay:publish".`,
      },
      { status: 404 },
    );
  }

  return NextResponse.redirect(new URL(`/api/relay/download/v${release.version}`, request.url));
});
