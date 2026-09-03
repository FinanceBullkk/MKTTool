import { describe, expect, it } from "vitest";
import type { ProbeOutcome } from "./proxy-exit-ip-probe";
import { evaluateProxyLiveness, isProblemVerdict } from "./proxy-liveness-verdict";

const OK_DIRECT: ProbeOutcome = { kind: "ok", ip: "1.2.3.4", country: "VN" };

function through(ip: string, country: string | null = "US"): ProbeOutcome {
  return { kind: "ok", ip, country };
}

describe("evaluateProxyLiveness", () => {
  it("marks an unreachable proxy as DEAD and blocks profile launch", () => {
    const result = evaluateProxyLiveness({
      throughProxy: { kind: "unreachable", detail: "could not connect within 10 seconds" },
      direct: OK_DIRECT,
      declaredCountry: "US",
    });

    expect(result.verdict).toBe("DEAD");
    expect(result.blocksLaunch).toBe(true);
    expect(result.exitIp).toBeNull();
  });

  it("marks a failed probe as UNVERIFIED rather than dead or healthy", () => {
    // Ranh giới quan trọng nhất của cả module: mạng nhà chập chờn không được biến thành
    // "proxy đã chết", vì kết luận đó chặn mở profile.
    const result = evaluateProxyLiveness({
      throughProxy: { kind: "probe-failed", detail: "ipinfo.io returned a non-JSON response" },
      direct: OK_DIRECT,
      declaredCountry: "US",
    });

    expect(result.verdict).toBe("UNKNOWN");
    expect(result.blocksLaunch).toBe(false);
  });

  it("marks a matching exit and local IP as LEAKING and blocks launch", () => {
    const result = evaluateProxyLiveness({
      throughProxy: through("1.2.3.4", "VN"),
      direct: OK_DIRECT,
      declaredCountry: "VN",
    });

    expect(result.verdict).toBe("LEAKING");
    expect(result.blocksLaunch).toBe(true);
    expect(result.message).toContain("1.2.3.4");
  });

  it("warns about a country mismatch but still allows launch", () => {
    const result = evaluateProxyLiveness({
      throughProxy: through("9.9.9.9", "DE"),
      direct: OK_DIRECT,
      declaredCountry: "US",
    });

    expect(result.verdict).toBe("COUNTRY_MISMATCH");
    expect(result.blocksLaunch).toBe(false);
  });

  it("skips country comparison for an unrecognized localized country name", () => {
    // "Quốc gia" là ô nhập tự do. Cảnh báo sai vì người ta gõ "Mỹ" là cảnh báo bị tắt sau ba lần.
    const result = evaluateProxyLiveness({
      throughProxy: through("9.9.9.9", "US"),
      direct: OK_DIRECT,
      declaredCountry: String.fromCodePoint(0x4d, 0x1ef9),
    });

    expect(result.verdict).toBe("OK");
  });

  it("returns OK when the proxy works, changes the IP, and matches the country", () => {
    const result = evaluateProxyLiveness({
      throughProxy: through("9.9.9.9", "us"),
      direct: OK_DIRECT,
      declaredCountry: "US",
    });

    expect(result.verdict).toBe("OK");
    expect(result.exitIp).toBe("9.9.9.9");
    expect(result.blocksLaunch).toBe(false);
  });

  it("returns OK without a local IP but explains that a leak was not ruled out", () => {
    const result = evaluateProxyLiveness({
      throughProxy: through("9.9.9.9", "US"),
      direct: { kind: "probe-failed", detail: "network unavailable" },
      declaredCountry: "US",
    });

    expect(result.verdict).toBe("OK");
    expect(result.message).toContain("direct IP could not be checked");
  });

  it("checks country mismatch BEFORE the missing-local-IP branch", () => {
    // Không có IP nhà thì không so rò được, nhưng quốc gia thì vẫn so được — bỏ qua
    // nó ở đây là im lặng đánh mất một cảnh báo vẫn còn đủ căn cứ.
    const result = evaluateProxyLiveness({
      throughProxy: through("9.9.9.9", "DE"),
      direct: { kind: "unreachable", detail: "network unavailable" },
      declaredCountry: "US",
    });

    expect(result.verdict).toBe("COUNTRY_MISMATCH");
  });
});

describe("isProblemVerdict", () => {
  it("does not call an unchecked proxy either problematic or healthy", () => {
    expect(isProblemVerdict(null)).toBe(false);
    expect(isProblemVerdict("UNKNOWN")).toBe(false);
  });

  it("shows dead, leaking, and country-mismatch states in the warning strip", () => {
    expect(isProblemVerdict("DEAD")).toBe(true);
    expect(isProblemVerdict("LEAKING")).toBe(true);
    expect(isProblemVerdict("COUNTRY_MISMATCH")).toBe(true);
    expect(isProblemVerdict("OK")).toBe(false);
  });
});
