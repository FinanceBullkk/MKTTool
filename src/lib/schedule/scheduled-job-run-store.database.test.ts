import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { prisma } from "@/lib/db/prisma-client";
import {
  claimScheduledRun,
  readScheduledJobRun,
  recordScheduledRunOutcome,
} from "./scheduled-job-run-store";

/**
 * Chạy trên Postgres thật chứ không giả lập Prisma: thứ đáng kiểm nhất ở đây là **điều kiện
 * `lastRunAt < scheduledFor` có thật sự chặn bản thứ hai không**. Giả lập chỉ chứng minh được
 * "mình gọi hàm đúng như mình nghĩ", mà chỗ hỏng thì nằm ở tầng database.
 */

const KEY = "test-job";
const SCHEDULED_FOR = new Date("2026-08-06T02:00:00Z"); // 09:00 giờ team
const NOW = new Date("2026-08-06T02:00:03Z");

async function clear() {
  await prisma.scheduledJobRun.deleteMany({ where: { key: KEY } });
}

beforeEach(clear);

afterAll(async () => {
  await clear();
  await prisma.$disconnect();
});

describe("claimScheduledRun", () => {
  it("claims the first run and creates the row", async () => {
    expect(await claimScheduledRun({ key: KEY, scheduledFor: SCHEDULED_FOR, now: NOW })).toBe(true);

    const row = await readScheduledJobRun(KEY);
    expect(row?.lastRunAt).toEqual(NOW);
    expect(row?.outcome).toBe("CLAIMED");
    expect(row?.host).toBeTruthy();
  });

  /**
   * Nhánh quan trọng nhất của cả file: hai bản sao của app cùng tick lúc 09:00. Hỏng ở đây nghĩa
   * là hai lượt dò chồng nhau — `HealthCheckLock` vẫn đỡ được, nhưng lượt thua sẽ chết lặng lẽ
   * bên trong một tiến trình con có `stdio: "ignore"`, và sổ này sẽ ghi "đã bắn" cho cả hai.
   */
  it("rejects a second claim for the SAME scheduled time", async () => {
    await claimScheduledRun({ key: KEY, scheduledFor: SCHEDULED_FOR, now: NOW });

    const second = await claimScheduledRun({
      key: KEY,
      scheduledFor: SCHEDULED_FOR,
      now: new Date(NOW.getTime() + 1_000),
      host: "other-machine",
    });

    expect(second).toBe(false);
    // Hàng vẫn thuộc về bản đầu — bản thua không được đụng vào.
    expect((await readScheduledJobRun(KEY))?.lastRunAt).toEqual(NOW);
  });

  it("allows exactly ONE winner among concurrent instances", async () => {
    const results = await Promise.all(
      Array.from({ length: 5 }, (_, index) =>
        claimScheduledRun({
          key: KEY,
          scheduledFor: SCHEDULED_FOR,
          now: new Date(NOW.getTime() + index),
          host: `machine-${index}`,
        }),
      ),
    );

    expect(results.filter(Boolean)).toHaveLength(1);
  });

  it("claims the NEXT DAY'S run even when the row already exists", async () => {
    await claimScheduledRun({ key: KEY, scheduledFor: SCHEDULED_FOR, now: NOW });

    const tomorrow = new Date(SCHEDULED_FOR.getTime() + 24 * 3_600_000);
    expect(await claimScheduledRun({ key: KEY, scheduledFor: tomorrow, now: tomorrow })).toBe(true);
    expect((await readScheduledJobRun(KEY))?.lastRunAt).toEqual(tomorrow);
  });

  it("clears the previous detail when claiming a new run", async () => {
    await claimScheduledRun({ key: KEY, scheduledFor: SCHEDULED_FOR, now: NOW });
    await recordScheduledRunOutcome(KEY, "SKIPPED", "observer proxy is missing");

    const tomorrow = new Date(SCHEDULED_FOR.getTime() + 24 * 3_600_000);
    await claimScheduledRun({ key: KEY, scheduledFor: tomorrow, now: tomorrow });

    // Giữ lại câu của hôm qua bên cạnh mốc của hôm nay là dựng ra một dòng nói dối trên màn hình.
    expect(await readScheduledJobRun(KEY)).toMatchObject({ outcome: "CLAIMED", detail: null });
  });
});

describe("recordScheduledRunOutcome", () => {
  it("updates outcome and detail while preserving the claimed timestamp", async () => {
    await claimScheduledRun({ key: KEY, scheduledFor: SCHEDULED_FOR, now: NOW });

    await recordScheduledRunOutcome(KEY, "LAUNCHED", "Started the health check in process 123.");

    expect(await readScheduledJobRun(KEY)).toMatchObject({
      lastRunAt: NOW,
      outcome: "LAUNCHED",
      detail: "Started the health check in process 123.",
    });
  });
});
