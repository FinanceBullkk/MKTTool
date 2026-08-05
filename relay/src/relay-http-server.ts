/**
 * Máy chủ HTTP của cầu nối: nghe `127.0.0.1`, đúng một nguồn được gọi vào.
 *
 * ## Bind `127.0.0.1`, không phải `0.0.0.0`
 *
 * Đây là ranh giới an toàn thật, không phải cấu hình cho gọn: cầu nối giữ khóa vùng operator,
 * nên một cổng nghe ra mạng LAN là mời cả quán cà phê xin mật khẩu nick. Máy chủ HTTP ở đây
 * **không có** đường bật nghe rộng hơn — không cờ, không biến môi trường.
 *
 * ## CORS khai đúng một nguồn
 *
 * `Access-Control-Allow-Origin: *` là đường ngắn và sai: nó cho **mọi** trang web bất kỳ mà
 * người dùng đang mở gọi xuống cầu nối. Spike GĐ0 đã đo — CORS không phải thứ chặn đường gọi
 * ngầm (Local Network Access mới là), nên khai chặt ở đây không tốn gì.
 *
 * Header đời cũ `Access-Control-Allow-Private-Network` vẫn trả: spike đo thấy trình duyệt đời
 * mới **không hỏi** nó nữa, nhưng máy dùng Chrome cũ hơn thì có, và một header thừa rẻ hơn một
 * chiếc máy hỏng không rõ lý do.
 *
 * ## Vì sao mọi phản hồi đều mang `relayVersion`
 *
 * QĐ 11 — không có bộ tự cập nhật. Web app chỉ biết một chiếc máy đang chạy bản cũ nếu chính
 * chiếc máy đó khai ra, ở mọi câu trả lời chứ không riêng `/health`: nút hỏng vì bản cũ mà
 * không nói được điều đó thì người dùng đi tìm nhầm chỗ.
 */
import { createServer, type IncomingMessage, type Server, type ServerResponse } from "node:http";
import { RELAY_PORT } from "../../src/lib/relay/relay-endpoints";
import { RELAY_VERSION } from "./relay-version";

/** Chỉ nghe trên vòng lặp nội bộ. Hằng số, không phải tham số — xem chú thích đầu file. */
const LOOPBACK_HOST = "127.0.0.1";

/** Thân một phản hồi JSON của cầu nối, trước khi thêm `relayVersion`. */
export interface RelayResponseBody {
  ok: boolean;
  message: string;
  [key: string]: unknown;
}

/** Một đường xử lý. Trả về thân JSON; phần vỏ (status, header, version) do khung lo. */
export type RelayRoute = (
  request: IncomingMessage,
  body: string,
) => Promise<RelayResponseBody> | RelayResponseBody;

export interface RelayServerOptions {
  /**
   * Nguồn web được phép gọi vào, hoặc `null` khi cấu hình chưa đủ.
   *
   * `null` thì **không** trả header CORS nào — chưa biết ai được phép thì không cho ai cả. Trang
   * trạng thái vẫn mở được bằng cách gõ thẳng địa chỉ, và đó đúng là chỗ nói vì sao đang hỏng.
   */
  allowedOrigin: string | null;
  /** Bảng đường JSON: đường dẫn → hàm xử lý. */
  routes: Partial<Record<string, RelayRoute>>;
  /**
   * Trang HTML người xem bằng mắt: đường dẫn → hàm dựng chuỗi.
   *
   * Tách khỏi `routes` vì hai loại này khác nhau ở mọi thứ đi kèm — kiểu nội dung, mã lỗi, và
   * việc có gắn `relayVersion` vào hay không. Nhét chung một bảng thì mỗi hàm xử lý phải tự
   * khai mình thuộc loại nào, và quên khai là trả HTML dưới nhãn JSON.
   */
  htmlPages: Partial<Record<string, () => string | Promise<string>>>;
}

/** Thân request, chặn ở 1 MB: mọi thứ cầu nối nhận đều là vé hoặc vài chuỗi bí mật. */
const MAX_BODY_BYTES = 1_000_000;

function readBody(request: IncomingMessage): Promise<string> {
  return new Promise((resolve, reject) => {
    const chunks: Buffer[] = [];
    let size = 0;

    request.on("data", (chunk: Buffer) => {
      size += chunk.length;
      if (size > MAX_BODY_BYTES) {
        reject(new Error("Thân request quá lớn."));
        request.destroy();
        return;
      }
      chunks.push(chunk);
    });
    request.on("end", () => resolve(Buffer.concat(chunks).toString("utf8")));
    request.on("error", reject);
  });
}

/**
 * Header CORS cho một nguồn cụ thể.
 *
 * So khớp nguyên văn: trình duyệt gửi `Origin` đúng dạng `scheme://host[:port]`, và chỉ nguồn
 * khớp mới nhận được header. Nguồn lạ thì không có header nào — trình duyệt của họ tự chặn.
 */
