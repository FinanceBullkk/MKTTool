import { describe, expect, it } from "vitest";
import { readTrustedProxyConfig } from "./trusted-proxy-config";

describe("trusted proxy configuration", () => {
  it("defaults to Railway's single forwarded header without trusting a broad range", () => {
    expect(readTrustedProxyConfig({})).toEqual({
      ipAddressHeaders: ["x-forwarded-for"],
      trustedProxies: [],
      ipv6Subnet: 64,
    });
  });

  it("normalizes and de-duplicates explicit headers and CIDRs", () => {
    expect(
      readTrustedProxyConfig({
        TRUSTED_PROXY_IP_HEADERS: " X-Real-IP, x-forwarded-for, x-real-ip ",
        TRUSTED_PROXY_CIDRS: "203.0.113.10, 2001:db8::/32,203.0.113.10",
        TRUSTED_PROXY_IPV6_SUBNET: "56",
      }),
    ).toEqual({
      ipAddressHeaders: ["x-real-ip", "x-forwarded-for"],
      trustedProxies: ["203.0.113.10", "2001:db8::/32"],
      ipv6Subnet: 56,
    });
  });

  it("rejects malformed headers, ranges, and subnet values", () => {
    expect(() => readTrustedProxyConfig({ TRUSTED_PROXY_IP_HEADERS: "x forwarded for" })).toThrow(
      "header name",
    );
    expect(() => readTrustedProxyConfig({ TRUSTED_PROXY_CIDRS: "10.0.0.0/33" })).toThrow(
      "CIDR prefix",
    );
    expect(() => readTrustedProxyConfig({ TRUSTED_PROXY_IPV6_SUBNET: "129" })).toThrow(
      "0 to 128",
    );
  });
});
