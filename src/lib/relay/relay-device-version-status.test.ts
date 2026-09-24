/**
 * Ô phiên bản trong sổ máy phải nói đúng ba thứ nó biết, và im về thứ nó không biết.
 *
 * Bài kiểm đắt nhất ở đây là bài `null`: mọi máy đăng ký trước 18/08/2026 đều bắt đầu từ `null`,
 * và vẽ chúng thành cảnh báo là chỉ vào máy khỏe mà bảo người ta đi sửa.
 */
import { describe, expect, it } from "vitest";
import {
  readRelayVersionStatus,
  VERSION_REPORT_STALE_AFTER_MS,
} from "./relay-device-version-status";

const FLOOR = 13;
const NOW = new Date("2026-08-19T01:00:00Z");
const RECENTLY = new Date(NOW.getTime() - 60_000);
const LONG_AGO = new Date(NOW.getTime() - VERSION_REPORT_STALE_AFTER_MS - 1);

describe("readRelayVersionStatus", () => {
  it("treats `null` as unknown rather than outdated", () => {
    const status = readRelayVersionStatus(
      { relayVersion: null, lastSeenAt: null, revokedAt: null },
      FLOOR,
      NOW,
    );

    expect(status.tone).toBe("unknown");
    expect(status.label).toBe("not reported");
    // Nhãn không được chứa con số nào — một ô "chưa biết" mà hiện số là ô nói dối.
    expect(status.label).not.toMatch(/\d/);
    expect(status.detail).toContain("unknown, not outdated");
  });

  it("warns below the floor and states both the floor and reported version", () => {
    const status = readRelayVersionStatus(
      { relayVersion: 12, lastSeenAt: RECENTLY, revokedAt: null },
      FLOOR,
      NOW,
    );

    expect(status.tone).toBe("below-floor");
    expect(status.label).toContain("12");
    expect(status.label).toContain("13");
  });

  it("still warns below the floor when the Relay PC has been silent for a long time", () => {
    // Máy khai bản 12 rồi biến mất vẫn là máy sẽ bị từ chối vào ngày nó quay lại. Để độ tươi
    // nuốt mất cảnh báo này là giấu đi đúng chiếc máy sẽ gọi điện kêu cứu.
    const status = readRelayVersionStatus(
      { relayVersion: 12, lastSeenAt: LONG_AGO, revokedAt: null },
      FLOOR,
      NOW,
    );

    expect(status.tone).toBe("below-floor");
  });

  it("accepts the floor because it is an inclusive minimum", () => {
    const status = readRelayVersionStatus(
      { relayVersion: FLOOR, lastSeenAt: RECENTLY, revokedAt: null },
      FLOOR,
      NOW,
    );

    expect(status.tone).toBe("current");
  });

  it("separately marks a Relay that meets security but cannot run profile operations", () => {
    const device = { relayVersion: 19, lastSeenAt: RECENTLY, revokedAt: null };

    expect(readRelayVersionStatus(device, 13, NOW).tone).toBe("current");
    const profileOperations = readRelayVersionStatus(device, 20, NOW);
    expect(profileOperations.tone).toBe("below-floor");
    expect(profileOperations.label).toContain("19");
    expect(profileOperations.label).toContain("20");
  });

  it("marks a recent version with an old response time as stale history", () => {
    const status = readRelayVersionStatus(
      { relayVersion: 15, lastSeenAt: LONG_AGO, revokedAt: null },
      FLOOR,
      NOW,
    );

    expect(status.tone).toBe("stale");
    expect(status.label).toContain("15");
  });

  it("keeps the last version for a revoked Relay PC and states that it is frozen", () => {
    // `recordRelayDeviceVersion` loại máy đã thu hồi khỏi mệnh đề `where`, nên hai cột đóng băng
    // từ lúc thu hồi. Vẽ nó như máy đang chạy là làm một hàng đã đóng trông như còn sống.
    const status = readRelayVersionStatus(
      { relayVersion: 12, lastSeenAt: LONG_AGO, revokedAt: new Date("2026-08-06T02:00:00Z") },
      FLOOR,
      NOW,
    );

    expect(status.tone).toBe("unknown");
    expect(status.detail).toContain("revoked");
  });

  it("does not invent a version for a revoked Relay PC that never reported one", () => {
    const status = readRelayVersionStatus(
      { relayVersion: null, lastSeenAt: null, revokedAt: new Date("2026-08-06T02:00:00Z") },
      FLOOR,
      NOW,
    );

    expect(status.label).not.toMatch(/\d/);
  });

  it("states that response time is unknown when a version has no timestamp", () => {
    // Chỉ xảy ra nếu ai đó ghi tay vào database — hai cột luôn được ghi cùng lúc.
    const status = readRelayVersionStatus(
      { relayVersion: 15, lastSeenAt: null, revokedAt: null },
      FLOOR,
      NOW,
    );

    expect(status.tone).toBe("stale");
    expect(status.detail).toContain("unknown");
  });

  it("keeps a report fresh at exactly seven days and marks it stale only after", () => {
    const exactly = new Date(NOW.getTime() - VERSION_REPORT_STALE_AFTER_MS);
    const status = readRelayVersionStatus(
      { relayVersion: 15, lastSeenAt: exactly, revokedAt: null },
      FLOOR,
      NOW,
    );

    expect(status.tone).toBe("current");
  });
});
