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
  it("recognizes a completed migration", () => {
    expect(appliedMigrationNames([row("20260801_init")])).toEqual(new Set(["20260801_init"]));
  });

  it("does NOT recognize an unfinished migration because deployment must stop", () => {
    expect(appliedMigrationNames([row("20260801_init", { finished_at: null })]).size).toBe(0);
  });

  it("does NOT recognize a rolled-back migration", () => {
    const rolledBack = row("20260801_init", { rolled_back_at: new Date() });
    expect(appliedMigrationNames([rolledBack]).size).toBe(0);
  });
});

describe("findPendingMigrations", () => {
  const onDisk = ["20260801_init", "20260802_queue", "20260803_health"];

  it("returns every migration as pending for an empty database", () => {
    expect(findPendingMigrations(onDisk, new Set())).toEqual(onDisk);
  });

  it("returns only unapplied migrations", () => {
    const applied = new Set(["20260801_init", "20260802_queue"]);
    expect(findPendingMigrations(onDisk, applied)).toEqual(["20260803_health"]);
  });

  it("returns nothing when all migrations are applied", () => {
    expect(findPendingMigrations(onDisk, new Set(onDisk))).toEqual([]);
  });

  it("preserves application order even when directory entries are shuffled", () => {
    const shuffled = ["20260803_health", "20260801_init", "20260802_queue"];
    expect(findPendingMigrations(shuffled, new Set())).toEqual(onDisk);
  });

  it("ignores a database migration that is not present on disk", () => {
    // Xảy ra khi hạ phiên bản app: database mới hơn code. Không phải việc của lệnh nâng cấp,
    // nhưng cũng không được vì thế mà báo có việc phải làm.
    const applied = new Set([...onDisk, "20260810_from_newer_version"]);
    expect(findPendingMigrations(onDisk, applied)).toEqual([]);
  });
});
