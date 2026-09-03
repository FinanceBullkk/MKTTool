/**
 * Nhập proxy theo lô — canh đúng thứ bản đầu làm sai: **ghi thẳng vào database không qua schema.**
 *
 * Ba giá trị từng bị bịa cho mọi dòng (`type: "MOBILE_4G"`, `country: "VN"`, `protocol: "http"`),
 * và `Proxy.type` là cột `String` nên giá trị lạ **ghi được** — hỏng im lặng, chỉ lộ ra vào ngày
 * có người đọc cột đó. Bài này canh cả hai vế: giá trị lạ bị chặn, và giá trị người dùng khai
 * được tôn trọng thay vì bị đè bằng mặc định.
 */
import { afterAll, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("next/cache", () => ({ revalidatePath: () => {} }));

const SERVER_KEY_HEX = "27112efee5aeaa94963b0f1f9e0dabcdf2767c34ee483d8dc2c76f61bdd1186d";
const OPERATOR_KEY_HEX = "a3d1e1576b7746dbd4481fb6fd16b16f7c7381301b8ab9ef8a3f2994c96150dc";

process.env.VAULT_KEY_SERVER = SERVER_KEY_HEX;
process.env.VAULT_KEY_OPERATOR = OPERATOR_KEY_HEX;

const TEST_ADMIN = { userId: "user-1", email: "admin@mkttool.local", role: "ADMIN" as const };

// `adminAction` gọi `requireAdmin`, không gọi `requireActor` — mock thiếu một trong hai là mọi
// bài rơi vào lỗi "headers called outside a request scope".
vi.mock("@/lib/auth/require-actor", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/auth/require-actor")>()),
  requireActor: async () => TEST_ADMIN,
  requireAdmin: async () => TEST_ADMIN,
}));

const { prisma } = await import("@/lib/db/prisma-client");
const { decryptCredential } = await import("@/lib/crypto/credential-encryption");
const { loadVaultKey } = await import("@/lib/crypto/encryption-key-loader");
const { createBulkProxies } = await import("./proxy-bulk-actions");

const US_ISP = { country: "US", type: "STATIC_ISP", protocol: "http" };

beforeEach(async () => {
  await prisma.account.deleteMany();
  await prisma.proxy.deleteMany();
});

afterAll(async () => {
  await prisma.$disconnect();
});

describe("createBulkProxies", () => {
  it("imports multiple rows with passwords protected by the server key", async () => {
    const result = await createBulkProxies(
      "1.1.1.1:8080:u1:p1\n2.2.2.2:9090:u2:p2",
      US_ISP,
    );

    expect(result.ok).toBe(true);
    expect(await prisma.proxy.count()).toBe(2);

    const proxy = await prisma.proxy.findFirstOrThrow({ where: { host: "1.1.1.1" } });
    expect(decryptCredential(proxy.passwordEnc, loadVaultKey("server"))).toBe("p1");
  });

  /**
   * Ca chính. `country` quyết định ngôn ngữ và múi giờ của vân tay
   * (`profile-fingerprint-plan.ts`), nên đè nó bằng mặc định là gắn vân tay sai cho IP thật.
   */
  it("preserves the declared country instead of overriding it with VN", async () => {
    await createBulkProxies("1.1.1.1:8080:u1:p1", US_ISP);

    const proxy = await prisma.proxy.findFirstOrThrow();
    expect(proxy.country).toBe("US");
  });

  it("preserves the declared IP type and protocol", async () => {
    await createBulkProxies("1.1.1.1:8080:u1:p1", {
      country: "SG",
      type: "MOBILE",
      protocol: "socks5",
    });

    const proxy = await prisma.proxy.findFirstOrThrow();
    expect(proxy.type).toBe("MOBILE");
    expect(proxy.protocol).toBe("socks5");
  });

  /** Đây là thứ bản đầu ghi được vào database. Giờ phải bị chặn, và không ghi gì. */
  it("rejects an unknown IP type without writing any rows", async () => {
    const result = await createBulkProxies("1.1.1.1:8080:u1:p1", {
      ...US_ISP,
      type: "MOBILE_4G",
    });

    expect(result.ok).toBe(false);
    expect(await prisma.proxy.count()).toBe(0);
  });

  it("rejects the entire batch when the country is missing", async () => {
    const result = await createBulkProxies("1.1.1.1:8080:u1:p1", { ...US_ISP, country: "" });

    expect(result.ok).toBe(false);
    expect(await prisma.proxy.count()).toBe(0);
  });

  /**
   * Bản đầu nuốt mọi lỗi bằng `catch {}` rồi vẫn báo "Đã import thành công N/M" — dán 20 dòng
   * hỏng 19 vẫn thấy chữ "thành công". Câu trả lời phải nói đúng số vào được và dòng nào hỏng.
   */
  it("identifies an invalid row by line number without reporting it as successful", async () => {
    const result = await createBulkProxies(
      "1.1.1.1:8080:u1:p1\nkhong-phai-proxy\n3.3.3.3:7070:u3:p3",
      US_ISP,
    );

    expect(result.ok).toBe(false);
    expect(result.message).toContain("2/3");
    expect(result.message).toContain("line 2");
    // Hai dòng đúng vẫn phải vào được — một dòng hỏng không kéo cả lô xuống.
    expect(await prisma.proxy.count()).toBe(2);
  });

  it("reports a duplicate host, port, and username as a duplicate", async () => {
    await createBulkProxies("1.1.1.1:8080:u1:p1", US_ISP);
    const result = await createBulkProxies("kho2|1.1.1.1:8080:u1:p1", US_ISP);

    expect(result.ok).toBe(false);
    expect(result.message).toContain("already exists");
    expect(await prisma.proxy.count()).toBe(1);
  });

  it("ignores blank rows and comment rows beginning with #", async () => {
    const result = await createBulkProxies(
      "# proxy purchased on 19/08\n\n1.1.1.1:8080:u1:p1\n\n",
      US_ISP,
    );

    expect(result.ok).toBe(true);
    expect(await prisma.proxy.count()).toBe(1);
  });

  it("uses host and port for missing labels and keeps them unique", async () => {
    await createBulkProxies("1.1.1.1:8080:u1:p1\n2.2.2.2:8080:u2:p2", US_ISP);

    const labels = (await prisma.proxy.findMany({ select: { label: true } })).map((p) => p.label);
    expect(new Set(labels).size).toBe(2);
  });

  it("explains an empty list instead of reporting zero successful proxies", async () => {
    const result = await createBulkProxies("   \n\n", US_ISP);

    expect(result.ok).toBe(false);
    expect(result.message).toContain("empty");
  });
});
