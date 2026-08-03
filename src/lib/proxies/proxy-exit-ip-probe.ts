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
 */
import net from "node:net";
import { Socks5Error, openSocks5Tunnel } from "./proxy-socks5-tunnel";
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

export interface ProbeProxyInput {
  host: string;
  port: number;
  username: string;
  password: string;
  /** http | socks5 */
  protocol: string;
}

class ProbeError extends Error {
  constructor(
    message: string,
    readonly reason: "unreachable" | "probe-failed",
  ) {
    super(message);
    this.name = "ProbeError";
  }
}

function basicAuth(username: string, password: string): string {
  return `Basic ${Buffer.from(`${username}:${password}`).toString("base64")}`;
}

/** Mở TCP tới một địa chỉ bất kỳ, kèm timeout và câu lỗi tiếng Việt. */
function connectTcp(host: string, port: number, timeoutMs: number): Promise<net.Socket> {
  return new Promise((resolve, reject) => {
    const socket = net.connect({ host, port });
    socket.setTimeout(timeoutMs);

    const cleanup = () => {
      socket.off("connect", onConnect);
      socket.off("error", onError);
      socket.off("timeout", onTimeout);
    };
    const onConnect = () => {
      cleanup();
      resolve(socket);
    };
    const onError = (error: Error) => {
      cleanup();
      socket.destroy();
      reject(new ProbeError(`không nối được tới ${host}:${port} (${error.message})`, "unreachable"));
    };
    const onTimeout = () => {
      cleanup();
      socket.destroy();
      reject(
        new ProbeError(
          `quá ${timeoutMs / 1000} giây không nối được tới ${host}:${port}`,
          "unreachable",
        ),
      );
    };

    socket.once("connect", onConnect);
    socket.once("error", onError);
    socket.once("timeout", onTimeout);
  });
}

/** Gom toàn bộ phản hồi tới lúc đóng kết nối — hợp lệ vì đã xin HTTP/1.0. */
function readUntilClose(socket: net.Socket, timeoutMs: number): Promise<string> {
  return new Promise((resolve, reject) => {
    const chunks: Buffer[] = [];
    socket.setTimeout(timeoutMs);
    socket.on("data", (chunk: Buffer) => chunks.push(chunk));
    socket.once("end", () => resolve(Buffer.concat(chunks).toString("utf8")));
    socket.once("timeout", () => {
      socket.destroy();
      reject(new ProbeError(`quá ${timeoutMs / 1000} giây không nhận đủ phản hồi`, "unreachable"));
    });
    socket.once("error", (error: Error) => {
      reject(new ProbeError(`đứt kết nối khi đang đọc phản hồi (${error.message})`, "unreachable"));
    });
  });
}

/** Mã trạng thái do CHÍNH PROXY sinh ra — nghĩa là proxy hỏng, không phải dịch vụ tra cứu hỏng. */
const PROXY_FAULT_STATUS: Record<number, string> = {
  407: "proxy từ chối xác thực (sai user/mật khẩu?)",
  502: "proxy không ra được internet",
  503: "proxy đang quá tải hoặc ngừng phục vụ",
};

function splitHttpResponse(raw: string, provider: IpLookupProvider): string {
  const separator = raw.indexOf("\r\n\r\n");
  if (separator === -1) throw new ProbeError("phản hồi không đúng định dạng HTTP", "probe-failed");

  const status = Number(raw.slice(0, separator).split(/\r?\n/)[0]?.split(" ")[1]);
  if (status !== 200) {
    const proxyFault = PROXY_FAULT_STATUS[status];
    if (proxyFault) throw new ProbeError(proxyFault, "unreachable");
    // 403/429 hay gặp: dịch vụ tra cứu chặn dải IP datacenter. Lỗi của NHÀ CUNG CẤP,
    // không phải của proxy — nên chỉ đổi nhà, tuyệt đối không kết luận proxy đã chết.
    throw new ProbeError(`${provider.host} trả về HTTP ${status || "?"}`, "probe-failed");
  }
  return raw.slice(separator + 4);
}

