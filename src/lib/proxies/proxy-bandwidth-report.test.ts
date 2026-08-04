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
  it("dưới 1 Mbps là rất chậm", () => {
    expect(gradeBandwidth(0.4)).toBe("VERY_SLOW");
  });

  it("từ 1 tới dưới 5 Mbps là chậm", () => {
    expect(gradeBandwidth(1)).toBe("SLOW");
    expect(gradeBandwidth(4.9)).toBe("SLOW");
  });

  it("từ 5 Mbps trở lên là nhanh", () => {
    expect(gradeBandwidth(5)).toBe("FAST");
    expect(gradeBandwidth(120)).toBe("FAST");
  });
});

describe("định dạng số", () => {
  it("dùng dấu phẩy thập phân kiểu Việt", () => {
    expect(formatMbps(4.25)).toBe("4,3 Mbps");
    expect(formatDataUsed(1_048_576)).toBe("1,0 MB");
  });

  it("số lớn thì bỏ phần lẻ, số nhỏ thì tính bằng KB", () => {
    expect(formatMbps(87.4)).toBe("87 Mbps");
    expect(formatDataUsed(40_960)).toBe("40 KB");
  });
});

describe("summarizeBandwidth", () => {
  it("chỉ báo xanh khi đo được VÀ không chậm", () => {
    expect(summarizeBandwidth({ kind: "ok", reading: reading(42) }).ok).toBe(true);
    expect(summarizeBandwidth({ kind: "ok", reading: reading(2) }).ok).toBe(false);
  });

  it("câu mô tả nói rõ đã tiêu bao nhiêu quota", () => {
    const summary = summarizeBandwidth({ kind: "ok", reading: reading(42) });
    expect(summary.message).toContain("1,0 MB");
    expect(summary.message).toContain("speed.cloudflare.com");
  });

  it("chạm trần thời gian thì nói ra, vì số đo dựa trên ít byte hơn", () => {
    const summary = summarizeBandwidth({
      kind: "ok",
      reading: reading(0.6, { bytes: 614_400, hitTimeCap: true }),
    });
    expect(summary.message).toContain("chạm trần thời gian");
  });

  it("không đo được thì KHÔNG có số và KHÔNG bị xếp là chậm", () => {
    const summary = summarizeBandwidth({ kind: "probe-failed", detail: "máy chủ thử trả 403" });

    expect(summary.mbps).toBeNull();
    expect(summary.grade).toBe("UNKNOWN");
    expect(summary.ok).toBe(false);
    // Phải nói rõ chưa phải lỗi proxy — không thì người dùng đi thay một proxy vô tội.
    expect(summary.message).toContain("chưa phải lỗi proxy");
  });

  it("proxy không tải nổi file thử thì quy về proxy, không quy về bộ đo", () => {
    const summary = summarizeBandwidth({ kind: "unreachable", detail: "proxy từ chối xác thực" });

    expect(summary.mbps).toBeNull();
    expect(summary.message).toContain("Không tải được file thử qua proxy này");
  });
});
