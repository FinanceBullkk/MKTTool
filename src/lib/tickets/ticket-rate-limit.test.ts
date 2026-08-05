import { beforeEach, describe, expect, it } from "vitest";
import { checkTicketRateLimit, resetTicketRateLimit } from "./ticket-rate-limit";

const NOW = 1_800_000_000_000;
const AI_DO = "user-1";
const NGUOI_KHAC = "user-2";

beforeEach(() => {
  resetTicketRateLimit();
});

/** Xin `lan` lượt liên tiếp ở cùng một mốc thời gian, trả về phán quyết cuối. */
function xinLienTiep(userId: string, lan: number, now = NOW) {
  let verdict = checkTicketRateLimit(userId, now);
  for (let i = 1; i < lan; i += 1) verdict = checkTicketRateLimit(userId, now);
  return verdict;
}

describe("cửa sổ trượt", () => {
  it("cho qua 10 lượt, chặn lượt thứ 11", () => {
    expect(xinLienTiep(AI_DO, 10).allowed).toBe(true);
    expect(checkTicketRateLimit(AI_DO, NOW).allowed).toBe(false);
  });

  it("qua một phút thì mở lại", () => {
    xinLienTiep(AI_DO, 10);

    expect(checkTicketRateLimit(AI_DO, NOW + 60_001).allowed).toBe(true);
  });

  /**
   * Nếu lượt bị chặn cũng được ghi vào cửa sổ thì một vòng lặp đủ nhanh sẽ tự đẩy cửa sổ của
   * chính nó ra xa mãi — và người dùng thật bị khóa vô thời hạn vì hành vi của kẻ đang gõ cửa.
   */
  it("lượt bị chặn không đẩy cửa sổ ra xa", () => {
    xinLienTiep(AI_DO, 10);
    // Gõ cửa liên tục suốt gần một phút.
    for (let t = 0; t < 59_000; t += 1_000) checkTicketRateLimit(AI_DO, NOW + t);

    expect(checkTicketRateLimit(AI_DO, NOW + 60_001).allowed).toBe(true);
  });

  it("đếm riêng từng người", () => {
    xinLienTiep(AI_DO, 10);

    expect(checkTicketRateLimit(NGUOI_KHAC, NOW).allowed).toBe(true);
  });
});

describe("câu thông báo", () => {
  /** Bị chặn mà không biết chờ bao lâu thì người dùng chỉ còn cách bấm lại liên tục. */
  it("nói số giây phải chờ", () => {
    xinLienTiep(AI_DO, 10);

    const verdict = checkTicketRateLimit(AI_DO, NOW + 20_000);

    expect(verdict.message).toContain("tạm dừng 40 giây");
  });
});
