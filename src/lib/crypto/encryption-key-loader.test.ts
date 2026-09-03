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
  it("accepts a 64-character hex key", () => {
    expect(parseVaultKey(SERVER_HEX, "VAULT_KEY_SERVER")).toHaveLength(32);
  });

  it("rejects missing, incorrectly sized, or non-hex keys", () => {
    expect(() => parseVaultKey(undefined, "VAULT_KEY_SERVER")).toThrow(VaultKeyError);
    expect(() => parseVaultKey("", "VAULT_KEY_SERVER")).toThrow(/Missing VAULT_KEY_SERVER/);
    expect(() => parseVaultKey("abcd", "VAULT_KEY_SERVER")).toThrow(/64 hex characters/);
    expect(() => parseVaultKey("z".repeat(64), "VAULT_KEY_SERVER")).toThrow(
      /only hex characters/,
    );
  });

  it("names the source in errors so operators know which key is invalid", () => {
    expect(() => parseVaultKey("abcd", "--new-key")).toThrow(/--new-key must be exactly/);
  });
});

describe("loadVaultKey", () => {
  it("reads the correct environment variable for each domain", () => {
    process.env[VAULT_KEY_ENV.server] = SERVER_HEX;
    process.env[VAULT_KEY_ENV.operator] = OPERATOR_HEX;

    expect(loadVaultKey("server").toString("hex")).toBe(SERVER_HEX);
    expect(loadVaultKey("operator").toString("hex")).toBe(OPERATOR_HEX);
  });

  it("does not borrow another domain's key when one is missing", () => {
    process.env[VAULT_KEY_ENV.server] = SERVER_HEX;
    expect(() => loadVaultKey("operator")).toThrow(/Missing VAULT_KEY_OPERATOR/);
  });

  it("explains how to migrate when the legacy VAULT_KEY is still present", () => {
    process.env.VAULT_KEY = SERVER_HEX;

    expect(() => loadVaultKey("server")).toThrow(/VAULT_KEY is no longer read/);
    expect(() => loadVaultKey("server")).toThrow(/VAULT_KEY_OPERATOR="<current VAULT_KEY value>"/);
  });

  it("warns when both domains share one key", () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    process.env[VAULT_KEY_ENV.server] = SERVER_HEX;
    process.env[VAULT_KEY_ENV.operator] = SERVER_HEX;

    loadVaultKey("server");
    loadVaultKey("operator");

    expect(warn).toHaveBeenCalledTimes(1); // một lần mỗi tiến trình, không spam mỗi request
    expect(warn.mock.calls[0][0]).toMatch(/SAME key/);
  });

  it("does not warn when the domains use different keys", () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    process.env[VAULT_KEY_ENV.server] = SERVER_HEX;
    process.env[VAULT_KEY_ENV.operator] = OPERATOR_HEX;

    loadVaultKey("server");
    loadVaultKey("operator");

    expect(warn).not.toHaveBeenCalled();
  });

  it("caches keys and reads the environment again after resetVaultKeyCache", () => {
    process.env[VAULT_KEY_ENV.server] = SERVER_HEX;
    expect(loadVaultKey("server").toString("hex")).toBe(SERVER_HEX);

    process.env[VAULT_KEY_ENV.server] = OPERATOR_HEX;
    expect(loadVaultKey("server").toString("hex")).toBe(SERVER_HEX);

    resetVaultKeyCache();
    expect(loadVaultKey("server").toString("hex")).toBe(OPERATOR_HEX);
  });
});
