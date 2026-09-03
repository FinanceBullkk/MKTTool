/**
 * FINDING C31 — xóa nick đi qua đúng chốt canh bí mật của chính nick đó.
 *
 * Vì sao đáng một file riêng: mọi test xóa sẵn có đều chạy dưới một actor ADMIN, mà ADMIN thì
 * `requireNickOwner` cho qua ngay ở dòng đầu. Nói cách khác, cả bộ test cũ **không thể** thấy
 * chốt này có mặt hay không. Cần một actor OPERATOR mới soi được, và cần đổi được actor giữa các
 * test — nên mock ở đây đọc một biến thay vì trả một hằng.
 *
 * Điều đang giữ: xóa hàng này phá hủy mật khẩu nick, mật khẩu email và TOTP secret vùng operator
 * nằm trong chính nó. Ai không được đọc chúng thì không được hủy chúng.
 */
import { afterAll, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("next/cache", () => ({ revalidatePath: () => {} }));

const ADMIN = { userId: "admin-user", email: "admin@mkttool.local", role: "ADMIN" as const };
const OWNER = { userId: "owner-user", email: "owner@mkttool.local", role: "OPERATOR" as const };
const OTHER = { userId: "other-user", email: "other@mkttool.local", role: "OPERATOR" as const };

let actor: { userId: string; email: string; role: "ADMIN" | "OPERATOR" } = ADMIN;

vi.mock("@/lib/auth/require-actor", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/auth/require-actor")>()),
  requireActor: async () => actor,
}));

const { prisma } = await import("@/lib/db/prisma-client");
const { deleteAccount } = await import("./vault-delete-actions");

async function clearAll() {
  await prisma.account.deleteMany();
  await prisma.user.deleteMany();
}

/** Nick chưa có job hay tương tác nào — tức đúng loại nick còn xóa được. */
async function seedAccount(ownerId: string | null): Promise<string> {
  const account = await prisma.account.create({
    data: {
      platform: "REDDIT",
      username: `nick-${Math.random().toString(36).slice(2, 10)}`,
      emailAddress: "nick@example.com",
      emailPasswordEnc: "ciphertext",
      ownerId,
    },
  });
  return account.id;
}

beforeEach(async () => {
  await clearAll();
  for (const user of [ADMIN, OWNER, OTHER]) {
    await prisma.user.create({
      data: { id: user.userId, name: user.userId, email: user.email, role: user.role },
    });
  }
  actor = ADMIN;
});

afterAll(async () => {
  await clearAll();
});

describe("delete nick ownership boundary", () => {
  it("prevents a non-owner from deleting another operator's nick", async () => {
    const accountId = await seedAccount(OWNER.userId);
    actor = OTHER;

    const result = await deleteAccount(accountId);

    expect(result.ok).toBe(false);
    // Quan trọng hơn cả câu thông báo: hàng vẫn còn, tức bí mật trong nó chưa mất.
    expect(await prisma.account.count({ where: { id: accountId } })).toBe(1);
  });

  it("allows the nick owner to delete their own nick", async () => {
    const accountId = await seedAccount(OWNER.userId);
    actor = OWNER;

    expect((await deleteAccount(accountId)).ok).toBe(true);
    expect(await prisma.account.count({ where: { id: accountId } })).toBe(0);
  });

  it("allows ADMIN to delete another operator's nick", async () => {
    const accountId = await seedAccount(OWNER.userId);
    actor = ADMIN;

    expect((await deleteAccount(accountId)).ok).toBe(true);
  });

  /**
   * Nick chưa phân công là ca dễ hở nhất: không có chủ thì "chủ nick" không chặn được ai. Chốt
   * mặc định ĐÓNG — chỉ ADMIN — cùng cách `requireNickOwner` xử ca này cho đường đọc bí mật.
   */
  it("denies OPERATOR but allows ADMIN for an ownerless nick", async () => {
    const orphan = await seedAccount(null);
    actor = OTHER;
    expect((await deleteAccount(orphan)).ok).toBe(false);
    expect(await prisma.account.count({ where: { id: orphan } })).toBe(1);

    actor = ADMIN;
    expect((await deleteAccount(orphan)).ok).toBe(true);
  });
});
