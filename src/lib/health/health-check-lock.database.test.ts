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
  it("giành được khóa khi chưa ai giữ, và ghi đúng một hàng", async () => {
    const held = await acquireHealthCheckLock({ now: NOW });

    const row = await readRow();
    expect(row?.pid).toBe(process.pid);
    expect(row?.startedAt).toEqual(NOW);
    expect(row?.host).toBeTruthy();

    await held.release();
  });

  it("lượt thứ hai bị từ chối khi lượt đầu còn đang chạy", async () => {
    const first = await acquireHealthCheckLock({ now: NOW });
    try {
      await expect(acquireHealthCheckLock({ now: NOW })).rejects.toThrow(HealthCheckBusyError);
    } finally {
      await first.release();
    }
  });

  it("thông báo bận nói rõ máy nào, tiến trình nào, giữ bao lâu rồi", async () => {
    const first = await acquireHealthCheckLock({ now: NOW });
    const later = new Date(NOW.getTime() + 5 * 60_000);

    try {
      await expect(acquireHealthCheckLock({ now: later })).rejects.toThrow(/5 phút/);
      await expect(acquireHealthCheckLock({ now: later })).rejects.toThrow(
        new RegExp(`tiến trình ${process.pid}`),
      );
    } finally {
      await first.release();
    }
  });

  it("thả khóa xong thì lượt sau giành được", async () => {
    const first = await acquireHealthCheckLock({ now: NOW });
    await first.release();

    expect(await readRow()).toBeNull();

    const second = await acquireHealthCheckLock({ now: NOW });
    await second.release();
  });

  it("giành được khóa mồ côi để quá hạn", async () => {
    await acquireHealthCheckLock({ now: NOW }); // cố ý không thả — giả cảnh tiến trình bị giết
    const muchLater = new Date(NOW.getTime() + STALE_AFTER_MS + 60_000);

    const taken = await acquireHealthCheckLock({ now: muchLater });

    expect((await readRow())?.startedAt).toEqual(muchLater);
    await taken.release();
  });

  it("khóa vừa quá hạn một chút vẫn được tôn trọng, không giành ẩu", async () => {
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
  it("release() của lượt đã bị giành khóa không xóa khóa của chủ mới", async () => {
    const stale = await acquireHealthCheckLock({ now: NOW });
    const muchLater = new Date(NOW.getTime() + STALE_AFTER_MS + 60_000);
    const fresh = await acquireHealthCheckLock({ now: muchLater });

    await stale.release();

    // Khóa của chủ mới còn nguyên.
    expect((await readRow())?.startedAt).toEqual(muchLater);

    await fresh.release();
    expect(await readRow()).toBeNull();
  });

  it("release() gọi hai lần không ném lỗi", async () => {
    const held = await acquireHealthCheckLock({ now: NOW });

    await held.release();
    await expect(held.release()).resolves.toBeUndefined();
  });
});

describe("readHealthCheckLockStatus", () => {
  it("không có ai giữ thì báo không chạy", async () => {
    expect(await readHealthCheckLockStatus({ now: NOW })).toMatchObject({
      running: false,
      host: null,
      pid: null,
    });
  });

  it("đang có lượt chạy thì báo máy, tiến trình và số phút", async () => {
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
  it("khóa mồ côi báo là KHÔNG chạy, nhưng vẫn nói máy nào bỏ lại", async () => {
    await acquireHealthCheckLock({ now: NOW });
    const muchLater = new Date(NOW.getTime() + STALE_AFTER_MS + 60_000);

    const status = await readHealthCheckLockStatus({ now: muchLater });
    expect(status.running).toBe(false);
    expect(status.pid).toBe(process.pid);
    expect(status.host).toBeTruthy();
  });

  it("đọc trạng thái KHÔNG giành mất khóa của lượt đang chạy", async () => {
    const held = await acquireHealthCheckLock({ now: NOW });

    await readHealthCheckLockStatus({ now: NOW });

    expect((await readRow())?.startedAt).toEqual(NOW);
    await held.release();
  });
});
