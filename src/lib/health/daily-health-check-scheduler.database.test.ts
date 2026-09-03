import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { prisma } from "@/lib/db/prisma-client";
import { readScheduledJobRun } from "@/lib/schedule/scheduled-job-run-store";
import {
  DAILY_HEALTH_CHECK_ENV,
  DAILY_HEALTH_CHECK_JOB_KEY,
  readDailyHealthCheckSchedule,
  tickDailyHealthCheck,
} from "./daily-health-check-scheduler";
import { acquireHealthCheckLock } from "./health-check-lock";

/**
 * Bộ lịch chạm ba thứ ngoài nó: sổ `ScheduledJobRun`, khóa chống chạy chồng, và lệnh sinh tiến
 * trình. Hai thứ đầu là database thật ở đây — chúng chính là chỗ dễ hỏng. Thứ ba tiêm vào, vì
 * test không có việc gì phải sinh một tiến trình Playwright mười phút.
 */

/** 09:00 giờ team = 02:00Z. */
const AT_9 = { [DAILY_HEALTH_CHECK_ENV]: "09:00" };
const BEFORE = new Date("2026-08-06T01:30:00Z");
const AFTER = new Date("2026-08-06T02:00:30Z");

/** Bộ đếm lượt sinh tiến trình — thứ duy nhất đáng đếm, vì nó là hành động thật sự tốn kém. */
function fakeLauncher(pid: number | null = 4242) {
  const calls: number[] = [];
  return {
    calls,
    launch: () => {
      calls.push(1);
      return { pid };
    },
  };
}

const observers = (count: number) => () => Promise.resolve(count);

async function clear() {
  await prisma.scheduledJobRun.deleteMany({ where: { key: DAILY_HEALTH_CHECK_JOB_KEY } });
  await prisma.healthCheckLock.deleteMany();
}

beforeEach(clear);

afterAll(async () => {
  await clear();
  await prisma.$disconnect();
});

