import { existsSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { prisma } from "@/lib/db/prisma-client";
import { SCREENSHOT_RETENTION_DAYS, pruneOldScreenshots } from "./screenshot-retention";

/**
 * Chạy trên SQLite thật (xem vitest.global-setup.ts) vì điều đáng kiểm nhất không phải là
 * "có xóa file không" mà là "đĩa và database có còn khớp nhau sau khi xóa không".
 *
 * Ảnh giả để ở thư mục tạm của hệ điều hành, KHÔNG ở `.test-tmp/`: chỗ đó do global setup sở
 * hữu và xóa lúc kết thúc, hai bên cùng xóa một cây thư mục thì Windows trả EPERM.
 */

const NOW = new Date("2026-08-03T04:00:00Z");
const DAY = 86_400_000;

let DIR: string;

async function clearAll() {
  await prisma.healthCheck.deleteMany();
  await prisma.account.deleteMany();
  await prisma.proxy.deleteMany();
  await prisma.persona.deleteMany();
}

async function seedAccount(): Promise<string> {
  const persona = await prisma.persona.create({
    data: { name: "retention-persona", voice: "v", contentAngle: "c" },
  });
  const proxy = await prisma.proxy.create({
    data: {
      label: "retention-proxy",
      host: "10.9.9.9",
      port: 1234,
      username: "u",
      passwordEnc: "x",
      country: "GB",
    },
  });
  const account = await prisma.account.create({
    data: {
      platform: "REDDIT",
      username: "retention-nick",
      passwordEnc: "x",
      emailAddress: "a@example.com",
      emailPasswordEnc: "x",
      antidetectProfileId: "retention-profile",
      personaId: persona.id,
      proxyId: proxy.id,
    },
  });
  return account.id;
}

/** Tạo một bản ghi dò kèm file ảnh thật trên đĩa. */
async function seedCheck(accountId: string, name: string, ageDays: number, withFile = true) {
  const filePath = path.join(DIR, `${name}.png`);
  if (withFile) writeFileSync(filePath, "anh-gia");

  return prisma.healthCheck.create({
    data: {
      accountId,
      checkedAt: new Date(NOW.getTime() - ageDays * DAY),
      verdict: "SHADOWBANNED",
      screenshotPath: filePath,
    },
  });
}

let accountId: string;

beforeEach(async () => {
  if (DIR) rmSync(DIR, { recursive: true, force: true });
  DIR = mkdtempSync(path.join(tmpdir(), "mkttool-shot-"));
  await clearAll();
  accountId = await seedAccount();
});

afterAll(async () => {
  if (DIR) rmSync(DIR, { recursive: true, force: true });
  await clearAll();
});

describe("pruneOldScreenshots", () => {
  it("xóa ảnh quá hạn, giữ ảnh còn hạn", async () => {
    const old = await seedCheck(accountId, "cu", SCREENSHOT_RETENTION_DAYS + 5);
    const recent = await seedCheck(accountId, "moi", 2);

    const result = await pruneOldScreenshots({ now: NOW });

    expect(result.deleted).toBe(1);
    expect(existsSync(path.join(DIR, "cu.png"))).toBe(false);
    expect(existsSync(path.join(DIR, "moi.png"))).toBe(true);

    // Đĩa và database phải khớp: file mất thì đường dẫn cũng phải mất.
    const afterOld = await prisma.healthCheck.findUniqueOrThrow({ where: { id: old.id } });
    const afterRecent = await prisma.healthCheck.findUniqueOrThrow({ where: { id: recent.id } });
    expect(afterOld.screenshotPath).toBeNull();
    expect(afterRecent.screenshotPath).not.toBeNull();
  });

  /** Ảnh hết hạn được, nhưng lịch sử kết luận thì không — đó là thứ vẽ ra xu hướng. */
  it("giữ nguyên bản ghi dò, chỉ gỡ đường dẫn ảnh", async () => {
    await seedCheck(accountId, "cu", SCREENSHOT_RETENTION_DAYS + 5);

    await pruneOldScreenshots({ now: NOW });

    const checks = await prisma.healthCheck.findMany();
    expect(checks).toHaveLength(1);
    expect(checks[0].verdict).toBe("SHADOWBANNED");
  });

  it("bản ghi trỏ tới file đã biến mất vẫn được gỡ đường dẫn", async () => {
    const orphan = await seedCheck(accountId, "mat-tu-truoc", SCREENSHOT_RETENTION_DAYS + 5, false);

    const result = await pruneOldScreenshots({ now: NOW });

    expect(result.deleted).toBe(0);
    expect(result.alreadyGone).toBe(1);
    const after = await prisma.healthCheck.findUniqueOrThrow({ where: { id: orphan.id } });
    expect(after.screenshotPath).toBeNull();
  });

  it("không có gì quá hạn thì không đụng vào đâu cả", async () => {
    await seedCheck(accountId, "moi", 1);

    const result = await pruneOldScreenshots({ now: NOW });

    expect(result).toEqual({ deleted: 0, alreadyGone: 0 });
    expect(existsSync(path.join(DIR, "moi.png"))).toBe(true);
  });

  it("đúng mốc hạn thì chưa xóa", async () => {
    await seedCheck(accountId, "vua-du", SCREENSHOT_RETENTION_DAYS);
    const result = await pruneOldScreenshots({ now: NOW });
    expect(result.deleted).toBe(0);
  });

  it("chỉnh được số ngày giữ", async () => {
    await seedCheck(accountId, "ba-ngay", 3);
    const result = await pruneOldScreenshots({ now: NOW, retentionDays: 2 });
    expect(result.deleted).toBe(1);
  });
});
