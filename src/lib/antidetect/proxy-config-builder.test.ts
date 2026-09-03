import { randomBytes } from "node:crypto";
import { beforeAll, describe, expect, it } from "vitest";
import { encryptCredential } from "@/lib/crypto/credential-encryption";
import { loadVaultKey, resetVaultKeyCache } from "@/lib/crypto/encryption-key-loader";
import { ProxyConfigError, buildProxyConfig } from "./proxy-config-builder";

/** Khóa dùng riêng cho test — mật khẩu proxy thuộc vùng server, đọc từ env như lúc chạy thật. */
beforeAll(() => {
  process.env.VAULT_KEY_SERVER = randomBytes(32).toString("hex");
  resetVaultKeyCache();
});

function makeProxy(overrides: Partial<Parameters<typeof buildProxyConfig>[0]> = {}) {
  return {
    label: "reddit-01-us",
    host: "1.2.3.4",
    port: 8080,
    username: "user01",
    passwordEnc: encryptCredential("mat-khau-proxy", loadVaultKey("server")),
    protocol: "http",
    ...overrides,
  };
}

describe("buildProxyConfig", () => {
  it("decrypts the password and builds the complete configuration", () => {
    expect(buildProxyConfig(makeProxy())).toEqual({
      protocol: "http",
      host: "1.2.3.4",
      port: 8080,
      username: "user01",
      password: "mat-khau-proxy",
    });
  });

  it("accepts socks5", () => {
    expect(buildProxyConfig(makeProxy({ protocol: "socks5" })).protocol).toBe("socks5");
  });

  it("accepts an uppercase protocol", () => {
    expect(buildProxyConfig(makeProxy({ protocol: "SOCKS5" })).protocol).toBe("socks5");
  });

  it("rejects an unknown protocol rather than launching with the wrong IP", () => {
    expect(() => buildProxyConfig(makeProxy({ protocol: "STATIC_ISP" }))).toThrow(ProxyConfigError);
  });

  it("rejects a port outside the valid range", () => {
    expect(() => buildProxyConfig(makeProxy({ port: 0 }))).toThrow(ProxyConfigError);
    expect(() => buildProxyConfig(makeProxy({ port: 70000 }))).toThrow(ProxyConfigError);
  });

  it("rejects an empty host", () => {
    expect(() => buildProxyConfig(makeProxy({ host: "   " }))).toThrow(ProxyConfigError);
  });

  it("rejects a corrupt password instead of returning a configuration without it", () => {
    const error = (() => {
      try {
        buildProxyConfig(makeProxy({ passwordEnc: "v1.rac.rac.rac" }));
      } catch (caught) {
        return caught as Error;
      }
    })();

    expect(error).toBeInstanceOf(ProxyConfigError);
    expect(error?.message).toContain("The browser profile was not opened");
  });

  it("does not include the plaintext password in the error message", () => {
    const error = (() => {
      try {
        buildProxyConfig(makeProxy({ protocol: "invalid-protocol" }));
      } catch (caught) {
        return caught as Error;
      }
    })();

    expect(error?.message).not.toContain("mat-khau-proxy");
  });
});
