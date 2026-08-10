/**
 * Soi ruột vé sau khi đã giải mã.
 *
 * ## Vì sao phải soi, khi ruột đã mã hóa và đã ký
 *
 * Chữ ký chứng minh **máy chủ phát tấm vé này**, không chứng minh **máy chủ và cầu nối hiểu
 * cùng một hình dạng**. Hai chương trình viết rời, đóng gói rời, và cầu nối **không tự cập
 * nhật** (QĐ 11) — nên một bản `.exe` từ tháng trước sẽ gặp ruột vé của tháng này. Ép kiểu
 * `payload as TicketPayload` ở đó là nói dối, và hậu quả là một `undefined` đi tiếp vài lớp
 * rồi đổ ở chỗ chẳng liên quan gì.
 *
 * `verifyTicket` cố ý trả `unknown` để bắt buộc bước này. File này là chỗ duy nhất biến
 * `unknown` đó thành kiểu dùng được.
 *
 * ## Không kéo zod vào
 *
 * Web app có zod, nhưng đây là `.exe` 87 MB tải tay qua remote desktop, và ba hình dạng cần
 * soi đều phẳng. Ba hàm gác nhỏ rẻ hơn một thư viện.
 */
import type { AntidetectProxyConfig } from "../../src/lib/antidetect/antidetect-browser-adapter";
import {
  TICKET_KINDS,
  type CredentialField,
  type TicketPayload,
} from "../../src/lib/tickets/ticket-types";

export class TicketPayloadError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "TicketPayloadError";
  }
}

function asRecord(value: unknown): Record<string, unknown> {
  if (typeof value !== "object" || value === null) {
    throw new TicketPayloadError("Ruột vé không phải một object.");
  }
  return value as Record<string, unknown>;
}

/** Chuỗi bắt buộc, không rỗng. Tên trường đi vào câu lỗi vì đó là thứ duy nhất chỉ được chỗ sai. */
function requireString(source: Record<string, unknown>, field: string): string {
  const value = source[field];
  if (typeof value !== "string" || value.trim() === "") {
    throw new TicketPayloadError(
      `Ruột vé thiếu "${field}". Máy chủ và cầu nối nhiều khả năng đang lệch phiên bản — tải lại cầu nối từ web app.`,
    );
  }
  return value;
}

/**
 * Cấu hình proxy trong vé.
 *
 * Trả thẳng `AntidetectProxyConfig` — kiểu mà adapter nhận — chứ không một kiểu song song trông
 * giống nó: mỗi bước ánh xạ giữa hai chương trình viết rời là một chỗ lệch được, và
 * `ticket-types.ts` đã khai hình dạng này khớp đúng adapter với chính lý do đó.
 */
function reviewProxy(value: unknown): AntidetectProxyConfig {
  const proxy = asRecord(value);
  const protocol = proxy.protocol;

  if (protocol !== "http" && protocol !== "socks5") {
    throw new TicketPayloadError(`Proxy trong vé khai giao thức lạ: ${String(protocol)}.`);
  }

  const port = proxy.port;
  if (typeof port !== "number" || !Number.isInteger(port) || port <= 0 || port > 65535) {
    throw new TicketPayloadError(`Proxy trong vé khai cổng không hợp lệ: ${String(port)}.`);
  }

  return {
    protocol,
    host: requireString(proxy, "host"),
    port,
    // Proxy không cần đăng nhập là chuyện thường — thiếu hai trường này không phải lỗi.
    username: typeof proxy.username === "string" ? proxy.username : undefined,
    password: typeof proxy.password === "string" ? proxy.password : undefined,
  };
}

/**
 * Vân tay trong vé tạo profile.
 *
 * Validate the **shape**, not the semantics. MKT Browser can answer questions such as whether a
 * timezone belongs to a locale more accurately: it rejects contradictory combinations and lists
 * valid values. Duplicating that lookup here would create a stale copy as soon as a locale is
 * added, which could incorrectly block valid combinations.
 */
function reviewFingerprint(value: unknown): {
  device: string;
  localeId: string;
  timezone: string;
  screen: { width: number; height: number };
} {
  const fingerprint = asRecord(value);
  const screen = asRecord(fingerprint.screen);

  const width = screen.width;
  const height = screen.height;
  if (
    typeof width !== "number" ||
    typeof height !== "number" ||
    !Number.isInteger(width) ||
    !Number.isInteger(height) ||
    width <= 0 ||
    height <= 0
  ) {
    throw new TicketPayloadError(
      `Vân tay trong vé khai kích thước màn hình không hợp lệ: ${String(width)}×${String(height)}.`,
    );
  }

  return {
    device: requireString(fingerprint, "device"),
    localeId: requireString(fingerprint, "localeId"),
    timezone: requireString(fingerprint, "timezone"),
    screen: { width, height },
  };
}

/**
 * Soi ruột vé theo `kind` lấy từ **bao ngoài đã được ký**.
 *
 * `kind` truyền vào chứ không đọc từ ruột: bao ngoài đã qua chữ ký, còn ruột thì mới ra khỏi
 * lớp mã hóa. Hai chỗ khai `kind` mà lệch nhau thì tin chỗ đã được ký.
 */
export function reviewTicketPayload(kind: string, payload: unknown): TicketPayload {
  const source = asRecord(payload);

  switch (kind) {
    case TICKET_KINDS.CREDENTIAL: {
      const field = requireString(source, "field");
      if (field !== "password" && field !== "emailPassword") {
        throw new TicketPayloadError(`Vé hỏi một loại bí mật lạ: ${field}.`);
      }
      return {
        kind: TICKET_KINDS.CREDENTIAL,
        accountId: requireString(source, "accountId"),
        field: field as CredentialField,
        credentialCiphertext: requireString(source, "credentialCiphertext"),
      };
    }

    case TICKET_KINDS.OTP:
      return {
        kind: TICKET_KINDS.OTP,
        accountId: requireString(source, "accountId"),
        totpSecretCiphertext: requireString(source, "totpSecretCiphertext"),
      };

    case TICKET_KINDS.LAUNCH_PROFILE:
      return {
        kind: TICKET_KINDS.LAUNCH_PROFILE,
        accountId: requireString(source, "accountId"),
        antidetectProfileId: requireString(source, "antidetectProfileId"),
        proxyLabel: requireString(source, "proxyLabel"),
        proxy: reviewProxy(source.proxy),
      };

    case TICKET_KINDS.CREATE_PROFILE:
      return {
        kind: TICKET_KINDS.CREATE_PROFILE,
        accountId: requireString(source, "accountId"),
        profileName: requireString(source, "profileName"),
        proxy: reviewProxy(source.proxy),
        fingerprint: reviewFingerprint(source.fingerprint),
        seed: requireString(source, "seed"),
      };

    default:
      throw new TicketPayloadError(
        `Bản cầu nối này không biết loại vé "${kind}". Tải lại cầu nối từ web app.`,
      );
  }
}
