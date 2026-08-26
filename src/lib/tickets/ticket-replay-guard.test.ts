/**
 * Sổ chống dùng lại: phần thuần logic, không chạm đĩa.
 *
 * Nửa ghi file nằm ở `relay/src/spent-ticket-journal.test.ts`. Tách đôi vì đây là chỗ duy nhất
 * quyết định *"vé này tiêu chưa"*, và câu trả lời đó không nên phụ thuộc vào một thư mục tạm.
 */
import assert from "node:assert/strict";
import { describe, it } from "vitest";
import { TicketReplayGuard, type SpentTicketRecord } from "./ticket-replay-guard";

const NOW = 1_700_000_000_000;
const LATER = NOW + 30_000;

describe("TicketReplayGuard", () => {
  it("tiêu được lần đầu, chặn lần sau", () => {
    const guard = new TicketReplayGuard();
    assert.equal(guard.consume("a", LATER, NOW), true);
    assert.equal(guard.consume("a", LATER, NOW), false);
  });

  it("nạp lại sổ của lần chạy trước thì vé cũ vẫn bị chặn", () => {
    const guard = new TicketReplayGuard();
    guard.restore([{ jti: "a", expiresAt: LATER }], NOW);
    assert.equal(guard.consume("a", LATER, NOW), false);
  });

  it("nạp lại thì bỏ luôn vé đã hết hạn, không để sổ phình", () => {
    const guard = new TicketReplayGuard();
    guard.restore(
      [
        { jti: "song", expiresAt: LATER },
        { jti: "chet", expiresAt: NOW - 1 },
      ],
      NOW,
    );
    assert.equal(guard.size, 1);
    // Vé đã hết hạn bị `verifyTicket` chặn vì quá hạn trước khi hỏi tới sổ, nên quên nó là đúng.
    assert.equal(guard.consume("chet", NOW - 1, NOW), true);
  });

  it("ghi sổ ra ngoài mỗi lần sổ thật sự đổi", () => {
    const writes: SpentTicketRecord[][] = [];
    const guard = new TicketReplayGuard((records) => writes.push(records));

    guard.consume("a", LATER, NOW);
    assert.deepEqual(writes, [[{ jti: "a", expiresAt: LATER }]]);

    // Tiêu lại không đổi gì, nên không được ghi thêm lần nào.
    guard.consume("a", LATER, NOW);
    assert.equal(writes.length, 1);
  });

  it("ảnh chụp đem đi ghi đã bỏ phần hết hạn", () => {
    const writes: SpentTicketRecord[][] = [];
    const guard = new TicketReplayGuard((records) => writes.push(records));
    guard.consume("cu", NOW + 1, NOW);
    guard.consume("moi", LATER, NOW + 2);

    assert.deepEqual(writes.at(-1), [{ jti: "moi", expiresAt: LATER }]);
  });

  it("không truyền hàm ghi thì vẫn chạy, chỉ sống trong bộ nhớ", () => {
    const guard = new TicketReplayGuard();
    assert.equal(guard.consume("a", LATER, NOW), true);
    assert.equal(guard.size, 1);
  });
});
