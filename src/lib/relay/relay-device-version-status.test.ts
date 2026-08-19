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
  it("`null` là chưa biết, KHÔNG phải bản cũ", () => {
    const status = readRelayVersionStatus(
      { relayVersion: null, lastSeenAt: null, revokedAt: null },
      FLOOR,
      NOW,
    );

    expect(status.tone).toBe("unknown");
    expect(status.label).toBe("chưa khai");
    // Nhãn không được chứa con số nào — một ô "chưa biết" mà hiện số là ô nói dối.
    expect(status.label).not.toMatch(/\d/);
    expect(status.detail).toContain("không phải bản cũ");
  });

  it("dưới sàn thì kêu, và nói ra cả sàn lẫn bản máy khai", () => {
    const status = readRelayVersionStatus(
      { relayVersion: 12, lastSeenAt: RECENTLY, revokedAt: null },
      FLOOR,
      NOW,
    );

    expect(status.tone).toBe("below-floor");
    expect(status.label).toContain("12");
    expect(status.label).toContain("13");
  });

  it("dưới sàn vẫn kêu kể cả khi máy im lặng đã lâu", () => {
    // Máy khai bản 12 rồi biến mất vẫn là máy sẽ bị từ chối vào ngày nó quay lại. Để độ tươi
    // nuốt mất cảnh báo này là giấu đi đúng chiếc máy sẽ gọi điện kêu cứu.
    const status = readRelayVersionStatus(
      { relayVersion: 12, lastSeenAt: LONG_AGO, revokedAt: null },
      FLOOR,
      NOW,
    );

    expect(status.tone).toBe("below-floor");
  });

  it("đúng sàn cũng là đạt — sàn là ngưỡng tối thiểu, không phải ngưỡng phải vượt", () => {
    const status = readRelayVersionStatus(
      { relayVersion: FLOOR, lastSeenAt: RECENTLY, revokedAt: null },
      FLOOR,
      NOW,
    );

    expect(status.tone).toBe("current");
  });

  it("bản mới nhưng im lặng lâu thì là hồ sơ cũ, không phải trạng thái hiện tại", () => {
    const status = readRelayVersionStatus(
      { relayVersion: 15, lastSeenAt: LONG_AGO, revokedAt: null },
      FLOOR,
      NOW,
    );

    expect(status.tone).toBe("stale");
    expect(status.label).toContain("15");
  });

  it("máy thu hồi giữ nguyên số cuối và nói rõ nó đã đứng yên", () => {
    // `recordRelayDeviceVersion` loại máy đã thu hồi khỏi mệnh đề `where`, nên hai cột đóng băng
    // từ lúc thu hồi. Vẽ nó như máy đang chạy là làm một hàng đã đóng trông như còn sống.
    const status = readRelayVersionStatus(
      { relayVersion: 12, lastSeenAt: LONG_AGO, revokedAt: new Date("2026-08-06T02:00:00Z") },
      FLOOR,
      NOW,
    );

    expect(status.tone).toBe("unknown");
    expect(status.detail).toContain("thu hồi");
  });

  it("máy thu hồi mà chưa từng khai thì không bịa ra số", () => {
    const status = readRelayVersionStatus(
      { relayVersion: null, lastSeenAt: null, revokedAt: new Date("2026-08-06T02:00:00Z") },
      FLOOR,
      NOW,
    );

    expect(status.label).not.toMatch(/\d/);
  });

  it("có bản mà không có mốc thì nói thẳng là không rõ, không đoán", () => {
    // Chỉ xảy ra nếu ai đó ghi tay vào database — hai cột luôn được ghi cùng lúc.
    const status = readRelayVersionStatus(
      { relayVersion: 15, lastSeenAt: null, revokedAt: null },
      FLOOR,
      NOW,
    );

    expect(status.tone).toBe("stale");
    expect(status.detail).toContain("không rõ");
  });

  it("đúng mốc bảy ngày vẫn còn tươi — chỉ quá mốc mới là cũ", () => {
    const exactly = new Date(NOW.getTime() - VERSION_REPORT_STALE_AFTER_MS);
    const status = readRelayVersionStatus(
      { relayVersion: 15, lastSeenAt: exactly, revokedAt: null },
      FLOOR,
      NOW,
    );

    expect(status.tone).toBe("current");
  });
});
