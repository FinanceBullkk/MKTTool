import { describe, expect, it } from "vitest";
import type { ProbeOutcome } from "./proxy-exit-ip-probe";
import { evaluateProxyLiveness, isProblemVerdict } from "./proxy-liveness-verdict";

const OK_DIRECT: ProbeOutcome = { kind: "ok", ip: "1.2.3.4", country: "VN" };

function through(ip: string, country: string | null = "US"): ProbeOutcome {
  return { kind: "ok", ip, country };
}

describe("evaluateProxyLiveness", () => {
  it("proxy không nối được thì CHẾT và chặn mở profile", () => {
    const result = evaluateProxyLiveness({
      throughProxy: { kind: "unreachable", detail: "quá 10 giây không nối được" },
      direct: OK_DIRECT,
      declaredCountry: "US",
    });

    expect(result.verdict).toBe("DEAD");
    expect(result.blocksLaunch).toBe(true);
    expect(result.exitIp).toBeNull();
  });

  it("bộ kiểm hỏng thì KHÔNG KIỂM ĐƯỢC — không được báo chết, cũng không được báo khỏe", () => {
    // Ranh giới quan trọng nhất của cả module: mạng nhà chập chờn không được biến thành
    // "proxy đã chết", vì kết luận đó chặn mở profile.
    const result = evaluateProxyLiveness({
      throughProxy: { kind: "probe-failed", detail: "ipinfo.io trả về thứ không phải JSON" },
      direct: OK_DIRECT,
      declaredCountry: "US",
    });

    expect(result.verdict).toBe("UNKNOWN");
    expect(result.blocksLaunch).toBe(false);
  });

  it("IP ra trùng IP máy này thì RÒ và chặn — proxy trả lời nhưng không đổi IP", () => {
    const result = evaluateProxyLiveness({
      throughProxy: through("1.2.3.4", "VN"),
      direct: OK_DIRECT,
      declaredCountry: "VN",
    });

    expect(result.verdict).toBe("LEAKING");
    expect(result.blocksLaunch).toBe(true);
    expect(result.message).toContain("1.2.3.4");
  });

  it("quốc gia lệch thì cảnh báo nhưng vẫn cho mở", () => {
    const result = evaluateProxyLiveness({
      throughProxy: through("9.9.9.9", "DE"),
      direct: OK_DIRECT,
      declaredCountry: "US",
    });

    expect(result.verdict).toBe("COUNTRY_MISMATCH");
    expect(result.blocksLaunch).toBe(false);
  });

  it("ô quốc gia gõ tiếng Việt thì bỏ qua phép so, không cảnh báo bừa", () => {
    // "Quốc gia" là ô nhập tự do. Cảnh báo sai vì người ta gõ "Mỹ" là cảnh báo bị tắt sau ba lần.
    const result = evaluateProxyLiveness({
      throughProxy: through("9.9.9.9", "US"),
      direct: OK_DIRECT,
      declaredCountry: "Mỹ",
    });

    expect(result.verdict).toBe("OK");
  });

  it("proxy sống, khác IP nhà, đúng nước thì OK", () => {
    const result = evaluateProxyLiveness({
      throughProxy: through("9.9.9.9", "us"),
      direct: OK_DIRECT,
      declaredCountry: "US",
    });

    expect(result.verdict).toBe("OK");
    expect(result.exitIp).toBe("9.9.9.9");
    expect(result.blocksLaunch).toBe(false);
  });

  it("không lấy được IP nhà thì vẫn OK nhưng nói rõ chưa loại trừ được rò", () => {
    const result = evaluateProxyLiveness({
      throughProxy: through("9.9.9.9", "US"),
      direct: { kind: "probe-failed", detail: "mất mạng" },
      declaredCountry: "US",
    });

    expect(result.verdict).toBe("OK");
    expect(result.message).toContain("Chưa đối chiếu được");
  });

  it("lệch nước được xét TRƯỚC nhánh thiếu IP nhà", () => {
    // Không có IP nhà thì không so rò được, nhưng quốc gia thì vẫn so được — bỏ qua
    // nó ở đây là im lặng đánh mất một cảnh báo vẫn còn đủ căn cứ.
    const result = evaluateProxyLiveness({
      throughProxy: through("9.9.9.9", "DE"),
      direct: { kind: "unreachable", detail: "mất mạng" },
      declaredCountry: "US",
    });

    expect(result.verdict).toBe("COUNTRY_MISMATCH");
  });
});

describe("isProblemVerdict", () => {
  it("chưa kiểm lần nào không phải là 'đang có vấn đề', nhưng cũng không phải 'khỏe'", () => {
    expect(isProblemVerdict(null)).toBe(false);
    expect(isProblemVerdict("UNKNOWN")).toBe(false);
  });

  it("chết, rò và lệch nước đều phải hiện ở dải cảnh báo", () => {
    expect(isProblemVerdict("DEAD")).toBe(true);
    expect(isProblemVerdict("LEAKING")).toBe(true);
    expect(isProblemVerdict("COUNTRY_MISMATCH")).toBe(true);
    expect(isProblemVerdict("OK")).toBe(false);
  });
});
