import { writeFile } from "node:fs/promises";
import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { prisma } from "@/lib/db/prisma-client";
import { readScheduledJobRun } from "@/lib/schedule/scheduled-job-run-store";
import {
  DAILY_BACKUP_ENV,
  DAILY_BACKUP_JOB_KEY,
  backupObjectKey,
  readDailyBackupSchedule,
  tickDailyBackup,
} from "./daily-backup-scheduler";
import { R2_ENV } from "../r2/r2-config";

/**
 * `pg_dump` và mạng đều tiêm vào — test không có việc gì gọi Postgres bằng tiến trình con hay
 * bắn request thật lên Cloudflare. Thứ đáng kiểm ở đây là **quyết định**: khi nào bắn, khi nào
 * bỏ, và cái gì được ghi vào sổ khi hỏng.
 */

/** 03:00 giờ team = 20:00Z hôm trước. */
const AT_3 = { [DAILY_BACKUP_ENV]: "03:00" };
const R2 = {
  [R2_ENV.accountId]: "acc123",
  [R2_ENV.bucket]: "mkttool-backup",
  [R2_ENV.accessKeyId]: "key",
  [R2_ENV.secretAccessKey]: "secret",
};
const ENV = { ...AT_3, ...R2 };

const BEFORE = new Date("2026-08-05T19:30:00Z");
const AFTER = new Date("2026-08-05T20:00:30Z");

const DUMP_WITH_ROWS = [
  'COPY public."Proxy" (id, host) FROM stdin;',
  "cm1\t1.2.3.4",
  "\\.",
  "",
].join("\n");

const DUMP_EMPTY = 'CREATE TABLE public."Proxy" (id text);\n';

function recorder(sql = DUMP_WITH_ROWS) {
  const uploads: { key: string; size: number }[] = [];
  return {
    uploads,
    dumpTo: async (filePath: string) => {
      await writeFile(filePath, sql, "utf8");
    },
    upload: async ({ key, body }: { key: string; body: Buffer }) => {
      uploads.push({ key, size: body.length });
    },
  };
}

async function clear() {
  await prisma.scheduledJobRun.deleteMany({ where: { key: DAILY_BACKUP_JOB_KEY } });
}

beforeEach(clear);

afterAll(async () => {
  await clear();
  await prisma.$disconnect();
});

describe("backupObjectKey", () => {
  /**
   * Gom theo tháng của **giờ team**. 20:00Z ngày 31/07 đã là 03:00 sáng 01/08 ở Việt Nam — lấy
   * tháng theo UTC thì bản sao đầu tháng rơi nhầm vào thư mục tháng trước, mỗi tháng một lần.
   */
  it("groups by year and month in team time rather than UTC", () => {
    expect(backupObjectKey(new Date("2026-07-31T20:00:00Z"))).toBe(
      "mkttool/2026-08/mkttool-prod-20260801-030000.sql",
    );
  });

  it("sorts filenames chronologically when sorted lexically", () => {
    const sớm = backupObjectKey(new Date("2026-08-05T20:00:00Z"));
    const muộn = backupObjectKey(new Date("2026-08-06T20:00:00Z"));

    expect(sớm < muộn).toBe(true);
  });
});

