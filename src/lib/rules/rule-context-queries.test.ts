import { describe, expect, it } from "vitest";
import { instantFromWallClock, loadTeamTimezone } from "../format/team-timezone";
import {
  type OwnJob,
  countPostsSameDay,
  hoursToNearestSameTarget,
  tallyPromoRatio,
} from "./rule-context-queries";

/**
 * Phần hàm thuần của tầng truy vấn — đếm và đo khoảng cách trên dữ liệu đã nạp sẵn.
 * Phần chạm database nằm ở rule-context-queries.database.test.ts.
 */

/**
 * Mốc thời gian dựng theo **MÚI GIỜ TEAM**, không theo giờ máy chạy test.
 *
 * Trước đây chỗ này dựng bằng `new Date(năm, tháng, ngày, giờ)` — tức theo giờ máy — và làm
 * vậy là ĐÚNG khi `countPostsSameDay` còn cắt ngày theo giờ máy. Từ lúc ranh giới ngày đọc
 * `TEAM_TIMEZONE`, lập luận đó lật ngược: dựng theo giờ máy nghĩa là mốc trôi đi khi máy đổi
 * múi giờ, trong khi ranh giới ngày đứng yên — nên test xanh ở Việt Nam và đỏ trên CI chạy
 * UTC, mà cái đỏ đó không phải lỗi sản phẩm.
 *
 * Dùng chính `loadTeamTimezone()` mà code thật dùng, không ghi cứng "Asia/Ho_Chi_Minh":
 * hai bên khai riêng là sớm muộn cũng lệch nhau.
 */
function gioTeam(day: number, hour: number, minute = 0): Date {
  return instantFromWallClock(
    { year: 2026, month: 8, day, hour, minute, second: 0 },
    loadTeamTimezone(),
  );
}

const AT = gioTeam(10, 9);
const HOUR = 3_600_000;

function job(overrides: Partial<OwnJob> = {}): OwnJob {
  return {
    targetId: "tgt-1",
    scheduledAt: AT,
    contentItem: { type: "VALUE" },
    ...overrides,
  };
}

describe("countPostsSameDay", () => {
  it("đếm bài trong cùng ngày theo múi giờ team", () => {
    const jobs = [job({ scheduledAt: gioTeam(10, 0, 5) }), job({ scheduledAt: gioTeam(10, 23, 55) })];
    expect(countPostsSameDay(jobs, AT)).toBe(2);
  });

  it("không đếm bài của ngày khác", () => {
    const jobs = [job({ scheduledAt: gioTeam(9, 23, 59) }), job({ scheduledAt: gioTeam(11, 0, 1) })];
    expect(countPostsSameDay(jobs, AT)).toBe(0);
  });

  /**
   * Nửa đêm là mốc dễ lệch nhất: cắt theo UTC thì "hôm nay" của team bị cắt sai chỗ,
   * và hạn mức ngày sẽ đếm nhầm sang ngày hôm trước.
   */
  it("nhận đúng nửa đêm đầu ngày, loại đúng nửa đêm ngày kế", () => {
    const dayStart = gioTeam(10, 0, 0);
    const nextDayStart = gioTeam(11, 0, 0);

    expect(countPostsSameDay([job({ scheduledAt: dayStart })], AT)).toBe(1);
    expect(countPostsSameDay([job({ scheduledAt: nextDayStart })], AT)).toBe(0);
  });

  it("không có bài nào thì đếm 0", () => {
    expect(countPostsSameDay([], AT)).toBe(0);
  });
});

describe("hoursToNearestSameTarget", () => {
  it("bỏ qua bài ở đích khác", () => {
    const jobs = [job({ targetId: "tgt-khac", scheduledAt: new Date(AT.getTime() + HOUR) })];
    expect(hoursToNearestSameTarget(jobs, "tgt-1", AT)).toBeNull();
  });

  it("lấy khoảng cách gần nhất khi có nhiều bài", () => {
    const jobs = [
      job({ scheduledAt: new Date(AT.getTime() - 10 * HOUR) }),
      job({ scheduledAt: new Date(AT.getTime() - 3 * HOUR) }),
      job({ scheduledAt: new Date(AT.getTime() - 30 * HOUR) }),
    ];
    expect(hoursToNearestSameTarget(jobs, "tgt-1", AT)).toBe(3);
  });

  /** Bài đã xếp ở tương lai cũng phải giữ khoảng nghỉ — đo hai chiều, không chỉ nhìn về quá khứ. */
  it("đo cả bài ở tương lai", () => {
    const jobs = [job({ scheduledAt: new Date(AT.getTime() + 5 * HOUR) })];
    expect(hoursToNearestSameTarget(jobs, "tgt-1", AT)).toBe(5);
  });

  it("không có bài cùng đích thì trả null", () => {
    expect(hoursToNearestSameTarget([], "tgt-1", AT)).toBeNull();
  });
});

describe("tallyPromoRatio", () => {
  it("đếm riêng bài hữu ích và bài quảng cáo của đúng đích đó", () => {
    const jobs = [
      job({ contentItem: { type: "VALUE" } }),
      job({ contentItem: { type: "VALUE" } }),
      job({ contentItem: { type: "PROMO" } }),
      job({ targetId: "tgt-khac", contentItem: { type: "PROMO" } }),
    ];
    expect(tallyPromoRatio(jobs, "tgt-1")).toEqual({ valueCount: 2, promoCount: 1 });
  });

  /** Loại nội dung lạ phải tính là VALUE, không được âm thầm bỏ qua khỏi cả hai vế. */
  it("tính loại content lạ là bài hữu ích", () => {
    expect(tallyPromoRatio([job({ contentItem: { type: "GI_DO_LA" } })], "tgt-1")).toEqual({
      valueCount: 1,
      promoCount: 0,
    });
  });

  it("chưa có bài nào thì cả hai vế bằng 0", () => {
    expect(tallyPromoRatio([], "tgt-1")).toEqual({ valueCount: 0, promoCount: 0 });
  });
});
