import net from "node:net";
import { afterEach, describe, expect, it } from "vitest";
import { Socks5Error, openSocks5Tunnel } from "./proxy-socks5-tunnel";

/**
 * Bắt tay SOCKS5 là code tự viết theo RFC 1928 — không có thư viện nào đỡ, nên không có ai
 * ngoài bộ test này canh nó.
 *
 * Thứ đáng canh nhất không phải "có nối được không" mà là **hai lý do lỗi**, vì chúng dẫn tới hai
 * kết luận trái ngược ở `proxy-liveness-verdict.ts`:
 *
 * - `unreachable` → proxy CHẾT → **chặn mở profile**
 * - `protocol`    → KHÔNG KIỂM ĐƯỢC → vẫn cho mở, có nói rõ
 *
 * Gán nhầm chiều nào cũng đắt: báo chết nhầm thì một nick lành bị khóa lại, còn báo sống nhầm thì
 * nick chạy bằng IP nhà.
 *
 * Mọi test dưới đây dựng một proxy SOCKS5 giả trên 127.0.0.1 — không đụng mạng thật.
 */

const servers: net.Server[] = [];
const openSockets: net.Socket[] = [];

afterEach(async () => {
  // `close()` chỉ ngừng nhận kết nối MỚI rồi chờ mọi kết nối cũ tự đóng — mà vài ca ở đây cố ý để
  // proxy giả im lặng, nên kết nối cũ không tự đóng và hook sẽ treo hết giờ. `net.Server` không có
  // `closeAllConnections()` (đó là của `http.Server`), nên phải tự giữ danh sách.
  for (const socket of openSockets.splice(0)) socket.destroy();
  await Promise.all(
    servers.splice(0).map((server) => new Promise((done) => server.close(() => done(null)))),
  );
});

/** Bật một proxy giả, trả về cổng nó đang nghe. `handle` tự viết kịch bản byte cho từng ca. */
function startFakeProxy(handle: (socket: net.Socket) => void): Promise<number> {
  return new Promise((resolve) => {
    const server = net.createServer((socket) => {
      openSockets.push(socket);
      // Proxy giả đóng kết nối giữa chừng là kịch bản của một số ca — lỗi socket ở phía này
      // không phải thứ cần làm đỏ test.
      socket.on("error", () => {});
      handle(socket);
    });
    servers.push(server);
    server.listen(0, "127.0.0.1", () => resolve((server.address() as net.AddressInfo).port));
  });
}

/** Đọc đúng N byte một lần — phía proxy giả cũng cần đọc theo khối như phía thật. */
function byteReader(socket: net.Socket) {
  let buffer = Buffer.alloc(0);
  let pending: { size: number; resolve: (b: Buffer) => void } | null = null;

  function flush() {
    if (!pending || buffer.length < pending.size) return;
    const { size, resolve } = pending;
    pending = null;
    const chunk = buffer.subarray(0, size);
    buffer = buffer.subarray(size);
    resolve(chunk);
  }

  socket.on("data", (chunk: Buffer) => {
    buffer = Buffer.concat([buffer, chunk]);
    flush();
  });

  return (size: number) =>
    new Promise<Buffer>((resolve) => {
      pending = { size, resolve };
      flush();
    });
}

/** Nuốt trọn lời chào, trả về danh sách kiểu xác thực client khai làm được. */
async function readGreeting(read: (size: number) => Promise<Buffer>): Promise<number[]> {
  const header = await read(2);
  const methods = await read(header[1] ?? 0);
  return [...methods];
}

/** Nuốt trọn gói xin CONNECT (chỉ dạng ATYP_DOMAIN), trả về tên miền và cổng đích. */
async function readConnect(read: (size: number) => Promise<Buffer>) {
  const header = await read(4); // VER, CMD, RSV, ATYP
  const [hostLength] = await read(1);
  const rest = await read((hostLength ?? 0) + 2);
  return {
    atyp: header[3],
    destHost: rest.subarray(0, hostLength).toString("utf8"),
    destPort: rest.readUInt16BE(hostLength ?? 0),
  };
}

/** Gói trả lời "mở đường thành công", địa chỉ bound dạng IPv4. */
const REPLY_OK_IPV4 = Buffer.from([0x05, 0x00, 0x00, 0x01, 0, 0, 0, 0, 0, 0]);

function tunnelTo(port: number, extra: Partial<Parameters<typeof openSocks5Tunnel>[0]> = {}) {
  return openSocks5Tunnel({
    proxyHost: "127.0.0.1",
    proxyPort: port,
    destHost: "ipinfo.io",
    destPort: 80,
    timeoutMs: 2_000,
    ...extra,
  });
}

/** Ép kiểu để đọc `.reason` — thứ quyết định proxy bị kết luận CHẾT hay KHÔNG KIỂM ĐƯỢC. */
async function reasonOf(promise: Promise<unknown>): Promise<string> {
  try {
    await promise;
  } catch (error) {
    expect(error).toBeInstanceOf(Socks5Error);
    return (error as Socks5Error).reason;
  }
  throw new Error("Expected an error to be thrown");
}

