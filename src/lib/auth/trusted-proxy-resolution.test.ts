import { getIPFromHeader } from "@better-auth/core/utils/ip";
import { describe, expect, it } from "vitest";
import { readTrustedProxyConfig } from "./trusted-proxy-config";

describe("Better Auth trusted forwarded-IP resolution", () => {
  it("accepts one validated address and rejects a multi-hop chain until edge CIDRs are known", () => {
    const single = readTrustedProxyConfig({});
    expect(getIPFromHeader("198.51.100.10", single)).toBe("198.51.100.10");
    expect(getIPFromHeader("198.51.100.10, 203.0.113.20", single)).toBeNull();
    expect(getIPFromHeader("not-an-ip", single)).toBeNull();
  });

  it("walks a configured chain from the right and never trusts a forged leftmost hop", () => {
    const configured = readTrustedProxyConfig({ TRUSTED_PROXY_CIDRS: "203.0.113.20" });
    expect(getIPFromHeader("198.51.100.10, 203.0.113.20", configured)).toBe("198.51.100.10");
    expect(getIPFromHeader("198.51.100.10, not-an-ip", configured)).toBeNull();
    expect(getIPFromHeader("198.51.100.10, 192.0.2.1", configured)).toBe("192.0.2.1");
  });

  it("normalizes IPv4-mapped addresses and applies the declared IPv6 subnet", () => {
    const config = readTrustedProxyConfig({ TRUSTED_PROXY_IPV6_SUBNET: "64" });
    expect(getIPFromHeader("::ffff:198.51.100.10", config)).toBe("198.51.100.10");
    expect(getIPFromHeader("2001:DB8::1", config)).toBe("2001:0db8:0000:0000:0000:0000:0000:0000");
  });
});

