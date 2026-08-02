import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { HealthCheckBusyError, acquireHealthCheckLock } from "./health-check-lock";
import { runHealthCheck } from "./health-check-runner";

/**
 * Kiểm đúng một điều, nhưng là điều dễ quên nhất khi nối khóa vào: runner có THẬT SỰ giành khóa
 * không, và giành TRƯỚC khi mở trình duyệt hay hỏi database chưa.
 *
 * Nếu khóa được giành muộn — sau khi đã mở Chromium chẳng hạn — thì hai lượt vẫn kịp bắn request
 * chồng nhau đúng vào lúc nguy hiểm, và một test chỉ nhìn "có ném lỗi không" sẽ vẫn xanh.
 */

let dir: string;
let lockPath: string;

beforeEach(() => {
  dir = mkdtempSync(path.join(tmpdir(), "mkttool-runner-"));
  lockPath = path.join(dir, "health-check.lock");
});

afterEach(() => {
  rmSync(dir, { recursive: true, force: true });
});

describe("runHealthCheck — khóa chống chạy chồng", () => {
  it("từ chối khi đã có lượt khác giữ khóa", async () => {
    const held = acquireHealthCheckLock({ lockPath });
    try {
      await expect(runHealthCheck({ lockPath })).rejects.toThrow(HealthCheckBusyError);
    } finally {
      held.release();
    }
  });

  /**
   * Giành khóa phải xảy ra TRƯỚC khi hỏi proxy quan sát viên. Kiểm gián tiếp bằng thông báo lỗi:
   * nếu thứ tự đúng thì lỗi nói "đang có lượt chạy dở", chứ không phải "chưa có proxy quan sát
   * viên" — dù trong database quả thật chưa có proxy nào.
   */
  it("giành khóa trước khi chạm database hay mở trình duyệt", async () => {
    const held = acquireHealthCheckLock({ lockPath });
    try {
      await expect(runHealthCheck({ lockPath })).rejects.toThrow(/lượt dò chạy dở/);
    } finally {
      held.release();
    }
  });

  it("thả khóa xong thì lượt sau giành được", async () => {
    const held = acquireHealthCheckLock({ lockPath });
    held.release();

    // Không còn ai giữ khóa, nên lỗi phải là lỗi TIẾP THEO trên đường đi (thiếu proxy quan sát
    // viên), chứng minh khóa đã được thả sạch chứ không kẹt lại.
    await expect(runHealthCheck({ lockPath })).rejects.toThrow(/proxy quan sát viên/);
  });

  /** Lượt chạy hỏng giữa chừng KHÔNG được để lại khóa — nếu không bộ dò tự khóa mình 30 phút. */
  it("thả khóa cả khi lượt chạy ném lỗi", async () => {
    await expect(runHealthCheck({ lockPath })).rejects.toThrow();
    // Giành lại được ngay = khóa đã được thả trong finally.
    const after = acquireHealthCheckLock({ lockPath });
    after.release();
  });
});
