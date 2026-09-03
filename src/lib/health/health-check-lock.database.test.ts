import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { prisma } from "@/lib/db/prisma-client";
import {
  HEALTH_CHECK_LOCK_KEY,
  HealthCheckBusyError,
  STALE_AFTER_MS,
  acquireHealthCheckLock,
  readHealthCheckLockStatus,
} from "./health-check-lock";

/**
 * Khóa này bảo vệ thứ đắt nhất của bộ dò: proxy quan sát viên. Hai lượt chồng nhau làm nó bắn
 * request dồn dập và bị Reddit chặn — nên mỗi nhánh dưới đây đều đáng test riêng.
 *
 * Chạy trên Postgres thật (xem vitest.global-setup.ts) chứ không giả lập Prisma: thứ đáng kiểm
 * nhất ở đây là **ràng buộc khóa chính có thật sự chặn lượt thứ hai không**. Giả lập Prisma chỉ
 * chứng minh được "mình gọi hàm đúng như mình nghĩ", mà chỗ hỏng thì nằm ở tầng database.
 *
 * So với bản khóa file, hai nhánh cũ biến mất và cả hai đều biến mất có lý do:
 *  - "tự tạo thư mục cha" — không còn thư mục nào.
 *  - "nội dung khóa hỏng thì coi là rác" — schema ép kiểu từng cột, nên không dựng nổi một hàng
 *    hỏng theo kiểu file JSON hỏng. Kiểu hỏng đó không còn tồn tại chứ không phải bị bỏ qua.
 */

const NOW = new Date("2026-08-03T04:00:00Z");

async function clearLock() {
  await prisma.healthCheckLock.deleteMany();
}

/** Đọc thẳng hàng khóa, không qua API — để kiểm cả những thứ API cố ý không lộ ra. */
function readRow() {
  return prisma.healthCheckLock.findUnique({ where: { key: HEALTH_CHECK_LOCK_KEY } });
}

beforeEach(clearLock);

afterAll(async () => {
  await clearLock();
  await prisma.$disconnect();
});

