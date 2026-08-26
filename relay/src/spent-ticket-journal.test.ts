/**
 * Nửa chạm đĩa của sổ chống dùng lại.
 *
 * Điều đáng kiểm nhất ở đây không phải "ghi rồi đọc lại ra đúng" mà là **đọc hỏng thì mở, không
 * đóng**: một file rác không được phép chặn cầu nối khởi động.
 */
import assert from "node:assert/strict";
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, it } from "vitest";
import {
  SPENT_TICKET_JOURNAL_FILE,
  readSpentTickets,
  writeSpentTickets,
} from "./spent-ticket-journal";

let home: string;

beforeEach(() => {
  home = mkdtempSync(path.join(tmpdir(), "relay-spent-tickets-"));
});

afterEach(() => {
  rmSync(home, { recursive: true, force: true });
});

const journal = () => path.join(home, SPENT_TICKET_JOURNAL_FILE);

describe("spent-ticket journal", () => {
  it("ghi rồi đọc lại ra đúng sổ", () => {
    writeSpentTickets(home, [{ jti: "a", expiresAt: 123 }]);
    assert.deepEqual(readSpentTickets(home), [{ jti: "a", expiresAt: 123 }]);
  });

  it("chưa có file thì trả sổ rỗng, không ném", () => {
    assert.deepEqual(readSpentTickets(home), []);
  });

  it("JSON hỏng thì trả sổ rỗng, không ném", () => {
    writeFileSync(journal(), "{ khong phai JSON", "utf8");
    assert.deepEqual(readSpentTickets(home), []);
  });

  it("không phải mảng thì trả sổ rỗng", () => {
    writeFileSync(journal(), JSON.stringify({ jti: "a" }), "utf8");
    assert.deepEqual(readSpentTickets(home), []);
  });

  it("một mục rác không làm quên những mục còn đọc được", () => {
    writeFileSync(
      journal(),
      JSON.stringify([
        { jti: "tot", expiresAt: 5 },
        { jti: "", expiresAt: 5 },
        { jti: "thieu-han" },
        { expiresAt: 5 },
        { jti: "vo-cuc", expiresAt: Number.POSITIVE_INFINITY },
        "rac",
        null,
      ]),
      "utf8",
    );
    assert.deepEqual(readSpentTickets(home), [{ jti: "tot", expiresAt: 5 }]);
  });

  it("ghi đè được sổ cũ, không phụ thuộc file tạm còn sót", () => {
    writeSpentTickets(home, [{ jti: "cu", expiresAt: 1 }]);
    // Một file tạm sót lại từ lần crash trước của đúng pid này không được chặn lần ghi sau.
    writeFileSync(`${journal()}.${process.pid}.tmp`, "rac", "utf8");
    writeSpentTickets(home, [{ jti: "moi", expiresAt: 2 }]);

    assert.deepEqual(readSpentTickets(home), [{ jti: "moi", expiresAt: 2 }]);
  });

  it("tạo thư mục nhà nếu chưa có", () => {
    const nested = path.join(home, "chua", "ton", "tai");
    writeSpentTickets(nested, [{ jti: "a", expiresAt: 1 }]);
    assert.equal(
      JSON.parse(readFileSync(path.join(nested, SPENT_TICKET_JOURNAL_FILE), "utf8")).length,
      1,
    );
  });
});
