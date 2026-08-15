import { describe, expect, it } from "vitest";
import { parseCompatibilityInstallerFloor } from "./compatibility-installer-floor";

describe("embedded compatibility installer floor", () => {
  it("accepts a positive safe integer and rejects unsafe values", () => {
    expect(parseCompatibilityInstallerFloor("4")).toBe(4);
    for (const value of ["0", "-1", "1.5", "text", String(Number.MAX_SAFE_INTEGER + 1)]) {
      expect(() => parseCompatibilityInstallerFloor(value)).toThrow("positive integer");
    }
  });
});
