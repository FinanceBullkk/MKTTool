import { describe, expect, it } from "vitest";
import type { BandwidthReading } from "./proxy-bandwidth-probe";
import {
  formatDataUsed,
  formatMbps,
  gradeBandwidth,
  summarizeBandwidth,
} from "./proxy-bandwidth-report";

function reading(mbps: number, extra: Partial<BandwidthReading> = {}): BandwidthReading {
  return {
    mbps,
    bytes: 1_048_576,
    ttfbMs: 210,
    hitTimeCap: false,
    source: "speed.cloudflare.com",
    ...extra,
  };
}

describe("gradeBandwidth", () => {
  it("classifies below 1 Mbps as very slow", () => {
    expect(gradeBandwidth(0.4)).toBe("VERY_SLOW");
  });

  it("classifies 1 to below 5 Mbps as slow", () => {
    expect(gradeBandwidth(1)).toBe("SLOW");
    expect(gradeBandwidth(4.9)).toBe("SLOW");
  });

  it("classifies 5 Mbps and above as fast", () => {
    expect(gradeBandwidth(5)).toBe("FAST");
    expect(gradeBandwidth(120)).toBe("FAST");
  });
});

describe("number formatting", () => {
  it("uses an English decimal point", () => {
    expect(formatMbps(4.25)).toBe("4.3 Mbps");
    expect(formatDataUsed(1_048_576)).toBe("1.0 MB");
  });

  it("drops decimals for large values and uses KB for small values", () => {
    expect(formatMbps(87.4)).toBe("87 Mbps");
    expect(formatDataUsed(40_960)).toBe("40 KB");
  });
});

describe("summarizeBandwidth", () => {
  it("reports healthy only when a measurement exists and is not slow", () => {
    expect(summarizeBandwidth({ kind: "ok", reading: reading(42) }).ok).toBe(true);
    expect(summarizeBandwidth({ kind: "ok", reading: reading(2) }).ok).toBe(false);
  });

  it("states how much quota the measurement consumed", () => {
    const summary = summarizeBandwidth({ kind: "ok", reading: reading(42) });
    expect(summary.message).toContain("1.0 MB");
    expect(summary.message).toContain("speed.cloudflare.com");
  });

  it("states when the time limit reduced the sample size", () => {
    const summary = summarizeBandwidth({
      kind: "ok",
      reading: reading(0.6, { bytes: 614_400, hitTimeCap: true }),
    });
    expect(summary.message).toContain("time limit");
  });

  it("reports no speed and does not classify a failed measurement as slow", () => {
    const summary = summarizeBandwidth({ kind: "probe-failed", detail: "the test server returned 403" });

    expect(summary.mbps).toBeNull();
    expect(summary.grade).toBe("UNKNOWN");
    expect(summary.ok).toBe(false);
    // Phải nói rõ chưa phải lỗi proxy — không thì người dùng đi thay một proxy vô tội.
    expect(summary.message).toContain("not yet a proxy failure");
  });

  it("attributes a failed test download to the proxy rather than the measurement service", () => {
    const summary = summarizeBandwidth({ kind: "unreachable", detail: "the proxy rejected authentication" });

    expect(summary.mbps).toBeNull();
    expect(summary.message).toContain("could not be downloaded through this proxy");
  });
});
