import { afterEach, describe, expect, it } from "vitest";
import { createAntidetectAdapter, resetAntidetectAdapter } from "./antidetect-adapter-factory";

const originalProvider = process.env.ANTIDETECT_PROVIDER;

afterEach(() => {
  process.env.ANTIDETECT_PROVIDER = originalProvider;
  resetAntidetectAdapter();
});

describe("antidetect-adapter-factory", () => {
  it("mặc định dùng MultiZen", () => {
    delete process.env.ANTIDETECT_PROVIDER;
    expect(createAntidetectAdapter().providerName).toBe("MultiZen");
  });

  it("chuyển sang AdsPower khi đổi biến môi trường", () => {
    process.env.ANTIDETECT_PROVIDER = "adspower";
    expect(createAntidetectAdapter().providerName).toBe("AdsPower");
  });

  it("không phân biệt hoa thường", () => {
    process.env.ANTIDETECT_PROVIDER = "AdsPower";
    expect(createAntidetectAdapter().providerName).toBe("AdsPower");
  });

  it("báo lỗi rõ ràng với giá trị lạ", () => {
    process.env.ANTIDETECT_PROVIDER = "gologin";
    expect(() => createAntidetectAdapter()).toThrow(/không hợp lệ/);
  });
});
