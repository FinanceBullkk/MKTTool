/**
 * Bảng ánh xạ quốc gia proxy → vân tay. Đây là phần đáng canh nhất của tính năng tạo profile.
 *
 * Sai ở đây không làm test nào khác đỏ và không có triệu chứng nào trên màn hình — nó chỉ dựng
 * ra một nick mang vân tay lệch proxy, y hệt thứ đã xảy ra thật hai lần (`sv-SE` trên IP Anh
 * 02/08/2026; `Africa/Johannesburg` trên proxy US, còn tới 07/08/2026).
 */
import { describe, expect, it } from "vitest";
import type { FingerprintOptions } from "./antidetect-browser-adapter";
import {
  planProfileFingerprint,
  profileNameForNick,
  stableHash,
} from "./profile-fingerprint-plan";

/** Rút gọn từ `list_fingerprint_options` thật, đo 07/08/2026. */
const OPTIONS: FingerprintOptions = {
  devices: [
    {
      family: "macbook-pro-14-m3",
      label: "MacBook Pro 14″ (M3)",
      screens: [
        { width: 1512, height: 982 },
        { width: 1920, height: 1080 },
      ],
    },
    {
      family: "windows-laptop-amd",
      label: "Windows laptop (AMD)",
      screens: [
        { width: 1680, height: 1050 },
        { width: 1920, height: 1080 },
      ],
    },
    {
      family: "windows-desktop-nvidia",
      label: "Windows desktop (NVIDIA)",
      screens: [{ width: 1536, height: 864 }],
    },
  ],
  locales: [
    {
      id: "en-US",
      label: "English (United States)",
      country: "us",
      timezones: [
        "America/New_York",
        "America/Chicago",
        "America/Denver",
        "America/Los_Angeles",
      ],
    },
    { id: "en-GB", label: "English (United Kingdom)", country: "gb", timezones: ["Europe/London"] },
    { id: "de-DE", label: "Deutsch", country: "de", timezones: ["Europe/Berlin"] },
  ],
};

const plan = (proxyCountry: string, seedKey = "anna", preferredDevice?: string) =>
  planProfileFingerprint({ proxyCountry, seedKey, options: OPTIONS, preferredDevice });

describe("proxy country determines locale", () => {
  it("maps US to en-US and selects a timezone from that group", () => {
    const result = plan("US");

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.plan.localeId).toBe("en-US");
    // MKT Browser rejects timezones outside the locale (INVALID_INPUT), so this is a real constraint
    // rather than a local convention.
    expect(OPTIONS.locales[0].timezones).toContain(result.plan.timezone);
  });

  it("looks up either lowercase or uppercase country codes", () => {
    const hoa = plan("GB");
    const thuong = plan("gb");

    expect(hoa.ok && hoa.plan.localeId).toBe("en-GB");
    expect(thuong.ok && thuong.plan.localeId).toBe("en-GB");
  });

  it("ignores surrounding whitespace during lookup", () => {
    const result = plan(" de ");

    expect(result.ok && result.plan.localeId).toBe("de-DE");
  });

  /**
   * Ca quan trọng nhất của cả file. Đoán bừa một locale là dựng ra đúng thứ hàm này sinh ra để
   * tránh — và nó sai âm thầm, không ai truy ra được vào ngày nick chết.
   */
  it("rejects a country outside the catalog instead of guessing", () => {
    const result = plan("VN");

    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.failure.reason).toBe("KHONG_CO_QUOC_GIA");
    expect(result.failure.message).toContain("VN");
    // The rejection must explain the next step instead of merely saying that the input is invalid.
    expect(result.failure.message).toContain("manually");
  });

  it("rejects an empty catalog when MKT Browser closes mid-operation and explains why", () => {
    const result = planProfileFingerprint({
      proxyCountry: "US",
      seedKey: "anna",
      options: { devices: [], locales: [] },
    });

    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.failure.reason).toBe("DANH_MUC_RONG");
  });
});

describe("seeding is stable without clustering", () => {
  /**
   * Xem trước trên giao diện nói "sẽ dựng America/Denver" thì lúc bấm tạo phải ra đúng thế. Dùng
   * `Math.random()` là hai lần gọi ra hai kết quả, và người dùng thấy công cụ tự nói khác mình.
   */
  it("returns the same result for every call with the same nick", () => {
    const lan1 = plan("US", "anna");
    const lan2 = plan("US", "anna");
    const lan3 = plan("US", "anna");

    expect(lan1).toEqual(lan2);
    expect(lan2).toEqual(lan3);
  });

  /**
   * US có 4 timezone. Nếu luôn lấy phần tử đầu thì 5 nick trên proxy US đều mang
   * `America/New_York` — một mối tương quan **do chính công cụ tạo ra**, đúng thứ cả dự án đang
   * chi tiền để tránh (10 proxy riêng, 10 vân tay riêng).
   */
  it("does not cluster every nick from one country into one timezone", () => {
    const nicks = ["anna", "bob", "carol", "dave", "erin", "frank", "grace", "heidi"];
    const timezones = new Set(
      nicks.map((nick) => {
        const result = plan("US", nick);
        return result.ok ? result.plan.timezone : "hong";
      }),
    );

    expect(timezones.size).toBeGreaterThan(1);
  });

  it("uses different noise seeds for different nicks", () => {
    const anna = plan("US", "anna");
    const bob = plan("US", "bob");

    expect(anna.ok && bob.ok && anna.seed === bob.seed).toBe(false);
  });

  it("returns the same stableHash value on every run", () => {
    expect(stableHash("anna")).toBe(stableHash("anna"));
    expect(stableHash("anna")).not.toBe(stableHash("bob"));
  });
});

describe("device family", () => {
  /**
   * Vân tay khai Windows trên một máy Windows thật: chỗ nào rò rỉ ở tầng dưới thì cũng không
   * mâu thuẫn với thứ đã khai. Chọn macOS trên máy Windows là tự tạo thêm một bề mặt để đối chiếu.
   */
  it("selects a Windows family by default without using macOS", () => {
    for (const nick of ["anna", "bob", "carol", "dave"]) {
      const result = plan("US", nick);
      expect(result.ok && result.plan.device.startsWith("windows-")).toBe(true);
    }
  });

  it("honors an explicitly selected family, including macOS", () => {
    const result = plan("US", "anna", "macbook-pro-14-m3");
    if (!result.ok) throw new Error("A plan must be selected");

    expect(result.plan.device).toBe("macbook-pro-14-m3");
    // Màn hình phải lấy từ đúng họ vừa chọn, không giữ màn hình của họ mặc định.
    expect([1512, 1920]).toContain(result.plan.screen.width);
  });

  it("ignores an unknown family and falls back to seeded selection", () => {
    const result = plan("US", "anna", "khong-co-that");

    expect(result.ok && result.plan.device.startsWith("windows-")).toBe(true);
  });

  it("always chooses a screen from the selected device family", () => {
    const result = plan("US", "anna");
    if (!result.ok) throw new Error("A plan must be selected");

    const device = OPTIONS.devices.find((entry) => entry.family === result.plan.device);
    expect(device?.screens).toContainEqual(result.plan.screen);
  });
});

describe("profile name", () => {
  it("creates a predictable name that can be found visually in the MKT Browser list", () => {
    expect(profileNameForNick("REDDIT", "anna")).toBe("REDDIT — anna");
  });
});
