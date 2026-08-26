/**
 * Sổ jti đã tiêu, giữ qua một lần khởi động lại.
 *
 * Đây là nửa "chạm đĩa" của `TicketReplayGuard`; lớp kia không biết `node:fs` tồn tại. Tách vậy
 * để phần quyết định *"vé này tiêu chưa"* còn test được mà không cần thư mục tạm, và để chỉ có
 * đúng một chỗ trong cầu nối biết sổ nằm ở đâu.
 *
 * ## Đọc hỏng thì mở, không đóng
 *
 * Mọi đường khác trong cầu nối fail-closed. Đường này thì không, và đó là chủ ý.
 *
 * File hỏng hoặc không đọc được nghĩa là mất trí nhớ chống dùng lại của **một** lần khởi động —
 * đúng bằng tình trạng trước khi có file này, không tệ hơn. Còn ném lỗi ở đây thì cầu nối không
 * dựng nổi danh tính, và cầu nối chạy nền nên người vận hành chỉ thấy "không thấy cầu nối trên
 * máy này". Đổi một cửa sổ 30 giây rất hẹp lấy việc chặn đứng con đường làm việc duy nhất của họ
 * là một vụ trao đổi tồi.
 *
 * Ghi hỏng thì ném — nơi gọi bắt lấy, ghi log và chạy tiếp, vì sổ trong bộ nhớ vẫn đang bảo vệ
 * tiến trình hiện tại.
 */
import { mkdirSync, readFileSync, renameSync, unlinkSync, writeFileSync } from "node:fs";
import path from "node:path";
import type { SpentTicketRecord } from "../../src/lib/tickets/ticket-replay-guard";

export const SPENT_TICKET_JOURNAL_FILE = "spent-tickets.json";

function isRecordShaped(value: unknown): value is SpentTicketRecord {
  const record = value as Partial<SpentTicketRecord> | null;
  return (
    typeof record === "object" &&
    record !== null &&
    typeof record.jti === "string" &&
    record.jti.length > 0 &&
    typeof record.expiresAt === "number" &&
    Number.isFinite(record.expiresAt)
  );
}

/**
 * Đọc sổ của lần chạy trước. Thiếu file, JSON hỏng, hay hình dạng sai đều trả về sổ rỗng.
 *
 * Lọc theo từng mục chứ không vứt cả file khi gặp một mục hỏng: một dòng rác không phải lý do để
 * quên tất cả những vé còn lại vẫn nhớ được.
 */
export function readSpentTickets(home: string): SpentTicketRecord[] {
  const filePath = path.join(home, SPENT_TICKET_JOURNAL_FILE);
  try {
    const parsed: unknown = JSON.parse(readFileSync(filePath, "utf8"));
    if (!Array.isArray(parsed)) return [];
    return parsed.filter(isRecordShaped);
  } catch {
    return [];
  }
}

/** Ghi sổ nguyên tử, theo đúng khuôn `tmp` + `rename` mà cầu nối đã dùng ở bốn chỗ khác. */
export function writeSpentTickets(home: string, records: readonly SpentTicketRecord[]): void {
  mkdirSync(home, { recursive: true });
  const destination = path.join(home, SPENT_TICKET_JOURNAL_FILE);
  const temporary = `${destination}.${process.pid}.tmp`;
  try {
    // `w`, không phải `wx` như bốn chỗ ghi nguyên tử khác. Những chỗ đó ghi một lần rồi thôi nên
    // `wx` bắt được va chạm. Sổ này ghi lại mỗi lần tiêu vé, và tên file tạm mang `pid` — một file
    // tạm sót lại từ lần crash trước của đúng pid ấy sẽ làm `wx` ném mãi mãi cho tới khi có người
    // vào xóa tay. Ghi đè là hành vi đúng ở đây.
    writeFileSync(temporary, `${JSON.stringify(records, null, 2)}\n`, {
      encoding: "utf8",
      flag: "w",
    });
    renameSync(temporary, destination);
  } catch (error) {
    try {
      unlinkSync(temporary);
    } catch {
      // Không cần dọn khi file tạm chưa từng được tạo.
    }
    throw new Error(`Cannot persist spent-ticket journal: ${(error as Error).message}`);
  }
}