describe("openSocks5Tunnel - successful paths", () => {
  it("opens a tunnel when the proxy does not require authentication", async () => {
    const port = await startFakeProxy(async (socket) => {
      const read = byteReader(socket);
      await readGreeting(read);
      socket.write(Buffer.from([0x05, 0x00]));
      await readConnect(read);
      socket.write(REPLY_OK_IPV4);
    });

    const socket = await tunnelTo(port);
    expect(socket.destroyed).toBe(false);
    socket.destroy();
  });

  it("sends the hostname rather than an IP so DNS resolves remotely", async () => {
    // Ràng buộc bảo mật, không phải chi tiết cài đặt: phân giải DNS tại máy rồi gửi IP đi nghĩa là
    // nhà mạng ở nhà thấy được nick đang vào đâu, và bên kia thấy DNS không khớp IP.
    let seen: { atyp?: number; destHost: string; destPort: number } | null = null;
    const port = await startFakeProxy(async (socket) => {
      const read = byteReader(socket);
      await readGreeting(read);
      socket.write(Buffer.from([0x05, 0x00]));
      seen = await readConnect(read);
      socket.write(REPLY_OK_IPV4);
    });

    (await tunnelTo(port, { destHost: "ipinfo.io", destPort: 80 })).destroy();

    expect(seen).not.toBeNull();
    expect(seen!.atyp).toBe(0x03); // ATYP_DOMAIN
    expect(seen!.destHost).toBe("ipinfo.io");
    expect(seen!.destPort).toBe(80);
  });

  it("uses RFC 1929 authentication when a username and password are configured", async () => {
    let credentials: { user: string; pass: string } | null = null;
    const port = await startFakeProxy(async (socket) => {
      const read = byteReader(socket);
      const methods = await readGreeting(read);
      expect(methods).toContain(0x02);

      socket.write(Buffer.from([0x05, 0x02])); // đòi user/pass
      const [, userLength] = await read(2);
      const user = (await read(userLength ?? 0)).toString("utf8");
      const [passLength] = await read(1);
      const pass = (await read(passLength ?? 0)).toString("utf8");
      credentials = { user, pass };

      socket.write(Buffer.from([0x01, 0x00])); // chấp nhận
      await readConnect(read);
      socket.write(REPLY_OK_IPV4);
    });

    (await tunnelTo(port, { username: "u1", password: "p@ss" })).destroy();

    expect(credentials).toEqual({ user: "u1", pass: "p@ss" });
  });

  it("preserves destination bytes delivered with the handshake reply", async () => {
    // Ca này là lý do `release()` phải `unshift` phần dư. Nuốt mất mấy byte đầu thì hỏng đúng
    // dòng "HTTP/1.0 200 OK" — và biểu hiện sẽ là "proxy hỏng", không phải "code này hỏng".
    const port = await startFakeProxy(async (socket) => {
      const read = byteReader(socket);
      await readGreeting(read);
      socket.write(Buffer.from([0x05, 0x00]));
      await readConnect(read);
      // Trả lời và payload trong CÙNG một lượt ghi — đảm bảo chúng nằm chung một chunk.
      socket.write(Buffer.concat([REPLY_OK_IPV4, Buffer.from("HTTP/1.0 200 OK\r\n", "utf8")]));
    });

    const socket = await tunnelTo(port);
    const firstChunk = await new Promise<string>((resolve) => {
      socket.once("data", (chunk: Buffer) => resolve(chunk.toString("utf8")));
    });
    socket.destroy();

    expect(firstChunk).toBe("HTTP/1.0 200 OK\r\n");
  });

  it("reads the correct byte count for a domain-name bound address", async () => {
    // Phần địa chỉ trong gói trả lời dài ngắn tùy ATYP. Đếm hụt một byte thì byte thừa trôi sang
    // phần thân phản hồi; đếm dư thì mất byte đầu. Cả hai đều đổ oan cho proxy.
    const port = await startFakeProxy(async (socket) => {
      const read = byteReader(socket);
      await readGreeting(read);
      socket.write(Buffer.from([0x05, 0x00]));
      await readConnect(read);

      const boundHost = Buffer.from("gw.proxy.example", "utf8");
      socket.write(
        Buffer.concat([
          Buffer.from([0x05, 0x00, 0x00, 0x03, boundHost.length]),
          boundHost,
          Buffer.from([0x00, 0x50]),
          Buffer.from("PAYLOAD", "utf8"),
        ]),
      );
    });

    const socket = await tunnelTo(port);
    const firstChunk = await new Promise<string>((resolve) => {
      socket.once("data", (chunk: Buffer) => resolve(chunk.toString("utf8")));
    });
    socket.destroy();

    expect(firstChunk).toBe("PAYLOAD");
  });
});

