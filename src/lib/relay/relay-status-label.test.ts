import { describe, expect, it } from "vitest";
import { NO_RELAY_LABEL, relayStatusLabel } from "./relay-status-label";

describe("relayStatusLabel", () => {
  it("shows the reported version number", () => {
    expect(relayStatusLabel({ name: "AnhHao", relayVersion: 15 })).toBe("AnhHao · v15");
  });

  /** Đây là ca chính: null = chưa biết. Điền số vào đây là bịa. */
  it("shows no version number when the Relay PC has never reported one", () => {
    const label = relayStatusLabel({ name: "AnhHao", relayVersion: null });

    expect(label).toBe("AnhHao");
    expect(label).not.toMatch(/v\d/);
  });

  it("shows versions other than 15 without pinning the label to one number", () => {
    expect(relayStatusLabel({ name: "Linh-PC", relayVersion: 13 })).toBe("Linh-PC · v13");
  });

  it("states that no Relay PCs are registered", () => {
    expect(relayStatusLabel(null)).toBe(NO_RELAY_LABEL);
  });
});
