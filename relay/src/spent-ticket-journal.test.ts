/** Focused corruption and durability tests for the Relay replay journal. */
import assert from "node:assert/strict";
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import {
  ensureSpentTicketJournal,
  SPENT_TICKET_JOURNAL_FILE,
  SPENT_TICKET_JOURNAL_MARKER_FILE,
  readSpentTickets,
  SpentTicketJournalError,
  writeSpentTickets,
} from "./spent-ticket-journal";

let home: string;

beforeEach(() => {
  home = mkdtempSync(path.join(tmpdir(), "relay-spent-tickets-"));
});

afterEach(() => {
  delete process.env.RELAY_JOURNAL_FAULT;
  rmSync(home, { recursive: true, force: true });
});

const journal = () => path.join(home, SPENT_TICKET_JOURNAL_FILE);

function expectJournalError(action: () => unknown, code: SpentTicketJournalError["code"]): void {
  expect(action).toThrow(SpentTicketJournalError);
  try {
    action();
  } catch (error) {
    assert.equal((error as SpentTicketJournalError).code, code);
  }
}

describe("spent-ticket journal", () => {
  it("writes, flushes, and reads the exact snapshot", () => {
    writeSpentTickets(home, [{ jti: "a", expiresAt: 123 }]);
    assert.deepEqual(readSpentTickets(home), [{ jti: "a", expiresAt: 123 }]);
  });

  it("initializes once and leaves an explicit marker", () => {
    ensureSpentTicketJournal(home);
    assert.deepEqual(readSpentTickets(home), []);
    assert.equal(readFileSync(path.join(home, SPENT_TICKET_JOURNAL_MARKER_FILE), "utf8"), "mkttool-spent-ticket-journal-v1\n");
  });

  it("rejects a missing journal after initialization", () => {
    ensureSpentTicketJournal(home);
    rmSync(journal());
    expectJournalError(() => ensureSpentTicketJournal(home), "MISSING");
    expectJournalError(() => readSpentTickets(home), "MISSING");
  });

  it("rejects missing, malformed, partial, and non-array state", () => {
    expectJournalError(() => readSpentTickets(home), "MISSING");

    writeFileSync(journal(), "{ not json", "utf8");
    expectJournalError(() => readSpentTickets(home), "CORRUPT");

    writeFileSync(journal(), JSON.stringify({ jti: "a" }), "utf8");
    expectJournalError(() => readSpentTickets(home), "CORRUPT");

    writeFileSync(journal(), "[{\"jti\":\"a\",\"expiresAt\":", "utf8");
    expectJournalError(() => readSpentTickets(home), "CORRUPT");
  });

  it("rejects invalid or duplicate records instead of filtering them", () => {
    writeFileSync(
      journal(),
      JSON.stringify([
        { jti: "good", expiresAt: 5 },
        { jti: "", expiresAt: 5 },
      ]),
      "utf8",
    );
    expectJournalError(() => readSpentTickets(home), "INVALID");

    writeFileSync(
      journal(),
      JSON.stringify([
        { jti: "same", expiresAt: 5 },
        { jti: "same", expiresAt: 6 },
      ]),
      "utf8",
    );
    expectJournalError(() => readSpentTickets(home), "INVALID");
  });

  it("does not bless an interrupted first write", () => {
    writeFileSync(`${journal()}.${process.pid}.tmp`, "partial", "utf8");
    expectJournalError(() => ensureSpentTicketJournal(home), "CORRUPT");
  });

  it("ignores a stale temp file when the committed destination is valid", () => {
    writeSpentTickets(home, [{ jti: "old", expiresAt: 1 }]);
    writeFileSync(`${journal()}.${process.pid}.tmp`, "partial", "utf8");
    writeSpentTickets(home, [{ jti: "new", expiresAt: 2 }]);
    assert.deepEqual(readSpentTickets(home), [{ jti: "new", expiresAt: 2 }]);
  });

  it("creates nested homes without a BOM", () => {
    const nested = path.join(home, "nested", "relay");
    writeSpentTickets(nested, [{ jti: "a", expiresAt: 1 }]);
    const bytes = readFileSync(path.join(nested, SPENT_TICKET_JOURNAL_FILE));
    assert.notEqual(bytes[0], 0xef);
    assert.equal(JSON.parse(bytes.toString("utf8")).length, 1);
  });

  it("keeps the previous snapshot when flush or rename is interrupted", () => {
    writeSpentTickets(home, [{ jti: "committed", expiresAt: 10 }]);
    for (const fault of ["after-fsync", "before-rename"]) {
      process.env.RELAY_JOURNAL_FAULT = fault;
      expect(() => writeSpentTickets(home, [{ jti: "lost", expiresAt: 20 }])).toThrow(
        SpentTicketJournalError,
      );
      delete process.env.RELAY_JOURNAL_FAULT;
      assert.deepEqual(readSpentTickets(home), [{ jti: "committed", expiresAt: 10 }]);
    }
  });

  it("fails closed when the home cannot be written", () => {
    const blocker = path.join(home, "not-a-directory");
    writeFileSync(blocker, "file", "utf8");
    expect(() => writeSpentTickets(path.join(blocker, "child"), [])).toThrow();
  });

  it("leaves a valid whole snapshot across serialized concurrent calls", () => {
    for (let index = 0; index < 20; index += 1) {
      writeSpentTickets(home, [{ jti: `jti-${index}`, expiresAt: index + 1 }]);
    }
    const records = readSpentTickets(home);
    assert.equal(records.length, 1);
    assert.match(records[0]!.jti, /^jti-\d+$/);
  });
});