describe("tickDailyHealthCheck", () => {
  it("does not run or record when the schedule is disabled", async () => {
    const launcher = fakeLauncher();

    const result = await tickDailyHealthCheck({
      now: AFTER,
      env: {},
      launch: launcher.launch,
      countActiveObserverProxies: observers(1),
    });

    expect(result.status).toBe("disabled");
    expect(launcher.calls).toHaveLength(0);
    expect(await readScheduledJobRun(DAILY_HEALTH_CHECK_JOB_KEY)).toBeNull();
  });

  it("does not write a record before the scheduled time", async () => {
    const launcher = fakeLauncher();

    const result = await tickDailyHealthCheck({
      now: BEFORE,
      env: AT_9,
      launch: launcher.launch,
      countActiveObserverProxies: observers(1),
    });

    expect(result.status).toBe("too-early");
    expect(launcher.calls).toHaveLength(0);
    expect(await readScheduledJobRun(DAILY_HEALTH_CHECK_JOB_KEY)).toBeNull();
  });

  it("starts and records a run at the scheduled time", async () => {
    const launcher = fakeLauncher(777);

    const result = await tickDailyHealthCheck({
      now: AFTER,
      env: AT_9,
      launch: launcher.launch,
      countActiveObserverProxies: observers(1),
    });

    expect(result.status).toBe("launched");
    expect(launcher.calls).toHaveLength(1);
    expect(await readScheduledJobRun(DAILY_HEALTH_CHECK_JOB_KEY)).toMatchObject({
      outcome: "LAUNCHED",
      lastRunAt: AFTER,
    });
    expect((await readScheduledJobRun(DAILY_HEALTH_CHECK_JOB_KEY))?.detail).toContain("777");
  });

  /**
   * Nhịp một phút nghĩa là hàm này chạy 1440 lần mỗi ngày. Bắn quá một lượt là bắn 1440 lượt.
   */
  it("does not start another run later on the same day", async () => {
    const launcher = fakeLauncher();
    const tick = (now: Date) =>
      tickDailyHealthCheck({
        now,
        env: AT_9,
        launch: launcher.launch,
        countActiveObserverProxies: observers(1),
      });

    await tick(AFTER);
    const second = await tick(new Date(AFTER.getTime() + 60_000));
    const third = await tick(new Date(AFTER.getTime() + 6 * 3_600_000));

    expect(second.status).toBe("already-decided");
    expect(third.status).toBe("already-decided");
    expect(launcher.calls).toHaveLength(1);
  });

  it("starts a new run on the next day", async () => {
    const launcher = fakeLauncher();
    const tick = (now: Date) =>
      tickDailyHealthCheck({
        now,
        env: AT_9,
        launch: launcher.launch,
        countActiveObserverProxies: observers(1),
      });

    await tick(AFTER);
    const tomorrow = await tick(new Date(AFTER.getTime() + 24 * 3_600_000));

    expect(tomorrow.status).toBe("launched");
    expect(launcher.calls).toHaveLength(2);
  });

  /**
   * Không có proxy quan sát viên thì tiến trình dò chết ngay dòng đầu, mà `stdio: "ignore"` nuốt
   * sạch câu lỗi — sổ sẽ ghi "đã bắn" cho một thứ chưa từng chạy. Phải chặn TRƯỚC khi sinh.
   */
  it("skips without an observer proxy and records the reason", async () => {
    const launcher = fakeLauncher();

    const result = await tickDailyHealthCheck({
      now: AFTER,
      env: AT_9,
      launch: launcher.launch,
      countActiveObserverProxies: observers(0),
    });

    expect(result.status).toBe("skipped");
    expect(launcher.calls).toHaveLength(0);
    const row = await readScheduledJobRun(DAILY_HEALTH_CHECK_JOB_KEY);
    expect(row?.outcome).toBe("SKIPPED");
    expect(row?.detail).toContain("observer proxy");
  });

  /**
   * Bỏ qua rồi thì **không thử lại mỗi phút**. Thứ đang chặn cần một người sửa, còn thử lại chỉ
   * đẻ ra mười lăm tiếng log rác che mất dòng đáng đọc.
   */
  it("does not retry a skipped run later on the same day", async () => {
    const launcher = fakeLauncher();
    const tick = (now: Date, count: number) =>
      tickDailyHealthCheck({
        now,
        env: AT_9,
        launch: launcher.launch,
        countActiveObserverProxies: observers(count),
      });

    await tick(AFTER, 0);
    // Proxy được khai ngay sau đó — vẫn không bắn bù, tới mai mới tới lượt.
    const next = await tick(new Date(AFTER.getTime() + 60_000), 1);

    expect(next.status).toBe("already-decided");
    expect(launcher.calls).toHaveLength(0);
  });

  /**
   * Khóa được giành với mốc **tương đối so với `AFTER`**, không phải `new Date()`. Cả bài test
   * chạy trên một đồng hồ giả, và tuổi khóa phải đo bằng chính đồng hồ đó — nếu không thì "khóa
   * mới hai phút" biến thành "khóa mồ côi" ngay khi giờ thật trôi quá 30 phút so với mốc giả.
   *
   * Đúng cái bẫy đã làm CI đỏ 06/08/2026, trong khi máy dev xanh vì lượt chạy rơi trúng khung 30
   * phút đó. Thứ sửa nó là `tickDailyHealthCheck` truyền `now` xuống `readHealthCheckLockStatus`.
   */
  it("skips an overlapping run and identifies the lock holder", async () => {
    const launcher = fakeLauncher();
    const held = await acquireHealthCheckLock({ now: new Date(AFTER.getTime() - 120_000) });

    try {
      const result = await tickDailyHealthCheck({
        now: AFTER,
        env: AT_9,
        launch: launcher.launch,
        countActiveObserverProxies: observers(1),
      });

      expect(result.status).toBe("skipped");
      expect(result.message).toContain(`process ${process.pid}`);
      expect(launcher.calls).toHaveLength(0);
    } finally {
      await held.release();
    }
  });

  it("records SKIPPED instead of LAUNCHED when process creation fails", async () => {
    const launcher = fakeLauncher(null);

    const result = await tickDailyHealthCheck({
      now: AFTER,
      env: AT_9,
      launch: launcher.launch,
      countActiveObserverProxies: observers(1),
    });

    expect(result.status).toBe("skipped");
    expect((await readScheduledJobRun(DAILY_HEALTH_CHECK_JOB_KEY))?.outcome).toBe("SKIPPED");
  });

  it("throws for an invalid schedule instead of treating it as disabled", async () => {
    await expect(
      tickDailyHealthCheck({ now: AFTER, env: { [DAILY_HEALTH_CHECK_ENV]: "9h00" } }),
    ).rejects.toThrow(/HH:MM/);
  });
});

describe("readDailyHealthCheckSchedule", () => {
  it("reports a disabled schedule without a configuration error", async () => {
    expect(await readDailyHealthCheckSchedule({})).toMatchObject({ at: null, configError: null });
  });

  it("returns an invalid schedule error for the UI", async () => {
    const view = await readDailyHealthCheckSchedule({ [DAILY_HEALTH_CHECK_ENV]: "25:00" });

    expect(view.at).toBeNull();
    expect(view.configError).toContain("25:00");
    expect(view.configError).toContain("0-23");
    expect(view.configError).toContain("0-59");
  });

  it("includes the latest scheduled run in the schedule view", async () => {
    await tickDailyHealthCheck({
      now: AFTER,
      env: AT_9,
      launch: fakeLauncher().launch,
      countActiveObserverProxies: observers(1),
    });

    const view = await readDailyHealthCheckSchedule(AT_9);
    expect(view.at).toEqual({ hour: 9, minute: 0 });
    expect(view.lastRun).toMatchObject({ outcome: "LAUNCHED", lastRunAt: AFTER });
  });
});
