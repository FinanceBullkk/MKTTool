/**
 * Một lời **từ chối** của cầu nối vẫn phải giao lại nguyên thân phản hồi.
 *
 * Đây là chỗ đã hỏng thật, và hỏng theo kiểu tệ nhất: máy vừa cài xong trả `/health` với
 * `ok: false` (cấu hình còn thiếu — đúng như thiết kế) kèm `publicKey` trong thân, nhưng lớp gọi
 * vứt thân đi ở nhánh `rejected`. Kết quả là thẻ "Cài máy này" báo *"chưa đọc được khóa công
 * khai"* trên **mọi** chiếc máy mới — tức luồng cài đặt không chạy được lần nào, mà cầu nối thì
 * trả lời đầy đủ nên chẳng có gì để đi tìm.
 *
 * Test đứng ở tầng `pingRelay` chứ không tầng thẻ React: thứ hỏng là hợp đồng của `RelayOutcome`,
 * và mọi lời gọi khác xuống cầu nối đều đi qua đúng đoạn code này.
 */
import { afterEach, describe, expect, it, vi } from "vitest";
import { pingRelay } from "./relay-browser-client";
import { RELAY_VERSION } from "./relay-endpoints";

const PUBLIC_KEY = "d8f7f7237e2b54cf9a916110b40ed5d843a5b6602e9a1a56f2efb65cfddd1879";

/** Đúng thân mà một cầu nối vừa cài xong trả về — chép từ máy thật, 06/08/2026. */
const UNCONFIGURED_HEALTH = {
  ok: false,
  message: "Cầu nối trên máy này chưa cấu hình xong (2 mục còn thiếu).",
  publicKey: PUBLIC_KEY,
  configured: false,
  deviceId: null,
  relayVersion: RELAY_VERSION,
};

function stubFetch(status: number, body: unknown): void {
  vi.stubGlobal(
    "fetch",
    vi.fn(async () => new Response(JSON.stringify(body), { status })),
  );
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("pingRelay", () => {
  it("giữ thân phản hồi khi cầu nối từ chối vì chưa cấu hình xong", async () => {
    stubFetch(400, UNCONFIGURED_HEALTH);

    const outcome = await pingRelay();

    expect(outcome.status).toBe("rejected");
    if (outcome.status !== "rejected") return;
    // Khóa công khai là thứ duy nhất để đăng ký chính chiếc máy này. Mất nó ở đây là bế tắc.
    expect(outcome.data?.publicKey).toBe(PUBLIC_KEY);
    expect(outcome.data?.configured).toBe(false);
    expect(outcome.message).toContain("chưa cấu hình xong");
  });

  it("vẫn giao thân khi cầu nối đã cấu hình xong", async () => {
    stubFetch(200, {
      ...UNCONFIGURED_HEALTH,
      ok: true,
      message: "Cầu nối sẵn sàng.",
      configured: true,
      deviceId: "dev_123",
    });

    const outcome = await pingRelay();

    expect(outcome.status).toBe("ok");
    if (outcome.status !== "ok") return;
    expect(outcome.data.publicKey).toBe(PUBLIC_KEY);
    expect(outcome.data.deviceId).toBe("dev_123");
  });

  it("không có thân nào để giữ khi phản hồi không đọc nổi thành JSON", async () => {
    // Thứ đang nghe ở cổng đó không phải cầu nối. `data` vắng mặt, và chỗ gọi phải chịu được.
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => new Response("<html>không phải cầu nối</html>", { status: 200 })),
    );

    const outcome = await pingRelay();

    expect(outcome.status).toBe("rejected");
    if (outcome.status !== "rejected") return;
    expect(outcome.data).toBeUndefined();
  });
});
