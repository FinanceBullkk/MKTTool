import { describe, expect, it } from "vitest";
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
 * Mốc thời gian dựng bằng `new Date(năm, tháng, ngày, giờ)` — tức theo **giờ máy đang chạy**,
 * cố ý không dùng chuỗi ISO có sẵn offset (`...+07:00`).
 *
 * `countPostsSameDay` cắt ngày theo giờ máy, vì "hôm nay" của bạn MKT là ngày trên đồng hồ
 * trước mặt họ chứ không phải ngày UTC. Ghi cứng `+07:00` vào test là ngầm bắt máy chạy test
 * phải ở UTC+7: đúng trên máy ở Việt Nam, đỏ trên CI chạy UTC — mà cái đỏ đó không phải lỗi
 * sản phẩm. Dựng theo giờ máy thì test kiểm đúng điều cần kiểm ở bất kỳ múi giờ nào.
 */
const AT = new Date(2026, 7, 10, 9, 0);
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
  it("đếm bài trong cùng ngày theo giờ máy", () => {
    const jobs = [
      job({ scheduledAt: new Date(2026, 7, 10, 0, 5) }),
      job({ scheduledAt: new Date(2026, 7, 10, 23, 55) }),
    ];
    expect(countPostsSameDay(jobs, AT)).toBe(2);
  });

  it("không đếm bài của ngày khác", () => {
    const jobs = [
      job({ scheduledAt: new Date(2026, 7, 9, 23, 59) }),
      job({ scheduledAt: new Date(2026, 7, 11, 0, 1) }),
    ];
    expect(countPostsSameDay(jobs, AT)).toBe(0);
  });

  /**
   * Nửa đêm là mốc dễ lệch nhất: tính theo UTC thì "hôm nay" của bạn MKT bị cắt sai chỗ,
   * và hạn mức ngày sẽ đếm nhầm sang ngày hôm trước.
   */
  it("nhận đúng nửa đêm đầu ngày, loại đúng nửa đêm ngày kế", () => {
    const dayStart = new Date(2026, 7, 10, 0, 0);
    const nextDayStart = new Date(2026, 7, 11, 0, 0);

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
