/**
 * Chuyển bản ghi Proxy trong database thành cấu hình đẩy sang antidetect browser.
 *
 * Tách khỏi route để việc giải mã mật khẩu có chỗ kiểm thử riêng, và để chỗ duy nhất
 * biết mật khẩu proxy dạng trần nằm gọn trong một file ngắn.
 */
import type { AntidetectProxyConfig } from "./antidetect-browser-adapter";
import { decryptCredential } from "@/lib/crypto/credential-encryption";
import { loadVaultKey } from "@/lib/crypto/encryption-key-loader";

/** Phần bản ghi Proxy cần dùng — nhận cả object Prisma đầy đủ lẫn object rút gọn trong test. */
export interface ProxyRecordForLaunch {
  label: string;
  host: string;
  port: number;
  username: string;
  passwordEnc: string;
  protocol: string;
}

export class ProxyConfigError extends Error {
  constructor(message: string, options?: { cause?: unknown }) {
    super(message, options);
    this.name = "ProxyConfigError";
  }
}

/**
 * Dựng cấu hình proxy, giải mã mật khẩu.
 *
 * Ném lỗi thay vì trả về cấu hình thiếu: mọi đường thất bại ở đây đều phải chặn việc
 * mở profile, vì profile không có proxy sẽ chạy thẳng bằng IP nhà.
 */
export function buildProxyConfig(proxy: ProxyRecordForLaunch): AntidetectProxyConfig {
  const protocol = proxy.protocol?.toLowerCase();
  if (protocol !== "http" && protocol !== "socks5") {
    throw new ProxyConfigError(
      `Proxy "${proxy.label}" uses the invalid protocol "${proxy.protocol}". ` +
        `Only "http" and "socks5" are supported; correct it on /proxies before opening the browser profile.`,
    );
  }

  if (!proxy.host?.trim()) {
    throw new ProxyConfigError(
      `Proxy "${proxy.label}" has no host. Add the host on /proxies before opening the browser profile.`,
    );
  }
  if (!Number.isInteger(proxy.port) || proxy.port < 1 || proxy.port > 65535) {
    throw new ProxyConfigError(
      `Proxy "${proxy.label}" uses the invalid port "${proxy.port}". Correct it on /proxies before opening the browser profile.`,
    );
  }

  let password: string;
  try {
    password = decryptCredential(proxy.passwordEnc, loadVaultKey("server"));
  } catch (cause) {
    // Không kèm chi tiết kỹ thuật vào thông báo cho người dùng cuối, nhưng phải nói rõ
    // hậu quả: không giải mã được thì không đẩy được proxy, nên không được mở profile.
    throw new ProxyConfigError(
      `The password for proxy "${proxy.label}" could not be decrypted because VAULT_KEY_SERVER ` +
        `is incorrect or the stored data is damaged. The browser profile was not opened because ` +
        `its proxy could not be applied. Restore the key or proxy record, then try again.`,
      { cause },
    );
  }

  return {
    protocol,
    host: proxy.host.trim(),
    port: proxy.port,
    username: proxy.username || undefined,
    password: password || undefined,
  };
}
