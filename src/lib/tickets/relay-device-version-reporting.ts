"use server";

/**
 * Ghi lại bản cầu nối mà một chiếc máy vừa khai.
 *
 * ## Vì sao cần tới cả một đường riêng cho một con số đã chạy ngang qua
 *
 * Cầu nối đóng dấu `relayVersion` vào **mọi** phản hồi, kể cả phản hồi bị từ chối
 * (`relay-http-server.ts`). Trình duyệt đọc nó, vẽ cảnh báo "bản cũ", rồi vứt đi — nó chưa bao giờ
 * đi tiếp về máy chủ. Nên máy chủ mù hoàn toàn về việc đội đang chạy bản nào.
 *
 * Vô hại cho tới 18/08/2026, khi `MIN_RELAY_VERSION` lên 13 và mọi máy dưới bản đó bị chặn. Lúc ấy
 * không ai trả lời được *vừa chặn những ai*, *đội cập nhật xong chưa*, *còn ai kẹt không*. C40.
 *
 * ## Đây là quan trắc, không phải điều khiển — và cách viết phải nói ra điều đó
 *
 * Con số này do **máy khách khai**, nên nó không được dùng để cho phép việc gì. Thứ quyết định một
 * chiếc cầu nối cũ có làm được việc hay không là `minRelayVersion` trong từng tấm vé, do máy chủ ký
 * và do chính cầu nối tự đối chiếu (`ticket-verifier.ts`). Ai đó khai gian ở đây chỉ làm bẩn một ô
 * hiển thị, không mở được cánh cửa nào.
 *
 * Vì là quan trắc nên nó **hỏng theo hướng im lặng**: gọi trên đường bấm nút của người dùng, và một
 * lượt ghi hỏng không bao giờ được phép làm hỏng thao tác mà người ta đang thực sự làm.
 */
import { prisma } from "@/lib/db/prisma-client";
import { guardedAction } from "@/lib/auth/guarded-action";

export interface RelayDeviceVersionReport {
  deviceId: string;
  relayVersion: number;
}

/**
 * Ghi bản cầu nối và mốc nhìn thấy, **chỉ cho chiếc máy thuộc về chính người đang gọi**.
 *
 * `updateMany` chứ không phải đọc rồi ghi: quyền sở hữu nằm ngay trong mệnh đề `where`, nên không
 * có khe hở giữa lúc kiểm và lúc ghi, và một `deviceId` không khớp trở thành **no-op** thay vì một
 * ngoại lệ ném ra giữa đường bấm nút của người dùng.
 *
 * Máy đã thu hồi bị loại khỏi `where` có chủ đích. Thu hồi là một chiều (xem `revokedAt`), và một
 * chiếc máy đã bị chặn thì trạng thái của nó nên đứng yên ở mốc bị chặn — để nó tiếp tục tự cập
 * nhật `lastSeenAt` là làm một hàng đã đóng trông như còn sống.
 */
export const recordRelayDeviceVersion = guardedAction(async function recordRelayDeviceVersion(
  actor,
  report: RelayDeviceVersionReport,
): Promise<{ recorded: boolean }> {
  const { deviceId, relayVersion } = report;

  // Chặn rác trước khi chạm database. Không ném: chỗ gọi là đường bấm nút, và một con số dị dạng
  // là chuyện của kẻ nghịch devtools chứ không phải việc để làm hỏng thao tác của người dùng thật.
  if (
    typeof deviceId !== "string" ||
    deviceId.length === 0 ||
    !Number.isSafeInteger(relayVersion) ||
    relayVersion <= 0
  ) {
    return { recorded: false };
  }

  const { count } = await prisma.relayDevice.updateMany({
    where: { id: deviceId, userId: actor.userId, revokedAt: null },
    data: { relayVersion, lastSeenAt: new Date() },
  });

  return { recorded: count > 0 };
});
