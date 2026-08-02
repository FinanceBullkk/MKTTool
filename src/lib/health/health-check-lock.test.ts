import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import {
  HealthCheckBusyError,
  STALE_AFTER_MS,
  acquireHealthCheckLock,
} from "./health-check-lock";

/**
 * Khóa này bảo vệ thứ đắt nhất của Phase 03: proxy quan sát viên. Hai lượt dò chồng nhau làm
 * nó bắn request dồn dập và bị Reddit chặn — nên mỗi nhánh dưới đây đều đáng test riêng.
 *
 * Thư mục tạm nằm ở thư mục tạm của hệ điều hành, KHÔNG nằm trong `.test-tmp/`: chỗ đó do
 * vitest.global-setup.ts sở hữu và xóa lúc kết thúc, và trên Windows hai bên cùng xóa một cây
 * thư mục thì lượt dọn cuối phiên ăn EPERM.
 */

const NOW = new Date("2026-08-03T04:00:00Z");

let dir: string;
let LOCK: string;

beforeEach(() => {
  dir = mkdtempSync(path.join(tmpdir(), "mkttool-lock-"));
  LOCK = path.join(dir, "health-check.lock");
});

afterEach(() => {
  rmSync(dir, { recursive: true, force: true });
});

describe("acquireHealthCheckLock", () => {
  it("giành được khóa khi chưa ai giữ, và tạo file khóa", () => {
    const held = acquireHealthCheckLock({ lockPath: LOCK, now: NOW });
    expect(existsSync(LOCK)).toBe(true);
    held.release();
    expect(existsSync(LOCK)).toBe(false);
  });

  it("tự tạo thư mục cha nếu chưa có", () => {
    const nested = path.join(dir, "chua", "co", "thu-muc", "x.lock");
    const held = acquireHealthCheckLock({ lockPath: nested, now: NOW });
    expect(existsSync(nested)).toBe(true);
    held.release();
  });

  it("lượt thứ hai bị từ chối khi lượt đầu còn đang chạy", () => {
    const first = acquireHealthCheckLock({ lockPath: LOCK, now: NOW });
    try {
      expect(() => acquireHealthCheckLock({ lockPath: LOCK, now: NOW })).toThrow(
        HealthCheckBusyError,
      );
    } finally {
      first.release();
    }
  });

  it("thông báo bận nói rõ ai đang giữ và giữ bao lâu rồi", () => {
    const first = acquireHealthCheckLock({ lockPath: LOCK, now: NOW });
    try {
      const later = new Date(NOW.getTime() + 5 * 60_000);
      expect(() => acquireHealthCheckLock({ lockPath: LOCK, now: later })).toThrow(/5 phút/);
    } finally {
      first.release();
    }
  });

  it("thả khóa xong thì lượt sau giành được", () => {
    acquireHealthCheckLock({ lockPath: LOCK, now: NOW }).release();
    const second = acquireHealthCheckLock({ lockPath: LOCK, now: NOW });
    expect(existsSync(LOCK)).toBe(true);
    second.release();
  });

  /**
   * Tiến trình bị tắt ngang (Ctrl+C, mất điện) để lại khóa không ai dọn. Không có nhánh này thì
   * bộ dò tự khóa mình vĩnh viễn — cũng mù y như bị Reddit chặn, mà lại không ai ngờ tới.
   */
  it("giành được khóa mồ côi để quá hạn", () => {
    acquireHealthCheckLock({ lockPath: LOCK, now: NOW });
    const muchLater = new Date(NOW.getTime() + STALE_AFTER_MS + 60_000);

    const taken = acquireHealthCheckLock({ lockPath: LOCK, now: muchLater });
    expect(existsSync(LOCK)).toBe(true);
    taken.release();
  });

  it("khóa vừa quá hạn một chút vẫn được tôn trọng, không giành ẩu", () => {
    const first = acquireHealthCheckLock({ lockPath: LOCK, now: NOW });
    try {
      const justUnder = new Date(NOW.getTime() + STALE_AFTER_MS - 1_000);
      expect(() => acquireHealthCheckLock({ lockPath: LOCK, now: justUnder })).toThrow(
        HealthCheckBusyError,
      );
    } finally {
      first.release();
    }
  });

  it("file khóa nội dung hỏng thì coi là rác và giành lấy", () => {
    writeFileSync(LOCK, "khong-phai-json");
    const held = acquireHealthCheckLock({ lockPath: LOCK, now: NOW });
    expect(JSON.parse(readFileSync(LOCK, "utf8")).pid).toBe(process.pid);
    held.release();
  });

  /**
   * Sau khi một lượt dọn khóa mồ côi, chủ cũ có thể hồi sinh và gọi release(). Nó KHÔNG được
   * xóa khóa của chủ mới — làm vậy là kéo lượt đang chạy của người ta mất khóa giữa chừng.
   */
  it("release() không xóa khóa của người khác", () => {
    const stale = acquireHealthCheckLock({ lockPath: LOCK, now: NOW });
    const muchLater = new Date(NOW.getTime() + STALE_AFTER_MS + 60_000);
    const fresh = acquireHealthCheckLock({ lockPath: LOCK, now: muchLater });

    stale.release(); // chủ cũ hồi sinh và dọn dẹp
    expect(existsSync(LOCK)).toBe(true); // khóa của chủ mới còn nguyên

    fresh.release();
    expect(existsSync(LOCK)).toBe(false);
  });

  it("release() gọi hai lần không ném lỗi", () => {
    const held = acquireHealthCheckLock({ lockPath: LOCK, now: NOW });
    held.release();
    expect(() => held.release()).not.toThrow();
  });
});
