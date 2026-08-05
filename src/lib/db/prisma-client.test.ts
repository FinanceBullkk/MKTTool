import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

/**
 * Canh đúng một tính chất, và là tính chất đã hỏng một lần rồi: **nạp module này không được
 * đòi `DATABASE_URL`.**
 *
 * Vì sao đáng một file test riêng: hỏng thì không hỏng ở đây mà hỏng ở `next build`, trong một
 * môi trường không có `.env` — tức là trên máy chủ, ở lần deploy, kèm câu lỗi trỏ vào
 * `/_not-found` chứ không trỏ vào file này. Máy dev không bao giờ thấy vì `next build` tự nạp
 * `.env`. Đó là kiểu hỏng chỉ lộ ra ở nơi đắt nhất để phát hiện.
 *
 * `vi.resetModules()` ở mỗi test vì thứ đang kiểm là **hành vi lúc nạp**, nên mỗi lượt phải nạp
 * lại từ đầu. Và phải dọn `globalThis.prisma`: singleton nằm ở đó chính là thứ làm lượt nạp thứ
 * hai không dựng lại client, tức là làm bài test nói dối.
 */

const globalForPrisma = globalThis as unknown as { prisma?: unknown };

let saved: unknown;

beforeEach(() => {
  saved = globalForPrisma.prisma;
  globalForPrisma.prisma = undefined;
  vi.resetModules();
});

afterEach(() => {
  globalForPrisma.prisma = saved;
  vi.unstubAllEnvs();
});

describe("prisma-client dựng trễ", () => {
  it("nạp module được dù KHÔNG có DATABASE_URL — đây là thứ next build đòi hỏi", async () => {
    vi.stubEnv("DATABASE_URL", "");

    await expect(import("./prisma-client")).resolves.toHaveProperty("prisma");
  });

  it("chưa chạm tới thì chưa dựng client, tức chưa mở connection pool", async () => {
    const { prisma } = await import("./prisma-client");

    expect(globalForPrisma.prisma).toBeUndefined();

    // Chạm một lần là dựng.
    void prisma.account;
    expect(globalForPrisma.prisma).toBeDefined();

    await (globalForPrisma.prisma as { $disconnect(): Promise<void> }).$disconnect();
  });

  it("thiếu DATABASE_URL mà chạm vào thì vẫn báo đúng câu chỉ dẫn cũ", async () => {
    vi.stubEnv("DATABASE_URL", "");
    const { prisma } = await import("./prisma-client");

    expect(() => prisma.account).toThrow(/Thiếu DATABASE_URL/);
  });

  /**
   * Phương thức lấy rời khỏi client vẫn phải chạy đúng. Không bind thì `this` là cái proxy rỗng
   * chứ không phải client thật — và kiểu hỏng đó chỉ hiện ra ở đúng những chỗ viết
   * `const { $transaction } = prisma`, tức là không hiện ra cho tới khi có người viết như vậy.
   */
  it("phương thức lấy rời khỏi client vẫn giữ được this", async () => {
    const { prisma } = await import("./prisma-client");

    const { $disconnect } = prisma;
    expect(typeof $disconnect).toBe("function");
    await expect($disconnect()).resolves.toBeUndefined();
  });
});