describe("openSocks5Tunnel - confirmed proxy failures", () => {
  it("reports when no service is listening on the port", async () => {
    // Bắt một cổng rồi trả lại, gần như chắc chắn không ai kịp chiếm.
    const port = await startFakeProxy(() => {});
    await new Promise((done) => servers.pop()!.close(() => done(null)));

    expect(await reasonOf(tunnelTo(port))).toBe("unreachable");
  });

  it("reports when the proxy rejects every supported authentication method", async () => {
    const port = await startFakeProxy(async (socket) => {
      const read = byteReader(socket);
      await readGreeting(read);
      socket.write(Buffer.from([0x05, 0xff]));
    });

    await expect(tunnelTo(port)).rejects.toThrow(/no username and password are configured/);
    expect(await reasonOf(tunnelTo(port))).toBe("unreachable");
  });

  it("reports an incorrect proxy password", async () => {
    const port = await startFakeProxy(async (socket) => {
      const read = byteReader(socket);
      await readGreeting(read);
      socket.write(Buffer.from([0x05, 0x02]));
      const [, userLength] = await read(2);
      await read(userLength ?? 0);
      const [passLength] = await read(1);
      await read(passLength ?? 0);
      socket.write(Buffer.from([0x01, 0x01])); // từ chối
    });

    await expect(tunnelTo(port, { username: "u", password: "wrong" })).rejects.toThrow(
      /rejected the configured username or password/,
    );
    expect(await reasonOf(tunnelTo(port, { username: "u", password: "sai" }))).toBe("unreachable");
  });

  it("translates the proxy's connection refusal code into a readable message", async () => {
    const port = await startFakeProxy(async (socket) => {
      const read = byteReader(socket);
      await readGreeting(read);
      socket.write(Buffer.from([0x05, 0x00]));
      await readConnect(read);
      socket.write(Buffer.from([0x05, 0x03, 0x00, 0x01, 0, 0, 0, 0, 0, 0])); // 0x03 = network unreachable
    });

    await expect(tunnelTo(port)).rejects.toThrow(/network behind the proxy is unreachable/);
    expect(await reasonOf(tunnelTo(port))).toBe("unreachable");
  });

  it("reports when the proxy closes the connection during the handshake", async () => {
    const port = await startFakeProxy(async (socket) => {
      const read = byteReader(socket);
      await readGreeting(read);
      socket.destroy();
    });

    expect(await reasonOf(tunnelTo(port))).toBe("unreachable");
  });
});

describe("openSocks5Tunnel - inconclusive local or protocol failures", () => {
  it("reports when the configured port does not speak SOCKS5", async () => {
    // Cùng một proxy thường phục vụ HTTP ở cổng này và SOCKS5 ở cổng khác. Gõ nhầm cổng là lỗi
    // nhập liệu, không phải proxy chết — kết luận CHẾT ở đây sẽ đổ oan cho một proxy đang tốt.
    const port = await startFakeProxy((socket) => {
      socket.write(Buffer.from("HTTP/1.1 400 Bad Request\r\n", "utf8"));
    });

    await expect(tunnelTo(port)).rejects.toThrow(/did not respond as SOCKS5/);
    expect(await reasonOf(tunnelTo(port))).toBe("protocol");
  });

  it("reports an unsupported proxy authentication method such as GSSAPI", async () => {
    const port = await startFakeProxy(async (socket) => {
      const read = byteReader(socket);
      await readGreeting(read);
      socket.write(Buffer.from([0x05, 0x01])); // 0x01 = GSSAPI
    });

    expect(await reasonOf(tunnelTo(port))).toBe("protocol");
  });

  it("reports a malformed SOCKS5 reply", async () => {
    const port = await startFakeProxy(async (socket) => {
      const read = byteReader(socket);
      await readGreeting(read);
      socket.write(Buffer.from([0x05, 0x00]));
      await readConnect(read);
      socket.write(Buffer.from([0x04, 0x00, 0x00, 0x01, 0, 0, 0, 0, 0, 0]));
    });

    await expect(tunnelTo(port)).rejects.toThrow(/malformed SOCKS5 response/);
    expect(await reasonOf(tunnelTo(port))).toBe("protocol");
  });

  it("reports an unknown bound-address type", async () => {
    const port = await startFakeProxy(async (socket) => {
      const read = byteReader(socket);
      await readGreeting(read);
      socket.write(Buffer.from([0x05, 0x00]));
      await readConnect(read);
      socket.write(Buffer.from([0x05, 0x00, 0x00, 0x09]));
    });

    expect(await reasonOf(tunnelTo(port))).toBe("protocol");
  });
});

describe("openSocks5Tunnel - timeout", () => {
  it("times out instead of hanging when the proxy accepts a connection and stays silent", async () => {
    // Ca thật: proxy quá tải, hoặc một middlebox nhận TCP rồi không nói gì. Nếu hàm này không tự
    // bỏ cuộc thì nút "Kiểm" quay mãi và không có câu trả lời nào — tệ hơn hẳn một câu báo hỏng.
    const port = await startFakeProxy(() => {
      // nhận kết nối, không trả lời gì cả
    });

    expect(await reasonOf(tunnelTo(port, { timeoutMs: 300 }))).toBe("unreachable");
  }, 5_000);
});
