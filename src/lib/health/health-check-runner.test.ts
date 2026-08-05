import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { prisma } from "@/lib/db/prisma-client";
import { HealthCheckBusyError, acquireHealthCheckLock } from "./health-check-lock";
import { runHealthCheck } from "./health-check-runner";

/**
 * Kiểm đúng một điều, nhưng là điều dễ quên nhất khi nối khóa vào: runner có THẬT SỰ giành khóa
 * không, và giành TRƯỚC khi mở trình duyệt hay hỏi database chưa.
 *
 * Nếu khóa được giành muộn — sau khi đã mở Chromium chẳng hạn — thì hai lượt vẫn kịp bắn request
 * chồng nhau đúng vào lúc nguy hiểm, và một test chỉ nhìn "có ném lỗi không" sẽ vẫn xanh.
 *
 * Từ lúc khóa chuyển từ file sang một hàng trong database, file này dọn bảng khóa thay vì dọn
 * thư mục tạm. Nó vốn đã cần Postgres thật: nhánh "chưa có proxy quan sát viên" là một truy vấn
 * thật, và chính nó là thứ chứng minh khóa được giành TRƯỚC truy vấn đó.
 */

beforeEach(async () => {
  await prisma.healthCheckLock.deleteMany();
});

afterAll(async () => {
  await prisma.healthCheckLock.deleteMany();
});

describe("runHealthCheck — khóa chống chạy chồng", () => {
  it("từ chối khi đã có lượt khác giữ khóa", async () => {
    const held = await acquireHealthCheckLock();
    try {
      await expect(runHealthCheck()).rejects.toThrow(HealthCheckBusyError);
    } finally {
      await held.release();
    }
  });

  /**
   * Giành khóa phải xảy ra TRƯỚC khi hỏi proxy quan sát viên. Kiểm gián tiếp bằng thông báo lỗi:
   * nếu thứ tự đúng thì lỗi nói "đang có lượt chạy dở", chứ không phải "chưa có proxy quan sát
   * viên" — dù trong database quả thật chưa có proxy nào.
   */
  it("giành khóa trước khi chạm database hay mở trình duyệt", async () => {
    const held = await acquireHealthCheckLock();
    try {
      await expect(runHealthCheck()).rejects.toThrow(/lượt dò chạy dở/);
    } finally {
      await held.release();
    }
  });

  it("thả khóa xong thì lượt sau giành được", async () => {
    const held = await acquireHealthCheckLock();
    await held.release();

    // Không còn ai giữ khóa, nên lỗi phải là lỗi TIẾP THEO trên đường đi (thiếu proxy quan sát
    // viên), chứng minh khóa đã được thả sạch chứ không kẹt lại.
    await expect(runHealthCheck()).rejects.toThrow(/proxy quan sát viên/);
  });

  /** Lượt chạy hỏng giữa chừng KHÔNG được để lại khóa — nếu không bộ dò tự khóa mình 30 phút. */
  it("thả khóa cả khi lượt chạy ném lỗi", async () => {
    await expect(runHealthCheck()).rejects.toThrow();

    // Giành lại được ngay = khóa đã được thả trong finally.
    const after = await acquireHealthCheckLock();
    await after.release();
  });
});
