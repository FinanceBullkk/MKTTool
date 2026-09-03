/**
 * Bắt tay SOCKS5 bằng tay trên `node:net` (RFC 1928 + RFC 1929).
 *
 * Vì sao tự viết thay vì thêm thư viện: `undici.ProxyAgent` không resolve được trong dự án
 * (Next.js không phơi undici ra), và nó cũng chỉ nói được proxy HTTP. Thêm hai dependency
 * (`https-proxy-agent` + `socks-proxy-agent`) cho đúng MỘT lời gọi kiểm tra là không đáng —
 * nhất là khi thứ cần lấy chỉ là một dòng JSON qua HTTP thường.
 *
 * Trả về socket đã nối thẳng tới đích, dùng được luôn cho `http.request({ createConnection })`.
 */
import net from "node:net";

/**
 * `unreachable` = proxy hỏng (không nối được, sai mật khẩu, không ra được internet) → kết luận CHẾT.
 * `protocol`    = proxy trả lời thứ mình không hiểu → kết luận KHÔNG KIỂM ĐƯỢC, vì lỗi rất có
 *                 thể nằm ở chính đoạn code này, và báo chết nhầm còn tệ hơn không báo.
 */
export class Socks5Error extends Error {
  constructor(
    message: string,
    readonly reason: "unreachable" | "protocol",
  ) {
    super(message);
    this.name = "Socks5Error";
  }
}

const SOCKS_VERSION = 0x05;
const AUTH_NONE = 0x00;
const AUTH_USERPASS = 0x02;
const AUTH_UNACCEPTABLE = 0xff;
const CMD_CONNECT = 0x01;
const ATYP_IPV4 = 0x01;
const ATYP_DOMAIN = 0x03;
const ATYP_IPV6 = 0x04;

/** Lý do từ chối theo RFC 1928, dịch sang câu đọc được. */
const REPLY_REASONS: Record<number, string> = {
  0x01: "the proxy reported a general failure",
  0x02: "the proxy rules do not allow this connection",
  0x03: "the network behind the proxy is unreachable",
  0x04: "the destination host is unreachable from the proxy",
  0x05: "the destination refused the connection",
  0x06: "the TTL expired",
  0x07: "the proxy does not support CONNECT",
  0x08: "the proxy does not support this address type",
};

/** Đọc theo từng khối có kích thước biết trước — đủ dùng cho một cuộc bắt tay tuần tự. */
function createByteReader(socket: net.Socket) {
  let buffer = Buffer.alloc(0);
  let pending: { size: number; resolve: (b: Buffer) => void; reject: (e: Error) => void } | null =
    null;

  function flush() {
    if (!pending || buffer.length < pending.size) return;
    const { size, resolve } = pending;
    pending = null;
    const chunk = buffer.subarray(0, size);
    buffer = buffer.subarray(size);
    resolve(chunk);
  }

  function fail(error: Error) {
    const waiting = pending;
    pending = null;
    waiting?.reject(error);
  }

  const onData = (chunk: Buffer) => {
    buffer = Buffer.concat([buffer, chunk]);
    flush();
  };
  const onError = (error: Error) => fail(error);
  const onClose = () =>
    fail(new Socks5Error("the proxy closed the connection during the SOCKS5 handshake", "unreachable"));

  socket.on("data", onData);
  socket.on("error", onError);
  socket.on("close", onClose);

  return {
    read(size: number): Promise<Buffer> {
      return new Promise((resolve, reject) => {
        pending = { size, resolve, reject };
        flush();
      });
    },
    /**
     * Gỡ listener và trả phần dư về đúng chỗ.
     *
     * Bình thường phần dư rỗng (đích chưa nói gì trước khi mình gửi request), nhưng nếu có
     * thì phải `unshift` lại — nuốt mất mấy byte đầu là hỏng đúng byte đầu của phản hồi HTTP.
     */
    release() {
      socket.off("data", onData);
      socket.off("error", onError);
      socket.off("close", onClose);
      if (buffer.length > 0) socket.unshift(buffer);
    },
  };
}

export interface Socks5TunnelOptions {
  proxyHost: string;
  proxyPort: number;
  username?: string;
  password?: string;
  destHost: string;
  destPort: number;
  timeoutMs: number;
}

function connectSocket(options: Socks5TunnelOptions): Promise<net.Socket> {
  return new Promise((resolve, reject) => {
    const socket = net.connect({ host: options.proxyHost, port: options.proxyPort });
    socket.setTimeout(options.timeoutMs);

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
      reject(new Socks5Error(`could not connect to the proxy (${error.message})`, "unreachable"));
    };
    const onTimeout = () => {
      cleanup();
      socket.destroy();
      reject(
        new Socks5Error(
          `could not connect to the proxy within ${options.timeoutMs / 1000} seconds`,
          "unreachable",
        ),
      );
    };

    socket.once("connect", onConnect);
    socket.once("error", onError);
    socket.once("timeout", onTimeout);
  });
}

