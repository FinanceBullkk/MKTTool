import { describe, expect, it } from "vitest";
import { postgresToolEnv } from "./postgres-connection-env";

describe("postgresToolEnv", () => {
  it("extracts the host, port, user, password, and database name", () => {
    expect(postgresToolEnv("postgresql://bob:s3cret@db.example.com:6543/mkttool_dev")).toEqual({
      PGHOST: "db.example.com",
      PGPORT: "6543",
      PGUSER: "bob",
      PGPASSWORD: "s3cret",
      PGDATABASE: "mkttool_dev",
    });
  });

  it("uses port 5432 when the URL omits a port", () => {
    expect(postgresToolEnv("postgresql://bob@localhost/mkttool_test").PGPORT).toBe("5432");
  });

  it("also accepts the postgres:// scheme", () => {
    expect(postgresToolEnv("postgres://localhost/x").PGDATABASE).toBe("x");
  });

  /**
   * Mật khẩu Postgres hay có `@`, `/`, `#` — những ký tự bắt buộc phải mã hóa URL.
   * Quên giải mã thì pg_dump nhận sai mật khẩu và báo "authentication failed", một thông
   * báo dẫn người đọc đi sai hướng hoàn toàn.
   */
  it("decodes URL-encoded characters in the password and database name", () => {
    const env = postgresToolEnv("postgresql://u:p%40ss%2Fword@localhost/caf%C3%A9");
    expect(env.PGPASSWORD).toBe("p@ss/word");
    expect(env.PGDATABASE).toBe("café");
  });

  it("maps sslmode to PGSSLMODE without inventing a value", () => {
    expect(postgresToolEnv("postgresql://localhost/x?sslmode=require").PGSSLMODE).toBe("require");
    expect(postgresToolEnv("postgresql://localhost/x").PGSSLMODE).toBeUndefined();
  });

  it("omits user and password variables instead of setting empty strings", () => {
    const env = postgresToolEnv("postgresql://localhost/x");
    expect("PGUSER" in env).toBe(false);
    expect("PGPASSWORD" in env).toBe(false);
  });

  /** URL SQLite cũ là lỗi dễ gặp nhất khi nâng cấp — thông báo phải chỉ đúng chỗ sửa. */
  it("rejects an old SQLite URL with remediation", () => {
    expect(() => postgresToolEnv("file:./dev.db")).toThrow(/postgresql:\/\//);
  });

  it("reports a missing database name instead of connecting to the default database", () => {
    expect(() => postgresToolEnv("postgresql://u:p@localhost:5432/")).toThrow(/missing the database name/i);
  });

  it("rejects an invalid URL", () => {
    expect(() => postgresToolEnv("not-a-url")).toThrow(/valid URL/);
  });
});
