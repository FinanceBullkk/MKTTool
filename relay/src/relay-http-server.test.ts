import type { AddressInfo } from "node:net";
import { afterEach, describe, expect, it } from "vitest";
import { createRelayServer } from "./relay-http-server";
import { RELAY_VERSION } from "../../src/lib/relay/relay-endpoints";

const WEB_ORIGIN = "https://mkttool.example.com";
let echoCalls = 0;

/** Máy chủ thật trên cổng ngẫu nhiên — kiểm header thì phải đi qua HTTP thật. */
const running: { close: () => void }[] = [];

async function startServer(allowedOrigin: string | null = WEB_ORIGIN): Promise<string> {
  echoCalls = 0;
  const server = createRelayServer({
    // Hàm chứ không phải giá trị: cấu hình đổi được lúc chạy, nên khung phải hỏi lại mỗi lượt.
    allowedOrigin: () => allowedOrigin,
    htmlPages: { "/": () => "<!doctype html><title>trang trạng thái</title>" },
    routes: {
      "/health": {
        method: "GET",
        capability: "test-health",
        handler: () => ({ ok: true, message: "sẵn sàng" }),
      },
      "/echo": {
        method: "POST",
        capability: "test-echo",
        handler: (_request, body) => {
          echoCalls += 1;
          return { ok: true, message: body };
        },
      },
      "/no": {
        method: "GET",
        capability: "test-rejection",
        handler: () => ({ ok: false, message: "từ chối" }),
      },
      "/boom": {
        method: "GET",
        capability: "test-failure",
        handler: () => {
          throw new Error("hỏng bên trong");
        },
      },
    },
  });

  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  running.push({ close: () => server.close() });

  return `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
}

afterEach(() => {
  while (running.length > 0) running.pop()!.close();
});

describe("máy chủ HTTP của cầu nối", () => {
  it("mọi phản hồi JSON đều mang relayVersion — QĐ 11", async () => {
    const base = await startServer();

    for (const path of ["/health", "/no", "/khong-co-duong-nay"]) {
      const body = await (await fetch(`${base}${path}`)).json();
      expect(body.relayVersion, path).toBe(RELAY_VERSION);
    }
  });

  it("trả header CORS cho đúng nguồn đã khai", async () => {
    const base = await startServer();
    const response = await fetch(`${base}/health`, { headers: { origin: WEB_ORIGIN } });

    expect(response.headers.get("access-control-allow-origin")).toBe(WEB_ORIGIN);
  });

  it("KHÔNG trả header CORS cho nguồn lạ", async () => {
    // `*` là đường ngắn và sai: nó cho mọi trang người dùng đang mở gọi xuống cầu nối.
    const base = await startServer();
    const response = await fetch(`${base}/health`, { headers: { origin: "https://ke-la.example" } });

    expect(response.headers.get("access-control-allow-origin")).toBeNull();
  });

  it("chưa cấu hình xong thì không nguồn nào được CORS", async () => {
    const base = await startServer(null);
    const response = await fetch(`${base}/health`, { headers: { origin: WEB_ORIGIN } });

    expect(response.headers.get("access-control-allow-origin")).toBeNull();
  });

  it("trả lời preflight bằng 204 kèm đủ header", async () => {
    const base = await startServer();
    const response = await fetch(`${base}/health`, {
      method: "OPTIONS",
      headers: { origin: WEB_ORIGIN, "access-control-request-method": "POST" },
    });

    expect(response.status).toBe(204);
    expect(response.headers.get("access-control-allow-methods")).toContain("POST");
  });

  it("đường không có thì trả 404 kèm câu đoán đúng nguyên nhân", async () => {
    const base = await startServer();
    const response = await fetch(`${base}/khong-co`);

    expect(response.status).toBe(404);
    expect((await response.json()).message).toContain("lệch phiên bản");
  });

  it("đọc được thân POST", async () => {
    const base = await startServer();
    const response = await fetch(`${base}/echo`, { method: "POST", body: "xin chào" });

    expect((await response.json()).message).toBe("xin chào");
  });

  it("rejects the wrong HTTP method before invoking a route handler", async () => {
    const base = await startServer();
    const response = await fetch(`${base}/echo`);
    const body = await response.json();

    expect(response.status).toBe(405);
    expect(response.headers.get("allow")).toBe("POST");
    expect(body.message).toContain("Use POST");
    expect(echoCalls).toBe(0);
  });

  it("rejects an oversized POST body before invoking a route handler", async () => {
    const base = await startServer();
    const response = await fetch(`${base}/echo`, { method: "POST", body: "x".repeat(1_000_001) });

    expect(response.status).toBe(413);
    expect(echoCalls).toBe(0);
  });

  it("ok:false ra HTTP 400, để phía web phân biệt được với lỗi mạng", async () => {
    const base = await startServer();
    expect((await fetch(`${base}/no`)).status).toBe(400);
  });

  it("lỗi ném ra từ trong đường xử lý thành 500 có câu chữ, không phải stack trace", async () => {
    const base = await startServer();
    const response = await fetch(`${base}/boom`);
    const body = await response.json();

    expect(response.status).toBe(500);
    expect(body.ok).toBe(false);
    expect(body.message).toContain("hỏng bên trong");
    expect(JSON.stringify(body)).not.toContain("at ");
  });

  it("GET / trả trang trạng thái dạng HTML", async () => {
    const base = await startServer();
    const response = await fetch(base);

    expect(response.headers.get("content-type")).toContain("text/html");
    expect(await response.text()).toContain("trang trạng thái");
  });

  it("trang HTML không được nhúng vào khung của ai, và không nằm lại trong bộ đệm", async () => {
    // Trang `/secret` có mật khẩu trên màn hình và một nút đưa nó vào clipboard.
    const base = await startServer();
    const response = await fetch(base);

    expect(response.headers.get("x-frame-options")).toBe("DENY");
    expect(response.headers.get("cache-control")).toBe("no-store");
    expect(response.headers.get("content-security-policy")).toContain("default-src 'none'");
  });

  it("không lưu đệm bất cứ phản hồi nào — vé và bí mật đi qua đây", async () => {
    const base = await startServer();
    expect((await fetch(`${base}/health`)).headers.get("cache-control")).toBe("no-store");
  });
});
