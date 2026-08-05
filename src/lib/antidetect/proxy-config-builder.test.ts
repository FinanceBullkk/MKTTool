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
  it("giải mã mật khẩu và dựng đủ cấu hình", () => {
    expect(buildProxyConfig(makeProxy())).toEqual({
      protocol: "http",
      host: "1.2.3.4",
      port: 8080,
      username: "user01",
      password: "mat-khau-proxy",
    });
  });

  it("nhận socks5", () => {
    expect(buildProxyConfig(makeProxy({ protocol: "socks5" })).protocol).toBe("socks5");
  });

  it("chấp nhận giao thức viết hoa", () => {
    expect(buildProxyConfig(makeProxy({ protocol: "SOCKS5" })).protocol).toBe("socks5");
  });

  it("giao thức lạ thì ném lỗi — thà không mở còn hơn mở sai IP", () => {
    expect(() => buildProxyConfig(makeProxy({ protocol: "STATIC_ISP" }))).toThrow(ProxyConfigError);
  });

  it("port ngoài khoảng hợp lệ thì ném lỗi", () => {
    expect(() => buildProxyConfig(makeProxy({ port: 0 }))).toThrow(ProxyConfigError);
    expect(() => buildProxyConfig(makeProxy({ port: 70000 }))).toThrow(ProxyConfigError);
  });

  it("host rỗng thì ném lỗi", () => {
    expect(() => buildProxyConfig(makeProxy({ host: "   " }))).toThrow(ProxyConfigError);
  });

  it("mật khẩu hỏng thì ném lỗi, KHÔNG trả về cấu hình thiếu mật khẩu", () => {
    const error = (() => {
      try {
        buildProxyConfig(makeProxy({ passwordEnc: "v1.rac.rac.rac" }));
      } catch (caught) {
        return caught as Error;
      }
    })();

    expect(error).toBeInstanceOf(ProxyConfigError);
    expect(error?.message).toContain("KHÔNG mở profile");
  });

  it("không nhét mật khẩu trần vào thông báo lỗi", () => {
    const error = (() => {
      try {
        buildProxyConfig(makeProxy({ protocol: "bậy" }));
      } catch (caught) {
        return caught as Error;
      }
    })();

    expect(error?.message).not.toContain("mat-khau-proxy");
  });
});