/** Cách mở đường tới một dịch vụ tra cứu, khác nhau giữa đi thẳng / qua proxy HTTP / qua SOCKS5. */
interface Transport {
  open(provider: IpLookupProvider): Promise<net.Socket>;
  requestTarget(provider: IpLookupProvider): string;
  headers: string[];
}

async function askProvider(
  transport: Transport,
  provider: IpLookupProvider,
  timeoutMs: number,
): Promise<{ ip: string; country: string | null }> {
  let socket: net.Socket | null = null;
  try {
    socket = await transport.open(provider);
    const lines = [
      `GET ${transport.requestTarget(provider)} HTTP/1.0`,
      `Host: ${provider.host}`,
      "Accept: application/json, text/plain, */*",
      ...transport.headers,
      "Connection: close",
      "",
      "",
    ];
    socket.write(lines.join("\r\n"));

    const body = splitHttpResponse(await readUntilClose(socket, timeoutMs), provider);
    try {
      return provider.parse(body);
    } catch (error) {
      throw new ProbeError(
        error instanceof Error ? error.message : `${provider.host} trả về thứ không đọc được`,
        "probe-failed",
      );
    }
  } finally {
    socket?.destroy();
  }
}

function toOutcome(error: unknown): { kind: "unreachable" | "probe-failed"; detail: string } {
  if (error instanceof ProbeError) return { kind: error.reason, detail: error.message };
  if (error instanceof Socks5Error) {
    return {
      kind: error.reason === "unreachable" ? "unreachable" : "probe-failed",
      detail: error.message,
    };
  }
  return {
    kind: "probe-failed",
    detail: error instanceof Error ? error.message : "lỗi không xác định",
  };
}

/** Thử lần lượt từng dịch vụ tra cứu. Proxy hỏng thì dừng ngay — đổi nhà không cứu được. */
async function probeWithTransport(transport: Transport, timeoutMs: number): Promise<ProbeOutcome> {
  const failures: string[] = [];

  for (const provider of IP_LOOKUP_PROVIDERS) {
    try {
      return { kind: "ok", ...(await askProvider(transport, provider, timeoutMs)) };
    } catch (error) {
      const outcome = toOutcome(error);
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
  if (proxy.protocol === "socks5") {
    return probeWithTransport(
      {
        open: (provider) =>
          openSocks5Tunnel({
            proxyHost: proxy.host,
            proxyPort: proxy.port,
            username: proxy.username,
            password: proxy.password,
            destHost: provider.host,
            destPort: LOOKUP_PORT,
            timeoutMs,
          }),
        // Qua SOCKS5 thì socket đã nối thẳng tới đích — dùng đường dẫn thường như đi trực tiếp.
        requestTarget: (provider) => provider.path,
        headers: [],
      },
      timeoutMs,
    );
  }

  return probeWithTransport(
    {
      open: () => connectTcp(proxy.host, proxy.port, timeoutMs),
      // Proxy HTTP đòi URL tuyệt đối để biết chuyển tiếp đi đâu.
      requestTarget: (provider) => `http://${provider.host}${provider.path}`,
      headers: [`Proxy-Authorization: ${basicAuth(proxy.username, proxy.password)}`],
    },
    timeoutMs,
  );
}

/**
 * IP của chính máy này, KHÔNG qua proxy — mốc so để phát hiện proxy không đổi IP.
 *
 * Hỏng ở đây không bao giờ là lỗi của proxy, nên mọi kết quả xấu đều quy về `probe-failed`.
 */
export async function probeDirectExitIp(
  timeoutMs: number = PROBE_TIMEOUT_MS,
): Promise<ProbeOutcome> {
  const outcome = await probeWithTransport(
    {
      open: (provider) => connectTcp(provider.host, LOOKUP_PORT, timeoutMs),
      requestTarget: (provider) => provider.path,
      headers: [],
    },
    timeoutMs,
  );

  return outcome.kind === "unreachable" ? { kind: "probe-failed", detail: outcome.detail } : outcome;
}
