/**
 * Ba cách mở một kết nối HTTP tới cùng một đích: đi thẳng, qua proxy HTTP, qua SOCKS5.
 *
 * Tách ra khỏi `proxy-exit-ip-probe.ts` khi bộ đo băng thông ra đời: hai phép đo khác nhau
 * (hỏi IP ra / tải file) nhưng đường đi thì y hệt. Chép `connectTcp` và cách ghép
 * `Proxy-Authorization` ra hai bản là hai chỗ để lệch nhau, mà lệch ở đây nghĩa là một proxy
 * đo được ở phép này lại "không nối được" ở phép kia — người dùng không có cách nào biết bản
 * nào đúng.
 *
 * Tất cả đều là HTTP thường (cổng 80), cố ý — xem chú thích đầu `proxy-exit-ip-probe.ts`.
 */
import net from "node:net";
import { Socks5Error, openSocks5Tunnel } from "./proxy-socks5-tunnel";

/**
 * `unreachable` = proxy hỏng → được phép kết luận CHẾT.
 * `probe-failed` = bộ đo hỏng, hoặc nhà cung cấp bên kia hỏng → KHÔNG ĐO ĐƯỢC.
 *
 * Ranh giới này là thứ giữ cho công cụ không báo chết nhầm mỗi lần rớt mạng.
 */
export class ProxyProbeError extends Error {
  constructor(
    message: string,
    readonly reason: "unreachable" | "probe-failed",
  ) {
    super(message);
    this.name = "ProxyProbeError";
  }
}

export interface ProxyEndpoint {
  host: string;
  port: number;
  username: string;
  password: string;
  /** http | socks5 */
  protocol: string;
}

/**
 * Cách mở đường tới một máy chủ HTTP bất kỳ.
 *
 * `requestTarget` khác nhau giữa hai loại proxy: proxy HTTP đòi URL tuyệt đối để biết chuyển
 * tiếp đi đâu, còn qua SOCKS5 thì socket đã nối thẳng tới đích nên dùng đường dẫn thường.
 */
export interface HttpTransport {
  open(destHost: string, destPort: number): Promise<net.Socket>;
  requestTarget(destHost: string, path: string): string;
  headers: string[];
}

function basicAuth(username: string, password: string): string {
  return `Basic ${Buffer.from(`${username}:${password}`).toString("base64")}`;
}

/** Mở TCP tới một địa chỉ bất kỳ, kèm timeout và câu lỗi tiếng Việt. */
export function connectTcp(host: string, port: number, timeoutMs: number): Promise<net.Socket> {
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
      reject(
        new ProxyProbeError(`không nối được tới ${host}:${port} (${error.message})`, "unreachable"),
      );
    };
    const onTimeout = () => {
      cleanup();
      socket.destroy();
      reject(
        new ProxyProbeError(
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

/** Đi thẳng, không qua proxy — mốc so của mọi phép đo. */
export function directTransport(timeoutMs: number): HttpTransport {
  return {
    open: (destHost, destPort) => connectTcp(destHost, destPort, timeoutMs),
    requestTarget: (_destHost, path) => path,
    headers: [],
  };
}

/**
 * Đi qua proxy. Chọn cách bắt tay theo `protocol` của bản ghi proxy — điền sai giao thức
 * ở đây cũng là điền sai lúc mở trình duyệt, nên sai thì phải lộ ra ngay ở lượt đo.
 */
export function proxyTransport(proxy: ProxyEndpoint, timeoutMs: number): HttpTransport {
  if (proxy.protocol?.toLowerCase() === "socks5") {
    return {
      open: (destHost, destPort) =>
        openSocks5Tunnel({
          proxyHost: proxy.host,
          proxyPort: proxy.port,
          username: proxy.username,
          password: proxy.password,
          destHost,
          destPort,
          timeoutMs,
        }),
      requestTarget: (_destHost, path) => path,
      headers: [],
    };
  }

  return {
    open: () => connectTcp(proxy.host, proxy.port, timeoutMs),
    requestTarget: (destHost, path) => `http://${destHost}${path}`,
    // Chỉ `Proxy-Authorization` đi qua đường này, và nó chỉ tới đúng proxy vốn đã biết mật khẩu
    // của chính nó. Không có credential nick nào đi qua đây.
    headers: [`Proxy-Authorization: ${basicAuth(proxy.username, proxy.password)}`],
  };
}

/**
 * Phần đầu của một request HTTP/1.0 kèm `Connection: close`.
 *
 * Xin `HTTP/1.0` cố ý: phần thân khi đó không bao giờ bị chia khối (`chunked`), nên bên đọc chỉ
 * cần đếm byte tới lúc đóng kết nối thay vì phải hiểu thêm một tầng định dạng.
 *
 * `Accept` do bên gọi tự khai — bộ hỏi IP cần JSON, bộ đo băng thông nhận gì cũng được.
 */
export function buildRequestHead(
  transport: HttpTransport,
  destHost: string,
  path: string,
  extraHeaders: string[] = [],
): string {
  return [
    `GET ${transport.requestTarget(destHost, path)} HTTP/1.0`,
    `Host: ${destHost}`,
    ...transport.headers,
    ...extraHeaders,
    "Connection: close",
    "",
    "",
  ].join("\r\n");
}

/**
 * Mã trạng thái do CHÍNH PROXY sinh ra — nghĩa là proxy hỏng, không phải máy chủ bên kia hỏng.
 * Trả về null nếu mã này không quy được về lỗi proxy.
 */
export function proxyFaultForStatus(status: number): string | null {
  if (status === 407) return "proxy từ chối xác thực (sai user/mật khẩu?)";
  if (status === 502) return "proxy không ra được internet";
  if (status === 503) return "proxy đang quá tải hoặc ngừng phục vụ";
  return null;
}

/** Đọc dòng trạng thái của phần đầu HTTP. Trả 0 nếu không đọc được. */
export function parseHttpStatus(head: string): number {
  return Number(head.split(/\r?\n/)[0]?.split(" ")[1]) || 0;
}

/** Quy mọi lỗi bắt được về đúng hai loại kết quả xấu. */
export function toProbeFailure(error: unknown): {
  kind: "unreachable" | "probe-failed";
  detail: string;
} {
  if (error instanceof ProxyProbeError) return { kind: error.reason, detail: error.message };
  if (error instanceof Socks5Error) {
    // `protocol` = proxy trả lời thứ mình không hiểu. Lỗi rất có thể nằm ở chính đoạn bắt tay
    // SOCKS5 của mình, nên quy về "không đo được" — báo chết nhầm còn tệ hơn không báo.
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
