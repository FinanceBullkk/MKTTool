import { randomBytes } from "node:crypto";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  VAULT_KEY_ENV,
  VaultKeyError,
  loadVaultKey,
  parseVaultKey,
  resetVaultKeyCache,
} from "./encryption-key-loader";

const SERVER_HEX = randomBytes(32).toString("hex");
const OPERATOR_HEX = randomBytes(32).toString("hex");

/**
 * Bộ nạp khóa đọc thẳng process.env nên test phải tự dọn: giá trị sót lại từ một bài test
 * trước sẽ làm bài sau xanh vì lý do sai.
 */
const TOUCHED = [VAULT_KEY_ENV.server, VAULT_KEY_ENV.operator, "VAULT_KEY"];
let saved: Record<string, string | undefined> = {};

beforeEach(() => {
  saved = Object.fromEntries(TOUCHED.map((name) => [name, process.env[name]]));
  for (const name of TOUCHED) delete process.env[name];
  resetVaultKeyCache();
});

afterEach(() => {
  for (const name of TOUCHED) {
    if (saved[name] === undefined) delete process.env[name];
    else process.env[name] = saved[name];
  }
  resetVaultKeyCache();
  vi.restoreAllMocks();
});

describe("parseVaultKey", () => {
  it("chấp nhận khóa hex 64 ký tự", () => {
    expect(parseVaultKey(SERVER_HEX, "VAULT_KEY_SERVER")).toHaveLength(32);
  });

  it("từ chối khóa thiếu, sai độ dài, hoặc không phải hex", () => {
    expect(() => parseVaultKey(undefined, "VAULT_KEY_SERVER")).toThrow(VaultKeyError);
    expect(() => parseVaultKey("", "VAULT_KEY_SERVER")).toThrow(/Thiếu VAULT_KEY_SERVER/);
    expect(() => parseVaultKey("abcd", "VAULT_KEY_SERVER")).toThrow(/64 ký tự hex/);
    expect(() => parseVaultKey("z".repeat(64), "VAULT_KEY_SERVER")).toThrow(
      /chỉ được chứa ký tự hex/,
    );
  });

  it("nói tên nguồn trong lỗi — hai khóa thì phải biết khóa nào sai", () => {
    expect(() => parseVaultKey("abcd", "--new-key")).toThrow(/--new-key phải dài/);
  });
});

describe("loadVaultKey", () => {
  it("đọc đúng biến môi trường của từng vùng", () => {
    process.env[VAULT_KEY_ENV.server] = SERVER_HEX;
    process.env[VAULT_KEY_ENV.operator] = OPERATOR_HEX;

    expect(loadVaultKey("server").toString("hex")).toBe(SERVER_HEX);
    expect(loadVaultKey("operator").toString("hex")).toBe(OPERATOR_HEX);
  });

  it("thiếu khóa vùng này thì không mượn khóa vùng kia", () => {
    process.env[VAULT_KEY_ENV.server] = SERVER_HEX;
    expect(() => loadVaultKey("operator")).toThrow(/Thiếu VAULT_KEY_OPERATOR/);
  });

  it("còn VAULT_KEY cũ thì nói thẳng phải đặt cả hai biến mới bằng giá trị đó", () => {
    process.env.VAULT_KEY = SERVER_HEX;

    expect(() => loadVaultKey("server")).toThrow(/VAULT_KEY không còn được đọc nữa/);
    expect(() => loadVaultKey("server")).toThrow(/VAULT_KEY_OPERATOR="<giá trị VAULT_KEY hiện tại>"/);
  });

  it("cảnh báo khi hai vùng dùng chung một khóa — cấu hình nhìn y hệt lúc đã tách xong", () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    process.env[VAULT_KEY_ENV.server] = SERVER_HEX;
    process.env[VAULT_KEY_ENV.operator] = SERVER_HEX;

    loadVaultKey("server");
    loadVaultKey("operator");

    expect(warn).toHaveBeenCalledTimes(1); // một lần mỗi tiến trình, không spam mỗi request
    expect(warn.mock.calls[0][0]).toMatch(/CÙNG một khóa/);
  });

  it("hai khóa khác nhau thì không cảnh báo gì", () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    process.env[VAULT_KEY_ENV.server] = SERVER_HEX;
    process.env[VAULT_KEY_ENV.operator] = OPERATOR_HEX;

    loadVaultKey("server");
    loadVaultKey("operator");

    expect(warn).not.toHaveBeenCalled();
  });

  it("cache khóa, và resetVaultKeyCache trả về đọc lại từ env", () => {
    process.env[VAULT_KEY_ENV.server] = SERVER_HEX;
    expect(loadVaultKey("server").toString("hex")).toBe(SERVER_HEX);

    process.env[VAULT_KEY_ENV.server] = OPERATOR_HEX;
    expect(loadVaultKey("server").toString("hex")).toBe(SERVER_HEX);

    resetVaultKeyCache();
    expect(loadVaultKey("server").toString("hex")).toBe(OPERATOR_HEX);
  });
});
