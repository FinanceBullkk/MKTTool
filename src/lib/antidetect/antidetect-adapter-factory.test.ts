import { afterEach, describe, expect, it } from "vitest";
import { createAntidetectAdapter, resetAntidetectAdapter } from "./antidetect-adapter-factory";

const originalProvider = process.env.ANTIDETECT_PROVIDER;

afterEach(() => {
  process.env.ANTIDETECT_PROVIDER = originalProvider;
  resetAntidetectAdapter();
});

describe("antidetect-adapter-factory", () => {
  it("uses MKT Browser by default", () => {
    delete process.env.ANTIDETECT_PROVIDER;
    expect(createAntidetectAdapter().providerName).toBe("MKT Browser");
  });

  it("uses AdsPower when explicitly configured", () => {
    process.env.ANTIDETECT_PROVIDER = "adspower";
    expect(createAntidetectAdapter().providerName).toBe("AdsPower");
  });

  it("normalizes provider case", () => {
    process.env.ANTIDETECT_PROVIDER = "AdsPower";
    expect(createAntidetectAdapter().providerName).toBe("AdsPower");
  });

  it("rejects the retired MultiZen provider without a fallback", () => {
    process.env.ANTIDETECT_PROVIDER = "multizen";
    expect(() => createAntidetectAdapter()).toThrow(/invalid/);
  });

  it("rejects an unknown provider", () => {
    process.env.ANTIDETECT_PROVIDER = "gologin";
    expect(() => createAntidetectAdapter()).toThrow(/invalid/);
  });
});
