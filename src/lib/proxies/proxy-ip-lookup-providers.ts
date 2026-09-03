/**
 * Danh sách nơi đi hỏi "IP của tôi là gì", theo thứ tự ưu tiên.
 *
 * Vì sao cần nhiều hơn một: đo thật ngày 04/08/2026 trên 10 proxy Webshare, ipinfo.io trả
 * **429 cho hai IP và 403 cho một IP** — lặp lại y hệt ở lượt sau, nên không phải giới hạn
 * tần suất tạm thời mà là chặn theo IP. Proxy datacenter dùng chung nhiều người rất hay
 * nằm trong danh sách chặn của các dịch vụ tra cứu.
 *
 * Một nhà cung cấp duy nhất nghĩa là 3/10 proxy vĩnh viễn không đo được — mà "không đo được"
 * đúng ra phải là ngoại lệ hiếm, không phải trạng thái thường trực của một phần ba đàn.
 *
 * Tất cả đều là HTTP thường: xem chú thích đầu `proxy-exit-ip-probe.ts`.
 */

export interface IpLookupResult {
  ip: string;
  /** Mã quốc gia 2 ký tự, null nếu nhà cung cấp không trả về. */
  country: string | null;
}

export interface IpLookupProvider {
  host: string;
  path: string;
  /** Ném `Error` khi phần thân không đọc được — bên gọi đổi sang nhà cung cấp kế tiếp. */
  parse(body: string): IpLookupResult;
}

function requireIp(value: unknown, providerName: string): string {
  if (typeof value !== "string" || value.trim() === "") {
    throw new Error(`${providerName} did not return an IP address`);
  }
  return value.trim();
}

function parseJsonBody(body: string, providerName: string): Record<string, unknown> {
  try {
    return JSON.parse(body) as Record<string, unknown>;
  } catch {
    throw new Error(`${providerName} returned a response that is not JSON`);
  }
}

export const IP_LOOKUP_PROVIDERS: IpLookupProvider[] = [
  {
    host: "ipinfo.io",
    path: "/json",
    parse(body) {
      const data = parseJsonBody(body, "ipinfo.io");
      return {
        ip: requireIp(data.ip, "ipinfo.io"),
        country: typeof data.country === "string" ? data.country : null,
      };
    },
  },
  {
    host: "ip-api.com",
    path: "/json",
    parse(body) {
      const data = parseJsonBody(body, "ip-api.com");
      // Nhà này trả HTTP 200 kèm `status: "fail"` chứ không dùng mã lỗi — không đọc trường
      // đó thì một lượt hỏng sẽ đi tiếp thành "thiếu IP" với câu lỗi sai chỗ.
      if (data.status !== "success") {
        throw new Error(`ip-api.com rejected the request: ${String(data.message ?? "unknown reason")}`);
      }
      return {
        ip: requireIp(data.query, "ip-api.com"),
        country: typeof data.countryCode === "string" ? data.countryCode : null,
      };
    },
  },
  {
    // Chốt chặn cuối: chỉ trả về một dòng IP, không có quốc gia. Đo được IP vẫn đủ cho phép
    // so quan trọng nhất (proxy có đổi IP không); phép so quốc gia thì chịu bỏ.
    host: "icanhazip.com",
    path: "/",
    parse(body) {
      return { ip: requireIp(body.trim(), "icanhazip.com"), country: null };
    },
  },
];
