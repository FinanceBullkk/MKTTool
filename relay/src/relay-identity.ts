/**
 * Gộp cấu hình + cặp khóa của máy thành thứ `verifyTicket` cần.
 *
 * Tách ra một file riêng vì nó là **chỗ duy nhất** biến hai chuỗi hex trong file cấu hình thành
 * hai `KeyObject`. Dựng khóa rải rác ở nhiều chỗ gọi là mở đường cho hai chỗ hiểu cùng một
 * chuỗi theo hai kiểu — mà kiểu hỏng đó hiện ra dưới dạng *"chữ ký sai"*, câu chỉ vào đúng chỗ
 * nhưng chỉ nhầm nguyên nhân.
 *
 * ## Sổ chống dùng lại sống cùng danh tính
 *
 * `TicketReplayGuard` **phải là đúng một cái** cho cả tiến trình: hai sổ song song thì một tấm vé
 * tiêu được hai lần, mỗi lần ở một sổ. Buộc nó vào danh tính là cách làm điều đó mà không cần một
 * biến toàn cục nào.
 *
 * Có `home` thì sổ được nạp lại từ lần chạy trước và ghi tiếp xuống đó; không có `home` thì nó
 * chỉ sống trong bộ nhớ. Test dựng danh tính trực tiếp đi đường thứ hai và không chạm đĩa.
 */
import type { KeyObject } from "node:crypto";
import { publicKeyFromHex } from "../../src/lib/tickets/server-signing-key";
import { TicketReplayGuard } from "../../src/lib/tickets/ticket-replay-guard";
import type { RelayIdentity } from "../../src/lib/tickets/ticket-verifier";
import type { RelayConfig } from "./relay-config";
import { readSpentTickets, writeSpentTickets } from "./spent-ticket-journal";
import { RELAY_VERSION } from "../../src/lib/relay/relay-endpoints";

/**
 * Dựng danh tính từ cấu hình đã kiểm và khóa riêng đã đọc.
 *
 * `privateKey` nhận vào dạng `KeyObject` chứ không phải hex: khóa riêng đã được
 * `loadOrCreateDeviceKeypair` dựng sẵn, và dựng lại lần nữa từ chuỗi là mở đường cho hai bản
 * khác nhau của cùng một khóa trong cùng tiến trình.
 */
export function buildRelayIdentity(
  config: RelayConfig,
  privateKey: KeyObject,
  home?: string,
): RelayIdentity {
  return {
    deviceId: config.deviceId,
    version: RELAY_VERSION,
    privateKey,
    serverPublicKey: publicKeyFromHex(config.serverPublicKey),
    replayGuard: buildReplayGuard(home),
  };
}

/**
 * Lỗi ghi sổ không được làm hỏng một lần mở profile.
 *
 * Ghi hỏng nghĩa là lần khởi động sau mất trí nhớ chống dùng lại — đúng bằng tình trạng cũ. Còn
 * ném lỗi lên thì `verifyTicket` đổ, và người vận hành mất đường mở profile vì một cái file. Sổ
 * trong bộ nhớ vẫn bảo vệ nguyên vẹn tiến trình đang chạy, nên ghi log rồi đi tiếp.
 */
function buildReplayGuard(home?: string): TicketReplayGuard {
  if (!home) return new TicketReplayGuard();

  const guard = new TicketReplayGuard((records) => {
    try {
      writeSpentTickets(home, records);
    } catch (error) {
      console.error(`[relay] spent-ticket journal write failed: ${(error as Error).message}`);
    }
  });
  guard.restore(readSpentTickets(home));
  return guard;
}