describe("acquireHealthCheckLock", () => {
  it("acquires and records the lock when it is free", async () => {
    const held = await acquireHealthCheckLock({ now: NOW });

    const row = await readRow();
    expect(row?.pid).toBe(process.pid);
    expect(row?.startedAt).toEqual(NOW);
    expect(row?.host).toBeTruthy();

    await held.release();
  });

  it("rejects a second run while the first is active", async () => {
    const first = await acquireHealthCheckLock({ now: NOW });
    try {
      await expect(acquireHealthCheckLock({ now: NOW })).rejects.toThrow(HealthCheckBusyError);
    } finally {
      await first.release();
    }
  });

  it("describes the host, process, and elapsed time in the busy error", async () => {
    const first = await acquireHealthCheckLock({ now: NOW });
    const later = new Date(NOW.getTime() + 5 * 60_000);

    try {
      await expect(acquireHealthCheckLock({ now: later })).rejects.toThrow(/5 minutes/);
      await expect(acquireHealthCheckLock({ now: later })).rejects.toThrow(
        new RegExp(`process ${process.pid}`),
      );
    } finally {
      await first.release();
    }
  });

  it("allows another run after release", async () => {
    const first = await acquireHealthCheckLock({ now: NOW });
    await first.release();

    expect(await readRow()).toBeNull();

    const second = await acquireHealthCheckLock({ now: NOW });
    await second.release();
  });

  it("takes over a stale orphaned lock", async () => {
    await acquireHealthCheckLock({ now: NOW }); // cố ý không thả — giả cảnh tiến trình bị giết
    const muchLater = new Date(NOW.getTime() + STALE_AFTER_MS + 60_000);

    const taken = await acquireHealthCheckLock({ now: muchLater });

    expect((await readRow())?.startedAt).toEqual(muchLater);
    await taken.release();
  });

  /**
   * Nhánh này là lý do cột `heartbeatAt` tồn tại.
   *
   * Ngưỡng mồ côi từng đo bằng `startedAt`, tức đo TỔNG thời gian chạy — mà thời gian chạy tăng
   * theo số nick (nghỉ 30-90 giây mỗi nick). Ở khoảng 20 nick, một lượt hoàn toàn bình thường
   * vượt 30 phút và lượt sau tưởng nó đã chết rồi chen vào chạy song song, đúng thứ khóa này sinh
   * ra để chặn. Nay chỉ cần lượt đang chạy còn đập nhịp là nó giữ được khóa, dù chạy bao lâu.
   */
  it("keeps a long-running lock active while heartbeats continue", async () => {
    const long = await acquireHealthCheckLock({ now: NOW });
    const wayPastStale = new Date(NOW.getTime() + STALE_AFTER_MS * 3);

    try {
      // Vẫn đang dò, vừa xong một nick.
      await long.renew(new Date(wayPastStale.getTime() - 60_000));

      await expect(acquireHealthCheckLock({ now: wayPastStale })).rejects.toThrow(
        HealthCheckBusyError,
      );
    } finally {
      await long.release();
    }
  });

  /** Ngừng đập nhịp = tiến trình đã chết. Đó mới là thứ đáng giành khóa. */
  it("takes over after heartbeats become stale", async () => {
    const dead = await acquireHealthCheckLock({ now: NOW });
    await dead.renew(new Date(NOW.getTime() + 60_000)); // nhịp cuối rồi tắt ngang

    const muchLater = new Date(NOW.getTime() + 60_000 + STALE_AFTER_MS + 1_000);
    const taken = await acquireHealthCheckLock({ now: muchLater });

    await taken.release();
  });

  /**
   * Nhịp tim phải khớp `token`, cùng lý do với `release()`: một lượt đã bị giành mất khóa mà còn
   * đập nhịp được vào hàng của chủ mới thì nó giữ hộ khóa cho một tiến trình không còn quyền,
   * và chủ mới bị đẩy sang mồ côi oan.
   */
  it("prevents an old owner from renewing a replaced lock", async () => {
    const stale = await acquireHealthCheckLock({ now: NOW });
    const muchLater = new Date(NOW.getTime() + STALE_AFTER_MS + 60_000);
    const fresh = await acquireHealthCheckLock({ now: muchLater });

    const before = (await readRow())?.heartbeatAt;
    await stale.renew(new Date(muchLater.getTime() + 10 * 60_000));

    expect((await readRow())?.heartbeatAt).toEqual(before);
    await fresh.release();
  });

  /** `startedAt` vẫn phải nói "giữ từ lúc nào" — nhịp tim không được nuốt mất câu đó. */
  it("keeps startedAt unchanged when renewing the heartbeat", async () => {
    const held = await acquireHealthCheckLock({ now: NOW });

    try {
      await held.renew(new Date(NOW.getTime() + 10 * 60_000));

      const row = await readRow();
      expect(row?.startedAt).toEqual(NOW);
      expect(row?.heartbeatAt).toEqual(new Date(NOW.getTime() + 10 * 60_000));
    } finally {
      await held.release();
    }
  });

  it("does not take over just before the stale threshold", async () => {
    const first = await acquireHealthCheckLock({ now: NOW });
    const justUnder = new Date(NOW.getTime() + STALE_AFTER_MS - 1_000);

    try {
      await expect(acquireHealthCheckLock({ now: justUnder })).rejects.toThrow(
        HealthCheckBusyError,
      );
    } finally {
      await first.release();
    }
  });

  /**
   * Nhánh quan trọng nhất của cả file: một lượt chạy quá hạn, bị lượt khác giành khóa, rồi mới
   * kết thúc. Nếu `release()` xóa theo khóa chính thay vì theo `token`, nó kéo theo lượt đang
   * chạy thật mất khóa giữa chừng — và hai lượt sau đó chồng nhau, đúng thứ cả module này sinh
   * ra để chặn.
   */
  it("does not delete a new owner's lock when the stale owner releases", async () => {
    const stale = await acquireHealthCheckLock({ now: NOW });
    const muchLater = new Date(NOW.getTime() + STALE_AFTER_MS + 60_000);
    const fresh = await acquireHealthCheckLock({ now: muchLater });

    await stale.release();

    // Khóa của chủ mới còn nguyên.
    expect((await readRow())?.startedAt).toEqual(muchLater);

    await fresh.release();
    expect(await readRow()).toBeNull();
  });

  it("allows release to be called twice", async () => {
    const held = await acquireHealthCheckLock({ now: NOW });

    await held.release();
    await expect(held.release()).resolves.toBeUndefined();
  });
});

describe("readHealthCheckLockStatus", () => {
  it("reports no active run when the lock is absent", async () => {
    expect(await readHealthCheckLockStatus({ now: NOW })).toMatchObject({
      running: false,
      host: null,
      pid: null,
    });
  });

  it("reports the host, process, and elapsed time for an active run", async () => {
    const held = await acquireHealthCheckLock({ now: NOW });
    const later = new Date(NOW.getTime() + 7 * 60_000);

    const status = await readHealthCheckLockStatus({ now: later });
    expect(status.running).toBe(true);
    expect(status.pid).toBe(process.pid);
    expect(status.minutesElapsed).toBe(7);
    expect(status.startedAt).toEqual(NOW);

    await held.release();
  });

  /**
   * Khóa mồ côi phải báo `running: false` — cùng ngưỡng với `acquire`. Hai ngưỡng riêng cho cùng
   * một khái niệm là hai thứ sớm muộn cũng lệch nhau, và lúc lệch thì giao diện nói "đang chạy"
   * trong khi bấm nút lại giành được khóa.
   */
  it("reports a stale lock as not running while retaining holder details", async () => {
    await acquireHealthCheckLock({ now: NOW });
    const muchLater = new Date(NOW.getTime() + STALE_AFTER_MS + 60_000);

    const status = await readHealthCheckLockStatus({ now: muchLater });
    expect(status.running).toBe(false);
    expect(status.pid).toBe(process.pid);
    expect(status.host).toBeTruthy();
  });

  it("reads lock status without taking ownership", async () => {
    const held = await acquireHealthCheckLock({ now: NOW });

    await readHealthCheckLockStatus({ now: NOW });

    expect((await readRow())?.startedAt).toEqual(NOW);
    await held.release();
  });
});
