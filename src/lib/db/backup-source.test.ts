import { describe, expect, it } from "vitest";
import {
  BackupSourceError,
  REMOTE_DATABASE_URL_ENV,
  describeDatabaseTarget,
  resolveBackupSource,
} from "./backup-source";

const LOCAL = "postgresql://postgres:matkhau@localhost:5432/mkttool_dev";
const REMOTE = "postgresql://postgres:matkhau@shortline.proxy.rlwy.net:41234/railway?sslmode=require";

describe("resolveBackupSource", () => {
  it("nguồn local đọc DATABASE_URL", () => {
    expect(resolveBackupSource("local", { DATABASE_URL: LOCAL })).toEqual({
      kind: "local",
      databaseUrl: LOCAL,
      namePrefix: "mkttool",
    });
  });

  it("nguồn remote đọc biến riêng, và tên file mang dấu prod", () => {
    const source = resolveBackupSource("remote", { [REMOTE_DATABASE_URL_ENV]: REMOTE });

    expect(source.databaseUrl).toBe(REMOTE);
    // Dấu này là thứ duy nhất ngăn một bản của máy dev bị khôi phục nhầm lên máy chủ.
    expect(source.namePrefix).toBe("mkttool-prod");
  });

  /**
   * Nhánh quan trọng nhất: `--remote` mà lặng lẽ lùi về database máy mình sẽ dựng ra một file tên
   * `mkttool-prod-…` chứa dữ liệu thử — bản sao lưu nói dối, và chỉ lộ ra vào ngày cần tới nó.
   */
  it("thiếu biến remote thì NÉM LỖI, không lùi về DATABASE_URL", () => {
    expect(() => resolveBackupSource("remote", { DATABASE_URL: LOCAL })).toThrow(BackupSourceError);
    expect(() => resolveBackupSource("remote", { DATABASE_URL: LOCAL })).toThrow(
      new RegExp(REMOTE_DATABASE_URL_ENV),
    );
  });

  it("biến chỉ có khoảng trắng tính là chưa khai", () => {
    expect(() => resolveBackupSource("remote", { [REMOTE_DATABASE_URL_ENV]: "   " })).toThrow(
      BackupSourceError,
    );
    expect(() => resolveBackupSource("local", { DATABASE_URL: "  " })).toThrow(/DATABASE_URL/);
  });
});

describe("describeDatabaseTarget", () => {
  it("nói rõ host và tên database", () => {
    expect(describeDatabaseTarget(REMOTE)).toBe("shortline.proxy.rlwy.net:41234/railway");
    expect(describeDatabaseTarget(LOCAL)).toBe("localhost:5432/mkttool_dev");
  });

  /** Câu này in ra màn hình và có thể lọt vào log — mật khẩu database là chìa vào cả kho. */
  it("KHÔNG bao giờ để lộ mật khẩu", () => {
    expect(describeDatabaseTarget(REMOTE)).not.toContain("matkhau");
    expect(describeDatabaseTarget(LOCAL)).not.toContain("matkhau");
  });

  it("URL hỏng thì trả câu vô hại, không ném lỗi và không in nguyên chuỗi", () => {
    expect(describeDatabaseTarget("khong-phai-url")).toBe("(URL không đọc được)");
  });
});
