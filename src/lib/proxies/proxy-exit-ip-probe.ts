/**
 * Hỏi "người ngoài nhìn thấy IP nào" — một lần đi qua proxy, một lần đi thẳng.
 *
 * Dùng HTTP THƯỜNG (không TLS) tới các dịch vụ tra cứu IP, cố ý:
 *  - proxy HTTP nhận thẳng request dạng tuyệt đối, không cần `CONNECT`, không cần bắt tay TLS;
 *  - thứ duy nhất gửi đi là `Proxy-Authorization`, mà nó chỉ tới đúng proxy vốn đã biết mật khẩu
 *    của chính nó. Không có credential nick nào đi qua đường này.
 *
 * Xin `HTTP/1.0` để phần thân không bao giờ bị chia khối (`chunked`) — nhờ vậy bộ đọc phản hồi
 * dưới đây chỉ cần "đọc tới khi đóng kết nối" thay vì phải hiểu thêm một tầng định dạng.
 *
 * Hỏng một nhà cung cấp thì đổi sang nhà kế tiếp (`proxy-ip-lookup-providers.ts`) — nhưng hỏng
 * ở tầng PROXY thì dừng ngay, vì đổi nhà cung cấp không cứu được một proxy đã chết.
 *
 * Cách mở đường (thẳng / proxy HTTP / SOCKS5) nằm ở `proxy-http-transport.ts`, dùng chung với
 * bộ đo băng thông.
 */
import net from "node:net";
import {
  type HttpTransport,
  ProxyProbeError,
  buildRequestHead,
  directTransport,
  parseHttpStatus,
  type ProxyEndpoint,
  proxyFaultForStatus,
  proxyTransport,
  toProbeFailure,
} from "./proxy-http-transport";
import { IP_LOOKUP_PROVIDERS, type IpLookupProvider } from "./proxy-ip-lookup-providers";

const LOOKUP_PORT = 80;

export const PROBE_TIMEOUT_MS = 10_000;

/**
 * `unreachable` = proxy hỏng → kết luận CHẾT.
 * `probe-failed` = bộ kiểm này hỏng, hoặc mọi dịch vụ tra cứu đều hỏng → KHÔNG KIỂM ĐƯỢC.
 *
 * Ranh giới này là thứ giữ cho công cụ không báo chết nhầm mỗi lần rớt mạng.
 */
export type ProbeOutcome =
  | { kind: "ok"; ip: string; country: string | null }
  | { kind: "unreachable"; detail: string }
  | { kind: "probe-failed"; detail: string };

export type ProbeProxyInput = ProxyEndpoint;

/** Gom toàn bộ phản hồi tới lúc đóng kết nối — hợp lệ vì đã xin HTTP/1.0. */
function readUntilClose(socket: net.Socket, timeoutMs: number): Promise<string> {
  return new Promise((resolve, reject) => {
    const chunks: Buffer[] = [];
    socket.setTimeout(timeoutMs);
    socket.on("data", (chunk: Buffer) => chunks.push(chunk));
    socket.once("end", () => resolve(Buffer.concat(chunks).toString("utf8")));
    socket.once("timeout", () => {
      socket.destroy();
      reject(
        new ProxyProbeError(
          `the complete response was not received within ${timeoutMs / 1000} seconds`,
          "unreachable",
        ),
      );
    });
    socket.once("error", (error: Error) => {
      reject(
        new ProxyProbeError(
          `the connection failed while reading the response (${error.message})`,
          "unreachable",
        ),
      );
    });
  });
}

function splitHttpResponse(raw: string, provider: IpLookupProvider): string {
  const separator = raw.indexOf("\r\n\r\n");
  if (separator === -1)
    throw new ProxyProbeError("the response is not valid HTTP", "probe-failed");

  const status = parseHttpStatus(raw.slice(0, separator));
  if (status !== 200) {
    const proxyFault = proxyFaultForStatus(status);
    if (proxyFault) throw new ProxyProbeError(proxyFault, "unreachable");
    // 403/429 hay gặp: dịch vụ tra cứu chặn dải IP datacenter. Lỗi của NHÀ CUNG CẤP,
    // không phải của proxy — nên chỉ đổi nhà, tuyệt đối không kết luận proxy đã chết.
    throw new ProxyProbeError(`${provider.host} returned HTTP ${status || "?"}`, "probe-failed");
  }
  return raw.slice(separator + 4);
}

async function askProvider(
  transport: HttpTransport,
  provider: IpLookupProvider,
  timeoutMs: number,
): Promise<{ ip: string; country: string | null }> {
  let socket: net.Socket | null = null;
  try {
    socket = await transport.open(provider.host, LOOKUP_PORT);
    socket.write(
      buildRequestHead(transport, provider.host, provider.path, [
        "Accept: application/json, text/plain, */*",
      ]),
    );

    const body = splitHttpResponse(await readUntilClose(socket, timeoutMs), provider);
    try {
      return provider.parse(body);
    } catch (error) {
      throw new ProxyProbeError(
        error instanceof Error ? error.message : `${provider.host} returned an unreadable response`,
        "probe-failed",
      );
    }
  } finally {
    socket?.destroy();
  }
}

/** Thử lần lượt từng dịch vụ tra cứu. Proxy hỏng thì dừng ngay — đổi nhà không cứu được. */
async function probeWithTransport(
  transport: HttpTransport,
  timeoutMs: number,
): Promise<ProbeOutcome> {
  const failures: string[] = [];

  for (const provider of IP_LOOKUP_PROVIDERS) {
    try {
      return { kind: "ok", ...(await askProvider(transport, provider, timeoutMs)) };
    } catch (error) {
      const outcome = toProbeFailure(error);
      if (outcome.kind === "unreachable") return outcome;
      failures.push(outcome.detail);
    }
  }

  return { kind: "probe-failed", detail: failures.join("; ") };
}

/** IP mà người ngoài nhìn thấy khi lưu lượng đi QUA proxy này. */
export function probeExitIpThroughProxy(
  proxy: ProbeProxyInput,
  timeoutMs: number = PROBE_TIMEOUT_MS,
): Promise<ProbeOutcome> {
  return probeWithTransport(proxyTransport(proxy, timeoutMs), timeoutMs);
}

/**
 * IP của chính máy này, KHÔNG qua proxy — mốc so để phát hiện proxy không đổi IP.
 *
 * Hỏng ở đây không bao giờ là lỗi của proxy, nên mọi kết quả xấu đều quy về `probe-failed`.
 */
export async function probeDirectExitIp(
  timeoutMs: number = PROBE_TIMEOUT_MS,
): Promise<ProbeOutcome> {
  const outcome = await probeWithTransport(directTransport(timeoutMs), timeoutMs);

  return outcome.kind === "unreachable" ? { kind: "probe-failed", detail: outcome.detail } : outcome;
}