describe("tickDailyBackup", () => {
  it("stays disabled without a scheduled time and does not touch the ledger", async () => {
    const r = recorder();
    const result = await tickDailyBackup({ now: AFTER, env: R2, ...r });

    expect(result.status).toBe("disabled");
    expect(await readScheduledJobRun(DAILY_BACKUP_JOB_KEY)).toBeNull();
  });

  it("stays disabled when a scheduled time exists but R2 is not configured", async () => {
    const r = recorder();
    const result = await tickDailyBackup({ now: AFTER, env: AT_3, ...r });

    expect(result.status).toBe("disabled");
    expect(r.uploads).toHaveLength(0);
  });

  it("THROWS for a partial R2 configuration instead of silently disabling", async () => {
    const nửa = { ...AT_3, [R2_ENV.accountId]: "acc123", [R2_ENV.bucket]: "b" };

    await expect(tickDailyBackup({ now: AFTER, env: nửa, ...recorder() })).rejects.toThrow(
      /configuration is missing/,
    );
  });

  it("does not touch the ledger before the scheduled time", async () => {
    const r = recorder();
    const result = await tickDailyBackup({ now: BEFORE, env: ENV, ...r });

    expect(result.status).toBe("too-early");
    expect(await readScheduledJobRun(DAILY_BACKUP_JOB_KEY)).toBeNull();
  });

  it("uploads and records the run when due", async () => {
    const r = recorder();
    const result = await tickDailyBackup({ now: AFTER, env: ENV, ...r });

    expect(result.status).toBe("uploaded");
    expect(r.uploads).toHaveLength(1);
    expect(r.uploads[0].key).toBe("mkttool/2026-08/mkttool-prod-20260806-030030.sql");

    const row = await readScheduledJobRun(DAILY_BACKUP_JOB_KEY);
    expect(row?.outcome).toBe("LAUNCHED");
    expect(row?.detail).toContain("1 row across 1 table");
  });

  it("does NOT upload again on the next tick that day", async () => {
    const r = recorder();
    await tickDailyBackup({ now: AFTER, env: ENV, ...r });
    const second = await tickDailyBackup({
      now: new Date(AFTER.getTime() + 60_000),
      env: ENV,
      ...r,
    });

    expect(second.status).toBe("already-decided");
    expect(r.uploads).toHaveLength(1);
  });

  /**
   * Nhánh quan trọng nhất của cả file. `pg_dump` chạy trên một database rỗng vẫn cho ra file .sql
   * hợp lệ đủ cấu trúc bảng — tải nó lên rồi ghi "thành công" là dựng ra đúng thứ nguy hiểm nhất
   * mà tính năng này sinh ra để tránh: một bản sao lưu trông như thật.
   */
  it("does NOT upload an empty dump and records failure", async () => {
    const r = recorder(DUMP_EMPTY);
    const result = await tickDailyBackup({ now: AFTER, env: ENV, ...r });

    expect(result.status).toBe("failed");
    expect(r.uploads).toHaveLength(0);
    expect((await readScheduledJobRun(DAILY_BACKUP_JOB_KEY))?.detail).toContain(
      "NO data rows",
    );
  });

  it("records the full R2 rejection instead of swallowing it", async () => {
    const r = recorder();
    const result = await tickDailyBackup({
      now: AFTER,
      env: ENV,
      dumpTo: r.dumpTo,
      upload: () => Promise.reject(new Error("R2 rejected the request (HTTP 403): SignatureDoesNotMatch")),
    });

    expect(result.status).toBe("failed");
    const row = await readScheduledJobRun(DAILY_BACKUP_JOB_KEY);
    expect(row?.outcome).toBe("SKIPPED");
    expect(row?.detail).toContain("SignatureDoesNotMatch");
  });

  /** Hỏng rồi thì tới mai mới thử lại — thứ đang chặn cần một người sửa. */
  it("does not retry later the same day after a failure", async () => {
    const r = recorder();
    await tickDailyBackup({
      now: AFTER,
      env: ENV,
      dumpTo: r.dumpTo,
      upload: () => Promise.reject(new Error("network failure")),
    });

    const next = await tickDailyBackup({
      now: new Date(AFTER.getTime() + 60_000),
      env: ENV,
      ...r,
    });

    expect(next.status).toBe("already-decided");
    expect(r.uploads).toHaveLength(0);
  });
});

describe("readDailyBackupSchedule", () => {
  it("distinguishes a missing scheduled time from missing R2 configuration", async () => {
    expect(await readDailyBackupSchedule(R2)).toMatchObject({ at: null, r2Configured: true });
    expect(await readDailyBackupSchedule(AT_3)).toMatchObject({ r2Configured: false });
  });

  it("returns a displayable error for a partial R2 configuration", async () => {
    const view = await readDailyBackupSchedule({ ...AT_3, [R2_ENV.bucket]: "b" });

    expect(view.configError).toContain("configuration is missing");
  });
});