/** Số byte còn lại của phần địa chỉ trong gói trả lời, tính theo ATYP. */
async function skipBoundAddress(read: (size: number) => Promise<Buffer>, atyp: number) {
  if (atyp === ATYP_IPV4) return read(4 + 2);
  if (atyp === ATYP_IPV6) return read(16 + 2);
  if (atyp === ATYP_DOMAIN) {
    const [length] = await read(1);
    return read((length ?? 0) + 2);
  }
  throw new Socks5Error(`the proxy returned an unsupported address type (${atyp})`, "protocol");
}

export async function openSocks5Tunnel(options: Socks5TunnelOptions): Promise<net.Socket> {
  const socket = await connectSocket(options);
  const reader = createByteReader(socket);
  const hasCredentials = Boolean(options.username);

  /**
   * Hạn giờ phải canh tiếp SAU khi nối được, không chỉ lúc đang nối.
   *
   * `connectSocket` gỡ listener `timeout` của nó ngay khi socket lên — hợp lý cho phần việc của
   * nó, nhưng `socket.setTimeout()` vẫn còn nguyên và Node **không tự đóng socket** khi không ai
   * nghe sự kiện đó. Thiếu dòng dưới đây thì một proxy nhận TCP rồi im lặng làm cả hàm này treo
   * vĩnh viễn: `reader.read()` chờ byte không bao giờ tới, promise không bao giờ settle, và nút
   * "Kiểm" quay mãi mà không ra câu trả lời nào.
   *
   * Đó là ca thật với proxy quá tải và với middlebox bắt cổng. Kết luận `unreachable`: proxy
   * không nói được một câu nào trong ngần ấy giây thì nó không dùng để chạy nick được.
   */
  const onHandshakeTimeout = () => {
    socket.destroy(
      new Socks5Error(
        `the proxy accepted the connection but sent no handshake data for ${options.timeoutMs / 1000} seconds`,
        "unreachable",
      ),
    );
  };
  socket.on("timeout", onHandshakeTimeout);

  try {
    // 1. Chào hỏi: khai các kiểu xác thực mình làm được.
    const methods = hasCredentials ? [AUTH_NONE, AUTH_USERPASS] : [AUTH_NONE];
    socket.write(Buffer.from([SOCKS_VERSION, methods.length, ...methods]));

    const greeting = await reader.read(2);
    if (greeting[0] !== SOCKS_VERSION) {
      throw new Socks5Error(
        "the endpoint did not respond as SOCKS5; check the proxy port and protocol",
        "protocol",
      );
    }
    const method = greeting[1];

    if (method === AUTH_UNACCEPTABLE) {
      throw new Socks5Error(
        hasCredentials
          ? "the proxy rejected every supported authentication method"
          : "the proxy requires authentication, but no username and password are configured",
        "unreachable",
      );
    }

    // 2. Xác thực user/mật khẩu nếu proxy đòi.
    if (method === AUTH_USERPASS) {
      const user = Buffer.from(options.username ?? "", "utf8");
      const pass = Buffer.from(options.password ?? "", "utf8");
      socket.write(
        Buffer.concat([Buffer.from([0x01, user.length]), user, Buffer.from([pass.length]), pass]),
      );

      const authReply = await reader.read(2);
      if (authReply[1] !== 0x00) {
        throw new Socks5Error("the proxy rejected the configured username or password", "unreachable");
      }
    } else if (method !== AUTH_NONE) {
      throw new Socks5Error(
        `the proxy requires an unsupported authentication method (${method})`,
        "protocol",
      );
    }

    // 3. Xin mở đường tới đích.
    const host = Buffer.from(options.destHost, "utf8");
    const port = Buffer.alloc(2);
    port.writeUInt16BE(options.destPort);
    socket.write(
      Buffer.concat([
        Buffer.from([SOCKS_VERSION, CMD_CONNECT, 0x00, ATYP_DOMAIN, host.length]),
        host,
        port,
      ]),
    );

    const reply = await reader.read(4);
    if (reply[0] !== SOCKS_VERSION) {
      throw new Socks5Error("the proxy returned a malformed SOCKS5 response", "protocol");
    }
    const code = reply[1] ?? 0xff;
    if (code !== 0x00) {
      throw new Socks5Error(
        `the proxy could not open a connection to ${options.destHost} (${REPLY_REASONS[code] ?? `reply code ${code}`})`,
        "unreachable",
      );
    }
    await skipBoundAddress((size) => reader.read(size), reply[3] ?? ATYP_IPV4);

    reader.release();
    socket.off("timeout", onHandshakeTimeout);
    socket.setTimeout(0);
    return socket;
  } catch (error) {
    reader.release();
    socket.off("timeout", onHandshakeTimeout);
    socket.destroy();
    throw error;
  }
}