function corsHeaders(
  requestOrigin: string | undefined,
  allowedOrigin: string | null,
): Record<string, string> {
  if (!allowedOrigin || requestOrigin !== allowedOrigin) return {};

  return {
    "access-control-allow-origin": allowedOrigin,
    "access-control-allow-methods": "GET, POST, OPTIONS",
    "access-control-allow-headers": "content-type",
    // Luật đời cũ (Private Network Access). Trình duyệt đời mới bỏ qua — xem chú thích đầu file.
    "access-control-allow-private-network": "true",
    // Không cache preflight lâu: đổi `webOrigin` trong file cấu hình rồi khởi động lại cầu nối
    // mà trình duyệt vẫn giữ câu trả lời cũ là một kiểu hỏng không ai đoán ra.
    "access-control-max-age": "60",
  };
}

function sendJson(
  response: ServerResponse,
  status: number,
  body: RelayResponseBody,
  headers: Record<string, string>,
): void {
  response.writeHead(status, {
    "content-type": "application/json; charset=utf-8",
    // Vé và bí mật không bao giờ được nằm lại trong bộ nhớ đệm nào.
    "cache-control": "no-store",
    ...headers,
  });
  response.end(JSON.stringify({ ...body, relayVersion: RELAY_VERSION }));
}

/**
 * Dựng máy chủ. **Không tự gọi `listen`** — chỗ gọi quyết định khi nào nghe, và test dựng được
 * máy chủ trên cổng ngẫu nhiên mà không đụng cổng thật.
 */
export function createRelayServer(options: RelayServerOptions): Server {
  return createServer((request, response) => {
    void handleRequest(request, response, options);
  });
}

async function handleRequest(
  request: IncomingMessage,
  response: ServerResponse,
  options: RelayServerOptions,
): Promise<void> {
  const origin = request.headers.origin;
  const headers = corsHeaders(origin, options.allowedOrigin);
  const path = new URL(request.url ?? "/", `http://${LOOPBACK_HOST}`).pathname;

  if (request.method === "OPTIONS") {
    response.writeHead(204, headers);
    response.end();
    return;
  }

  // Trang trạng thái và trang bí mật là HTML người xem bằng mắt, không phải API.
  const page = options.htmlPages[path];
  if (request.method === "GET" && page) {
    response.writeHead(200, {
      "content-type": "text/html; charset=utf-8",
      // `no-store` ở đây không phải nghi thức: trang `/secret` mà nằm lại trong bộ nhớ đệm
      // đĩa là một bản sao của màn hình có mật khẩu trên đó.
      "cache-control": "no-store",
      // Trang này không được nhúng vào khung của ai. Cầu nối không có phiên đăng nhập để
      // clickjack, nhưng nó có một nút "Chép" đưa mật khẩu vào clipboard.
      "x-frame-options": "DENY",
      "content-security-policy":
        "default-src 'none'; script-src 'unsafe-inline'; style-src 'unsafe-inline'; connect-src 'self'",
    });
    // Dựng trang được phép `await`: trang trạng thái hỏi MultiZen ngay lúc vẽ, để câu nó in ra
    // là hiện trạng chứ không phải thứ nhớ từ lần nào đó trước.
    response.end(await page());
    return;
  }

  const route = options.routes[path];
  if (!route) {
    sendJson(
      response,
      404,
      {
        ok: false,
        message: `Cầu nối không có đường "${path}". Nhiều khả năng web app và cầu nối lệch phiên bản.`,
      },
      headers,
    );
    return;
  }

  let body = "";
  if (request.method === "POST") {
    try {
      body = await readBody(request);
    } catch (error) {
      sendJson(response, 413, { ok: false, message: (error as Error).message }, headers);
      return;
    }
  }

  try {
    const result = await route(request, body);
    sendJson(response, result.ok ? 200 : 400, result, headers);
  } catch (error) {
    // Không bao giờ để lỗi lọt ra dạng stack trace: vé và bí mật đi qua đúng những hàm này.
    sendJson(
      response,
      500,
      { ok: false, message: `Cầu nối gặp lỗi khi xử lý: ${(error as Error).message}` },
      headers,
    );
  }
}

/** Bật nghe. Cổng cố định `RELAY_PORT`; cổng bị chiếm thì lỗi phải nói rõ ai chiếm chỗ nào. */
export function listenOnLoopback(server: Server, port: number = RELAY_PORT): Promise<void> {
  return new Promise((resolve, reject) => {
    server.once("error", (error: NodeJS.ErrnoException) => {
      if (error.code === "EADDRINUSE") {
        reject(
          new Error(
            `Cổng ${port} đang bị chương trình khác chiếm, cầu nối không nghe được. Tắt chương ` +
              `trình đó rồi chạy lại — cổng này cố định vì web app gọi thẳng vào nó.`,
          ),
        );
        return;
      }
      reject(error);
    });

    server.listen(port, LOOPBACK_HOST, resolve);
  });
}
