/**
 * Sổ chống dùng lại: phần thuần logic, không chạm đĩa.
 *
 * Nửa ghi file nằm ở `relay/src/spent-ticket-journal.test.ts`. Tách đôi vì đây là chỗ duy nhất
 * quyết định *"vé này tiêu chưa"*, và câu trả lời đó không nên phụ thuộc vào một thư mục tạm.
 */
import assert from "node:assert/strict";
import { describe, it } from "vitest";
import {
  ReplayJournalUnavailableError,
  TicketReplayGuard,
  type SpentTicketRecord,
} from "./ticket-replay-guard";

const NOW = 1_700_000_000_000;
const LATER = NOW + 30_000;

describe("TicketReplayGuard", () => {
  it("accepts the first use and blocks the next", () => {
    const guard = new TicketReplayGuard();
    assert.equal(guard.consume("a", LATER, NOW), true);
    assert.equal(guard.consume("a", LATER, NOW), false);
  });

  it("still blocks an old ticket after loading the previous run's journal", () => {
    const guard = new TicketReplayGuard();
    guard.restore([{ jti: "a", expiresAt: LATER }], NOW);
    assert.equal(guard.consume("a", LATER, NOW), false);
  });

  it("drops expired tickets while loading so the journal does not grow", () => {
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

  it("persists the journal whenever its state actually changes", () => {
    const writes: SpentTicketRecord[][] = [];
    const guard = new TicketReplayGuard((records) => writes.push(records));

    guard.consume("a", LATER, NOW);
    assert.deepEqual(writes, [[{ jti: "a", expiresAt: LATER }]]);

    // Tiêu lại không đổi gì, nên không được ghi thêm lần nào.
    guard.consume("a", LATER, NOW);
    assert.equal(writes.length, 1);
  });

  it("removes expired entries from the persisted snapshot", () => {
    const writes: SpentTicketRecord[][] = [];
    const guard = new TicketReplayGuard((records) => writes.push(records));
    guard.consume("cu", NOW + 1, NOW);
    guard.consume("moi", LATER, NOW + 2);

    assert.deepEqual(writes.at(-1), [{ jti: "moi", expiresAt: LATER }]);
  });

  it("still works in memory when no persistence function is provided", () => {
    const guard = new TicketReplayGuard();
    assert.equal(guard.consume("a", LATER, NOW), true);
    assert.equal(guard.size, 1);
  });

  it("keeps state unchanged and fails closed when persistence fails", () => {
    let attempts = 0;
    const guard = new TicketReplayGuard(() => {
      attempts += 1;
      throw new Error("fsync failed");
    });

    assert.throws(
      () => guard.consume("a", LATER, NOW),
      (error: unknown) => error instanceof ReplayJournalUnavailableError,
    );
    assert.equal(guard.size, 0);
    assert.throws(
      () => guard.consume("b", LATER, NOW),
      (error: unknown) => error instanceof ReplayJournalUnavailableError,
    );
    assert.equal(attempts, 1);
  });
});
