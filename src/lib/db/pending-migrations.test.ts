import { describe, expect, it } from "vitest";
import {
  type MigrationLedgerRow,
  appliedMigrationNames,
  findPendingMigrations,
} from "./pending-migrations";

function row(
  migration_name: string,
  overrides: Partial<MigrationLedgerRow> = {},
): MigrationLedgerRow {
  return {
    migration_name,
    finished_at: new Date("2026-08-01T00:00:00Z"),
    rolled_back_at: null,
    ...overrides,
  };
}

describe("appliedMigrationNames", () => {
  it("nhận migration đã chạy xong", () => {
    expect(appliedMigrationNames([row("20260801_init")])).toEqual(new Set(["20260801_init"]));
  });

  it("KHÔNG nhận migration chạy dở — deploy phải được dừng lại để báo database hỏng", () => {
    expect(appliedMigrationNames([row("20260801_init", { finished_at: null })]).size).toBe(0);
  });

  it("KHÔNG nhận migration đã quay lui", () => {
    const rolledBack = row("20260801_init", { rolled_back_at: new Date() });
    expect(appliedMigrationNames([rolledBack]).size).toBe(0);
  });
});

describe("findPendingMigrations", () => {
  const onDisk = ["20260801_init", "20260802_queue", "20260803_health"];

  it("database rỗng thì mọi migration đều chờ áp", () => {
    expect(findPendingMigrations(onDisk, new Set())).toEqual(onDisk);
  });

  it("chỉ trả về phần chưa áp", () => {
    const applied = new Set(["20260801_init", "20260802_queue"]);
    expect(findPendingMigrations(onDisk, applied)).toEqual(["20260803_health"]);
  });

  it("áp đủ rồi thì không còn gì — đây là nhánh cho phép bỏ qua bước sao lưu", () => {
    expect(findPendingMigrations(onDisk, new Set(onDisk))).toEqual([]);
  });

  it("giữ đúng thứ tự áp kể cả khi đọc thư mục ra lộn xộn", () => {
    const shuffled = ["20260803_health", "20260801_init", "20260802_queue"];
    expect(findPendingMigrations(shuffled, new Set())).toEqual(onDisk);
  });

  it("bỏ qua migration lạ nằm trong database mà không có trên đĩa", () => {
    // Xảy ra khi hạ phiên bản app: database mới hơn code. Không phải việc của lệnh nâng cấp,
    // nhưng cũng không được vì thế mà báo có việc phải làm.
    const applied = new Set([...onDisk, "20260810_tu_ban_moi_hon"]);
    expect(findPendingMigrations(onDisk, applied)).toEqual([]);
  });
});
