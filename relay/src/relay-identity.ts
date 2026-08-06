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
 * `TicketReplayGuard` giữ trong bộ nhớ và **phải là đúng một cái** cho cả tiến trình: hai sổ
 * song song thì một tấm vé tiêu được hai lần, mỗi lần ở một sổ. Buộc nó vào danh tính là cách
 * làm điều đó mà không cần một biến toàn cục nào.
 */
import type { KeyObject } from "node:crypto";
import { publicKeyFromHex } from "../../src/lib/tickets/server-signing-key";
import { TicketReplayGuard } from "../../src/lib/tickets/ticket-replay-guard";
import type { RelayIdentity } from "../../src/lib/tickets/ticket-verifier";
import type { RelayConfig } from "./relay-config";
import { RELAY_VERSION } from "../../src/lib/relay/relay-endpoints";

/**
 * Dựng danh tính từ cấu hình đã kiểm và khóa riêng đã đọc.
 *
 * `privateKey` nhận vào dạng `KeyObject` chứ không phải hex: khóa riêng đã được
 * `loadOrCreateDeviceKeypair` dựng sẵn, và dựng lại lần nữa từ chuỗi là mở đường cho hai bản
 * khác nhau của cùng một khóa trong cùng tiến trình.
 */
export function buildRelayIdentity(config: RelayConfig, privateKey: KeyObject): RelayIdentity {
  return {
    deviceId: config.deviceId,
    version: RELAY_VERSION,
    privateKey,
    serverPublicKey: publicKeyFromHex(config.serverPublicKey),
    replayGuard: new TicketReplayGuard(),
  };
}
