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
  it("recognizes valid statuses", () => {
    expect(isAccountStatus("ALIVE")).toBe(true);
    expect(isAccountStatus("BANNED")).toBe(false);
  });

  it("falls back to DEAD for unknown statuses so a browser profile is never opened accidentally", () => {
    expect(getStatusPresentation("KHONG_BIET").canLaunch).toBe(false);
  });

  it("blocks browser profile launch for checkpointed, shadowbanned, and dead nicks", () => {
    expect(getStatusPresentation("CHECKPOINT").canLaunch).toBe(false);
    expect(getStatusPresentation("SHADOWBANNED").canLaunch).toBe(false);
    expect(getStatusPresentation("DEAD").canLaunch).toBe(false);
    expect(getStatusPresentation("ALIVE").canLaunch).toBe(true);
    expect(getStatusPresentation("COLD_START").canLaunch).toBe(true);
  });

  it("sorts problem nicks before healthy nicks by severity", () => {
    const order = ["ALIVE", "CHECKPOINT", "COLD_START", "DEAD"]
      .sort((a, b) => getStatusPresentation(a).severity - getStatusPresentation(b).severity);
    expect(order).toEqual(["DEAD", "CHECKPOINT", "COLD_START", "ALIVE"]);
  });

  it("calculates cold-start state", () => {
    expect(isInColdStart(null, NOW)).toBe(false);
    expect(isInColdStart(new Date("2026-07-20T12:00:00Z"), NOW)).toBe(false);
    expect(isInColdStart(new Date("2026-08-10T12:00:00Z"), NOW)).toBe(true);
  });

  it("counts remaining cold-start days", () => {
    expect(coldStartDaysRemaining(null, NOW)).toBe(0);
    expect(coldStartDaysRemaining(new Date("2026-07-25T12:00:00Z"), NOW)).toBe(0);
    expect(coldStartDaysRemaining(new Date("2026-08-08T12:00:00Z"), NOW)).toBe(7);
    expect(coldStartDaysRemaining(new Date("2026-08-01T18:00:00Z"), NOW)).toBe(1);
  });

  it("calculates nick age in days", () => {
    expect(accountAgeInDays(null, NOW)).toBeNull();
    expect(accountAgeInDays(new Date("2025-08-01T12:00:00Z"), NOW)).toBe(365);
    expect(accountAgeInDays(new Date("2026-07-31T12:00:00Z"), NOW)).toBe(1);
  });
});
