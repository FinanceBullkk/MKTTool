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
  it("thiếu biến giờ hẹn thì KHÔNG chạy và KHÔNG ghi sổ", async () => {
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

  it("chưa tới giờ hẹn thì chưa đụng gì tới sổ", async () => {
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

  it("tới giờ thì bắn một lượt và ghi sổ là ĐÃ BẮN", async () => {
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
  it("nhịp kế tiếp trong cùng ngày KHÔNG bắn lại", async () => {
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

  it("hôm sau thì bắn lượt mới", async () => {
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
  it("chưa có proxy quan sát viên thì KHÔNG sinh tiến trình, và sổ nói rõ vì sao", async () => {
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
    expect(row?.detail).toContain("proxy quan sát viên");
  });

  /**
   * Bỏ qua rồi thì **không thử lại mỗi phút**. Thứ đang chặn cần một người sửa, còn thử lại chỉ
   * đẻ ra mười lăm tiếng log rác che mất dòng đáng đọc.
   */
  it("đã bỏ qua thì nhịp sau không thử lại trong ngày", async () => {
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

  it("đang có lượt dò chạy dở thì bỏ qua, kèm câu nói ai đang giữ", async () => {
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
      expect(result.message).toContain(`tiến trình ${process.pid}`);
      expect(launcher.calls).toHaveLength(0);
    } finally {
      await held.release();
    }
  });

  it("sinh tiến trình hỏng thì ghi SKIPPED chứ không ghi ĐÃ BẮN", async () => {
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

  it("giờ hẹn khai sai dạng thì NÉM LỖI, không im lặng coi như tắt", async () => {
    await expect(
      tickDailyHealthCheck({ now: AFTER, env: { [DAILY_HEALTH_CHECK_ENV]: "9h00" } }),
    ).rejects.toThrow(/HH:MM/);
  });
});

describe("readDailyHealthCheckSchedule", () => {
  it("lịch tắt thì nói tắt, không nói lỗi", async () => {
    expect(await readDailyHealthCheckSchedule({})).toMatchObject({ at: null, configError: null });
  });

  it("khai sai thì trả về câu lỗi để hiện lên màn hình", async () => {
    const view = await readDailyHealthCheckSchedule({ [DAILY_HEALTH_CHECK_ENV]: "25:00" });

    expect(view.at).toBeNull();
    expect(view.configError).toContain("ngoài một ngày");
  });

  it("kèm theo lượt gần nhất trong sổ", async () => {
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
