import { describe, expect, it } from "vitest";
import {
  BackupSourceError,
  REMOTE_DATABASE_URL_ENV,
  describeDatabaseTarget,
  resolveBackupSource,
} from "./backup-source";

const LOCAL = "postgresql://postgres:password@localhost:5432/mkttool_dev";
const REMOTE = "postgresql://postgres:password@shortline.proxy.rlwy.net:41234/railway?sslmode=require";

describe("resolveBackupSource", () => {
  it("reads DATABASE_URL for the local source", () => {
    expect(resolveBackupSource("local", { DATABASE_URL: LOCAL })).toEqual({
      kind: "local",
      databaseUrl: LOCAL,
      namePrefix: "mkttool",
    });
  });

  it("reads the dedicated remote variable and marks the filename as prod", () => {
    const source = resolveBackupSource("remote", { [REMOTE_DATABASE_URL_ENV]: REMOTE });

    expect(source.databaseUrl).toBe(REMOTE);
    // Dấu này là thứ duy nhất ngăn một bản của máy dev bị khôi phục nhầm lên máy chủ.
    expect(source.namePrefix).toBe("mkttool-prod");
  });

  /**
   * Nhánh quan trọng nhất: `--remote` mà lặng lẽ lùi về database máy mình sẽ dựng ra một file tên
   * `mkttool-prod-…` chứa dữ liệu thử — bản sao lưu nói dối, và chỉ lộ ra vào ngày cần tới nó.
   */
  it("THROWS when the remote variable is missing instead of falling back to DATABASE_URL", () => {
    expect(() => resolveBackupSource("remote", { DATABASE_URL: LOCAL })).toThrow(BackupSourceError);
    expect(() => resolveBackupSource("remote", { DATABASE_URL: LOCAL })).toThrow(
      new RegExp(REMOTE_DATABASE_URL_ENV),
    );
  });

  it("treats a whitespace-only variable as unset", () => {
    expect(() => resolveBackupSource("remote", { [REMOTE_DATABASE_URL_ENV]: "   " })).toThrow(
      BackupSourceError,
    );
    expect(() => resolveBackupSource("local", { DATABASE_URL: "  " })).toThrow(/DATABASE_URL/);
  });
});

describe("describeDatabaseTarget", () => {
  it("names the host and database", () => {
    expect(describeDatabaseTarget(REMOTE)).toBe("shortline.proxy.rlwy.net:41234/railway");
    expect(describeDatabaseTarget(LOCAL)).toBe("localhost:5432/mkttool_dev");
  });

  /** Câu này in ra màn hình và có thể lọt vào log — mật khẩu database là chìa vào cả kho. */
  it("NEVER exposes the password", () => {
    expect(describeDatabaseTarget(REMOTE)).not.toContain("password");
    expect(describeDatabaseTarget(LOCAL)).not.toContain("password");
  });

  it("returns safe text for an invalid URL without throwing or printing the raw value", () => {
    expect(describeDatabaseTarget("not-a-url")).toBe("(unreadable URL)");
  });
});
