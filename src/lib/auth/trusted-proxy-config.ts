import net from "node:net";

const DEFAULT_HEADERS = ["x-forwarded-for"];
const HEADER_NAME = /^[a-z0-9][a-z0-9-]*$/;
const CIDR_PREFIX = /^\d+$/;

export interface TrustedProxyConfig {
  /** Header order passed to Better Auth's client-IP resolver. */
  ipAddressHeaders: string[];
  /** Exact proxy addresses/ranges observed at the deployment edge. */
  trustedProxies: string[];
  ipv6Subnet: number;
}

/**
 * Read the proxy boundary without ever falling back to a broad private range.
 *
 * Railway normally emits one `x-forwarded-for` value. A multi-hop chain is
 * only accepted when the operator has supplied the exact edge addresses in
 * `TRUSTED_PROXY_CIDRS`; Better Auth then walks the chain right-to-left and
 * rejects malformed/spoofed hops. Values are intentionally env-backed so a
 * platform migration cannot silently inherit a stale proxy list.
 */
export function readTrustedProxyConfig(
  env: Partial<Record<string, string>> = process.env,
): TrustedProxyConfig {
  const headers = parseList(env.TRUSTED_PROXY_IP_HEADERS, "TRUSTED_PROXY_IP_HEADERS");
  const trustedProxies = parseCidrs(env.TRUSTED_PROXY_CIDRS, "TRUSTED_PROXY_CIDRS");
  const subnetText = env.TRUSTED_PROXY_IPV6_SUBNET?.trim();
  const ipv6Subnet = subnetText ? Number(subnetText) : 64;
  if (!Number.isInteger(ipv6Subnet) || ipv6Subnet < 0 || ipv6Subnet > 128) {
    throw new Error("TRUSTED_PROXY_IPV6_SUBNET must be an integer from 0 to 128.");
  }

  return {
    ipAddressHeaders: headers.length > 0 ? headers : DEFAULT_HEADERS,
    trustedProxies,
    ipv6Subnet,
  };
}

function parseList(raw: string | undefined, name: string): string[] {
  if (!raw?.trim()) return [];
  const values = raw
    .split(",")
    .map((value) => value.trim().toLowerCase())
    .filter(Boolean);
  if (values.some((value) => !HEADER_NAME.test(value))) {
    throw new Error(`${name} contains an invalid header name.`);
  }
  return [...new Set(values)];
}

function parseCidrs(raw: string | undefined, name: string): string[] {
  if (!raw?.trim()) return [];
  const values = raw
    .split(",")
    .map((value) => value.trim())
    .filter(Boolean);
  for (const value of values) {
    const slash = value.lastIndexOf("/");
    const address = slash === -1 ? value : value.slice(0, slash);
    const family = net.isIP(address);
    if (family === 0) throw new Error(`${name} contains an invalid IP address.`);
    if (slash !== -1) {
      const prefix = value.slice(slash + 1);
      const max = family === 4 ? 32 : 128;
      if (!CIDR_PREFIX.test(prefix) || Number(prefix) > max) {
        throw new Error(`${name} contains an invalid CIDR prefix.`);
      }
    }
  }
  return [...new Set(values)];
}

