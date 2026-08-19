import { describe, expect, it } from "vitest";
import { NO_RELAY_LABEL, relayStatusLabel } from "./relay-status-label";

describe("relayStatusLabel", () => {
  it("máy đã khai bản thì hiện đúng con số đó", () => {
    expect(relayStatusLabel({ name: "AnhHao", relayVersion: 15 })).toBe("AnhHao · v15");
  });

  /** Đây là ca chính: null = chưa biết. Điền số vào đây là bịa. */
  it("máy chưa từng khai bản thì KHÔNG hiện số nào", () => {
    const label = relayStatusLabel({ name: "AnhHao", relayVersion: null });

    expect(label).toBe("AnhHao");
    expect(label).not.toMatch(/v\d/);
  });

  it("bản khác 15 vẫn hiện đúng bản đó — nhãn không được ghim vào một số", () => {
    expect(relayStatusLabel({ name: "Linh-PC", relayVersion: 13 })).toBe("Linh-PC · v13");
  });

  it("chưa ghi máy nào thì nói đúng như vậy", () => {
    expect(relayStatusLabel(null)).toBe(NO_RELAY_LABEL);
  });
});
