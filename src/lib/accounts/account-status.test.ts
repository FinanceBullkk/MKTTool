import { describe, expect, it } from "vitest";
import {
  accountAgeInDays,
  coldStartDaysRemaining,
  getStatusPresentation,
  isAccountStatus,
  isInColdStart,
} from "./account-status";

const NOW = new Date("2026-08-01T12:00:00Z");

describe("account-status", () => {
  it("nhận diện trạng thái hợp lệ", () => {
    expect(isAccountStatus("ALIVE")).toBe(true);
    expect(isAccountStatus("BANNED")).toBe(false);
  });

  it("trạng thái lạ quy về DEAD để không vô tình cho phép mở profile", () => {
    expect(getStatusPresentation("KHONG_BIET").canLaunch).toBe(false);
  });

  it("chặn mở profile với nick checkpoint / shadowban / đã chết", () => {
    expect(getStatusPresentation("CHECKPOINT").canLaunch).toBe(false);
    expect(getStatusPresentation("SHADOWBANNED").canLaunch).toBe(false);
    expect(getStatusPresentation("DEAD").canLaunch).toBe(false);
    expect(getStatusPresentation("ALIVE").canLaunch).toBe(true);
    expect(getStatusPresentation("COLD_START").canLaunch).toBe(true);
  });

  it("nick có vấn đề xếp trước nick khỏe khi sắp theo severity", () => {
    const order = ["ALIVE", "CHECKPOINT", "COLD_START", "DEAD"]
      .sort((a, b) => getStatusPresentation(a).severity - getStatusPresentation(b).severity);
    expect(order).toEqual(["DEAD", "CHECKPOINT", "COLD_START", "ALIVE"]);
  });

  it("tính đúng trạng thái cold-start", () => {
    expect(isInColdStart(null, NOW)).toBe(false);
    expect(isInColdStart(new Date("2026-07-20T12:00:00Z"), NOW)).toBe(false);
    expect(isInColdStart(new Date("2026-08-10T12:00:00Z"), NOW)).toBe(true);
  });

  it("đếm ngược số ngày cold-start còn lại", () => {
    expect(coldStartDaysRemaining(null, NOW)).toBe(0);
    expect(coldStartDaysRemaining(new Date("2026-07-25T12:00:00Z"), NOW)).toBe(0);
    expect(coldStartDaysRemaining(new Date("2026-08-08T12:00:00Z"), NOW)).toBe(7);
    expect(coldStartDaysRemaining(new Date("2026-08-01T18:00:00Z"), NOW)).toBe(1);
  });

  it("tính tuổi nick theo ngày", () => {
    expect(accountAgeInDays(null, NOW)).toBeNull();
    expect(accountAgeInDays(new Date("2025-08-01T12:00:00Z"), NOW)).toBe(365);
    expect(accountAgeInDays(new Date("2026-07-31T12:00:00Z"), NOW)).toBe(1);
  });
});
