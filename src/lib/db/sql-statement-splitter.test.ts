import { describe, expect, it } from "vitest";
import { splitSqlStatements } from "./sql-statement-splitter";

describe("splitSqlStatements", () => {
  it("splits on semicolons", () => {
    expect(splitSqlStatements("SELECT 1; SELECT 2;")).toEqual(["SELECT 1", "SELECT 2"]);
  });

  it("returns a final statement without a semicolon", () => {
    expect(splitSqlStatements("SELECT 1;\nSELECT 2")).toEqual(["SELECT 1", "SELECT 2"]);
  });

  it("ignores whitespace and empty statements", () => {
    expect(splitSqlStatements(";;  \n ; SELECT 1 ;")).toEqual(["SELECT 1"]);
  });

  it("removes double-dash comments", () => {
    const sql = "-- CreateTable\nCREATE TABLE a (id TEXT); -- done\nSELECT 1;";
    expect(splitSqlStatements(sql)).toEqual(["CREATE TABLE a (id TEXT)", "SELECT 1"]);
  });

  /** Lý do hàm này tồn tại thay vì `sql.split(";")`. */
  it("does NOT split on semicolons inside string literals", () => {
    const sql = `CREATE TABLE a ("x" TEXT DEFAULT 'before;after');\nSELECT 1;`;
    expect(splitSqlStatements(sql)).toEqual([
      `CREATE TABLE a ("x" TEXT DEFAULT 'before;after')`,
      "SELECT 1",
    ]);
  });

  it("does NOT split on semicolons inside double-quoted identifiers", () => {
    expect(splitSqlStatements(`SELECT "column;name" FROM t;`)).toEqual([`SELECT "column;name" FROM t`]);
  });

  it("does NOT treat double dashes inside strings as comments", () => {
    const sql = `INSERT INTO t VALUES ('a -- b');\nSELECT 1;`;
    expect(splitSqlStatements(sql)).toEqual(["INSERT INTO t VALUES ('a -- b')", "SELECT 1"]);
  });

  it("handles single quotes escaped by doubling", () => {
    const sql = `INSERT INTO t VALUES ('it''s; here');\nSELECT 1;`;
    expect(splitSqlStatements(sql)).toEqual(["INSERT INTO t VALUES ('it''s; here')", "SELECT 1"]);
  });

  it("preserves multiline statements", () => {
    const sql = "CREATE TABLE a (\n  id TEXT,\n  name TEXT\n);";
    expect(splitSqlStatements(sql)).toEqual(["CREATE TABLE a (\n  id TEXT,\n  name TEXT\n)"]);
  });

  it("returns no statements for an empty file", () => {
    expect(splitSqlStatements("")).toEqual([]);
    expect(splitSqlStatements("-- comments only\n")).toEqual([]);
  });
});
