import { describe, expect, it } from "vitest";
import { postgresToolEnv } from "./postgres-connection-env";

describe("postgresToolEnv", () => {
  it("tách đủ host, cổng, user, mật khẩu, tên database", () => {
    expect(postgresToolEnv("postgresql://bob:s3cret@db.example.com:6543/mkttool_dev")).toEqual({
      PGHOST: "db.example.com",
      PGPORT: "6543",
      PGUSER: "bob",
      PGPASSWORD: "s3cret",
      PGDATABASE: "mkttool_dev",
    });
  });

  it("thiếu cổng thì dùng 5432", () => {
    expect(postgresToolEnv("postgresql://bob@localhost/mkttool_test").PGPORT).toBe("5432");
  });

  it("chấp nhận cả lược đồ postgres://", () => {
    expect(postgresToolEnv("postgres://localhost/x").PGDATABASE).toBe("x");
  });

  /**
   * Mật khẩu Postgres hay có `@`, `/`, `#` — những ký tự bắt buộc phải mã hóa URL.
   * Quên giải mã thì pg_dump nhận sai mật khẩu và báo "authentication failed", một thông
   * báo dẫn người đọc đi sai hướng hoàn toàn.
   */
  it("giải mã ký tự đã mã hóa URL trong mật khẩu và tên database", () => {
    const env = postgresToolEnv("postgresql://u:p%40ss%2Fword@localhost/t%C3%AAn");
    expect(env.PGPASSWORD).toBe("p@ss/word");
    expect(env.PGDATABASE).toBe("tên");
  });

  it("chuyển sslmode sang PGSSLMODE, không tự bịa khi URL không khai", () => {
    expect(postgresToolEnv("postgresql://localhost/x?sslmode=require").PGSSLMODE).toBe("require");
    expect(postgresToolEnv("postgresql://localhost/x").PGSSLMODE).toBeUndefined();
  });

  it("không có user/mật khẩu thì bỏ hẳn biến, không đặt chuỗi rỗng", () => {
    const env = postgresToolEnv("postgresql://localhost/x");
    expect("PGUSER" in env).toBe(false);
    expect("PGPASSWORD" in env).toBe(false);
  });

  /** URL SQLite cũ là lỗi dễ gặp nhất khi nâng cấp — thông báo phải chỉ đúng chỗ sửa. */
  it("URL SQLite cũ bị từ chối kèm chỉ dẫn", () => {
    expect(() => postgresToolEnv("file:./dev.db")).toThrow(/postgresql:\/\//);
  });

  it("thiếu tên database thì báo lỗi thay vì lặng lẽ nối vào database mặc định", () => {
    expect(() => postgresToolEnv("postgresql://u:p@localhost:5432/")).toThrow(/thiếu tên database/i);
  });

  it("URL rác bị từ chối", () => {
    expect(() => postgresToolEnv("không-phải-url")).toThrow(/URL hợp lệ/);
  });
});
