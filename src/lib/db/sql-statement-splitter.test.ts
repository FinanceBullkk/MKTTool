import { describe, expect, it } from "vitest";
import { splitSqlStatements } from "./sql-statement-splitter";

describe("splitSqlStatements", () => {
  it("tách theo dấu chấm phẩy", () => {
    expect(splitSqlStatements("SELECT 1; SELECT 2;")).toEqual(["SELECT 1", "SELECT 2"]);
  });

  it("nhận câu lệnh cuối không có dấu chấm phẩy", () => {
    expect(splitSqlStatements("SELECT 1;\nSELECT 2")).toEqual(["SELECT 1", "SELECT 2"]);
  });

  it("bỏ qua khoảng trắng và câu rỗng", () => {
    expect(splitSqlStatements(";;  \n ; SELECT 1 ;")).toEqual(["SELECT 1"]);
  });

  it("bỏ chú thích hai gạch ngang", () => {
    const sql = "-- CreateTable\nCREATE TABLE a (id TEXT); -- xong\nSELECT 1;";
    expect(splitSqlStatements(sql)).toEqual(["CREATE TABLE a (id TEXT)", "SELECT 1"]);
  });

  /** Lý do hàm này tồn tại thay vì `sql.split(";")`. */
  it("KHÔNG cắt ở dấu chấm phẩy nằm trong chuỗi", () => {
    const sql = `CREATE TABLE a ("x" TEXT DEFAULT 'nua;sau');\nSELECT 1;`;
    expect(splitSqlStatements(sql)).toEqual([
      `CREATE TABLE a ("x" TEXT DEFAULT 'nua;sau')`,
      "SELECT 1",
    ]);
  });

  it("KHÔNG cắt ở dấu chấm phẩy nằm trong tên có nháy kép", () => {
    expect(splitSqlStatements(`SELECT "cot;la" FROM t;`)).toEqual([`SELECT "cot;la" FROM t`]);
  });

  it("KHÔNG coi hai gạch ngang trong chuỗi là chú thích", () => {
    const sql = `INSERT INTO t VALUES ('a -- b');\nSELECT 1;`;
    expect(splitSqlStatements(sql)).toEqual(["INSERT INTO t VALUES ('a -- b')", "SELECT 1"]);
  });

  it("hiểu nháy đơn được thoát bằng cách gõ đôi", () => {
    const sql = `INSERT INTO t VALUES ('it''s; here');\nSELECT 1;`;
    expect(splitSqlStatements(sql)).toEqual(["INSERT INTO t VALUES ('it''s; here')", "SELECT 1"]);
  });

  it("giữ nguyên câu lệnh nhiều dòng", () => {
    const sql = "CREATE TABLE a (\n  id TEXT,\n  name TEXT\n);";
    expect(splitSqlStatements(sql)).toEqual(["CREATE TABLE a (\n  id TEXT,\n  name TEXT\n)"]);
  });

  it("file rỗng thì không có câu lệnh nào", () => {
    expect(splitSqlStatements("")).toEqual([]);
    expect(splitSqlStatements("-- chỉ có chú thích\n")).toEqual([]);
  });
});
