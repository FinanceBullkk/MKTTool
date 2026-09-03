/**
 * Kho proxy: **ghi thì chỉ ADMIN, đọc và kiểm thì ai cũng được.**
 *
 * Ranh giới này là một quyết định, và nó cắt ngang giữa hai nút nằm cạnh nhau trên cùng một
 * dòng bảng — nên nó cần test canh cả hai phía:
 *
 * - Siết quá tay (gác luôn nút "Kiểm") thì người đang xử lý sự cố proxy chết phải đi tìm ADMIN,
 *   và cách nhanh nhất để hết phiền là gỡ phép gác.
 * - Nới ra thì một lượt bấm nhầm xóa mất mật khẩu proxy — thứ không nằm ở đâu khác ngoài cột
 *   `passwordEnc` của hàng đó, và nhà cung cấp cấp lại thì ra IP khác.
 *
 * Phiên là OPERATOR: đây là vai bị chặn, và cũng là vai duy nhất chứng minh được ranh giới.
 * `guarded-entry-points.test.ts` đọc hình dạng mã nguồn nên nó chứng minh phần "đã có wrapper";
 * file này chứng minh phần "wrapper đúng loại".
 */
import { afterAll, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("next/cache", () => ({ revalidatePath: () => {} }));

const OPERATOR_EMAIL = "operator@mkttool.local";

process.env.VAULT_KEY_SERVER = "27112efee5aeaa94963b0f1f9e0dabcdf2767c34ee483d8dc2c76f61bdd1186d";
process.env.VAULT_KEY_OPERATOR = "a3d1e1576b7746dbd4481fb6fd16b16f7c7381301b8ab9ef8a3f2994c96150dc";
process.env.ALLOWED_EMAILS = `admin@mkttool.local,${OPERATOR_EMAIL}`;
process.env.ADMIN_EMAILS = "admin@mkttool.local";

/**
 * Thay **nguồn danh tính**, không thay lớp gác.
 *
 * Các test kho khác mock thẳng `require-actor`, nhưng ở đây làm vậy là tự tắt đúng thứ đang
 * kiểm: `adminAction` gọi `requireAdmin`, mà `requireAdmin` là nơi phép so vai trò nằm. Mock nó
 * thì bài test chỉ còn chứng minh bản mock trả về cái gì.
 *
 * Nên thay hai thứ nằm dưới nó: phiên đăng nhập (`getAuth`) và `next/headers`. Toàn bộ
 * `checkActor` → `roleForEmail` → `requireAdmin` chạy bằng mã thật, và vai OPERATOR được suy ra
 * đúng cách nó suy lúc chạy thật — từ việc email này không có trong `ADMIN_EMAILS`.
 */
vi.mock("next/headers", () => ({ headers: async () => new Headers() }));

vi.mock("@/lib/auth/auth-server", () => ({
  getAuth: () => ({
    api: {
      getSession: async () => ({ user: { id: "user-operator", email: OPERATOR_EMAIL } }),
    },
  }),
}));

const { prisma } = await import("@/lib/db/prisma-client");
const { encryptCredential } = await import("@/lib/crypto/credential-encryption");
const { loadVaultKey } = await import("@/lib/crypto/encryption-key-loader");
const { createProxy } = await import("@/lib/accounts/vault-create-actions");
const { updateProxy } = await import("@/lib/accounts/vault-update-actions");
const { deleteProxy } = await import("@/lib/accounts/vault-delete-actions");
const { measureOneProxySpeed } = await import("./proxy-bandwidth-actions");

let proxyId: string;

function proxyForm(fields: Record<string, string>): FormData {
  const form = new FormData();
  for (const [key, value] of Object.entries(fields)) form.set(key, value);
  return form;
}

/** Mọi lối ghi phải trả về lời từ chối, không phải ném lỗi trần — xem `guarded-action.ts`. */
function expectRefused(result: { ok: boolean; message?: string }) {
  expect(result.ok).toBe(false);
  expect(result.message).toContain("administrator");
}

beforeEach(async () => {
  await prisma.account.deleteMany();
  await prisma.proxy.deleteMany();

  const proxy = await prisma.proxy.create({
    data: {
      label: "Webshare-01",
      host: "1.2.3.4",
      port: 8080,
      username: "user",
      passwordEnc: encryptCredential("mat-khau-proxy", loadVaultKey("server")),
      country: "US",
      protocol: "http",
    },
  });
  proxyId = proxy.id;
});

afterAll(async () => {
  await prisma.$disconnect();
});

describe("OPERATOR cannot write to the proxy inventory", () => {
  it("rejects adding a proxy without creating a row", async () => {
    const result = await createProxy(
      null,
      proxyForm({
        label: "Manually added",
        host: "9.9.9.9",
        port: "9999",
        username: "u",
        password: "p",
        country: "VN",
        protocol: "http",
      }),
    );

    expectRefused(result);
    expect(await prisma.proxy.count()).toBe(1);
  });

  it("rejects editing a proxy and keeps the host unchanged", async () => {
    const result = await updateProxy(
      null,
      proxyForm({
        id: proxyId,
        label: "Webshare-01",
        host: "6.6.6.6",
        port: "8080",
        username: "user",
        country: "US",
        protocol: "http",
      }),
    );

    expectRefused(result);
    const sau = await prisma.proxy.findUniqueOrThrow({ where: { id: proxyId } });
    expect(sau.host).toBe("1.2.3.4");
  });

  /**
   * Ca đắt nhất: mật khẩu proxy không có bản thứ hai ở đâu cả, nên hàng bị xóa là tiền mất.
   * Lớp "còn nick gắn thì không xóa" không đỡ được ca này — proxy dự phòng chưa gắn ai vẫn là
   * proxy đã trả tiền.
   */
  it("rejects deleting a proxy with NO ASSIGNED NICK and keeps the row", async () => {
    const result = await deleteProxy(proxyId);

    expectRefused(result);
    expect(await prisma.proxy.findUnique({ where: { id: proxyId } })).not.toBeNull();
  });

  it("rejects speed tests because each run consumes 1 MB of paid quota", async () => {
    const result = await measureOneProxySpeed(proxyId);

    expectRefused(result);
    // Không được ghi mốc đo: ghi tức là khai đã đo, mà chưa gửi đi byte nào.
    const sau = await prisma.proxy.findUniqueOrThrow({ where: { id: proxyId } });
    expect(sau.lastSpeedAt).toBeNull();
  });
});

describe("OPERATOR can still check a proxy", () => {
  /**
   * Phía còn lại của ranh giới. Kiểm proxy còn sống tốn vài KB và là thứ cần bấm đúng lúc đang
   * gấp — gác nó lại là bắt người đang xử lý sự cố đi tìm ADMIN, và nút đó sẽ bị gỡ gác.
   *
   * Chỉ kiểm rằng lời gọi **không bị chặn vì vai trò**: nó đi tới tận phép đo mạng thật, mà
   * proxy 1.2.3.4 thì không tồn tại nên kết quả là "chết" — đúng một kết luận về proxy, không
   * phải một lời từ chối quyền.
   */
  it("does not require ADMIN for checkOneProxy", async () => {
    const { checkOneProxy } = await import("./proxy-check-actions");

    const result = await checkOneProxy(proxyId);

    expect(result.message).not.toContain("qu\u1ea3n tr\u1ecb vi\u00ean");
  }, 30_000);
});
