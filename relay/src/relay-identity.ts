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
 * Có `home` thì sổ được nạp lại từ lần chạy trước và ghi bền vững xuống đó; không có `home` thì
 * nó chỉ sống trong bộ nhớ. Test dựng danh tính trực tiếp đi đường thứ hai và không chạm đĩa.
 */
import type { KeyObject } from "node:crypto";
import { publicKeyFromHex } from "../../src/lib/tickets/server-signing-key";
import { TicketReplayGuard } from "../../src/lib/tickets/ticket-replay-guard";
import type { RelayIdentity } from "../../src/lib/tickets/ticket-verifier";
import type { RelayConfig } from "./relay-config";
import { ensureSpentTicketJournal, readSpentTickets, writeSpentTickets } from "./spent-ticket-journal";
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
 * Journal bền vững là một phần của danh tính Relay. Lỗi đọc lúc khởi động phải làm trạng thái
 * không sẵn sàng; lỗi ghi lúc đang chạy được `TicketReplayGuard` chuyển thành từ chối vé.
 */
function buildReplayGuard(home?: string): TicketReplayGuard {
  if (!home) return new TicketReplayGuard();

  ensureSpentTicketJournal(home);
  const guard = new TicketReplayGuard((records) => writeSpentTickets(home, records));
  guard.restore(readSpentTickets(home));
  return guard;
}
