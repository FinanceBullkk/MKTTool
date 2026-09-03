import { describe, expect, it } from "vitest";
import { describeSelectionChange } from "./selection-change";

const OPTIONS = [
  { id: "a", label: "Alpha" },
  { id: "b", label: "Beta" },
];

describe("describeSelectionChange", () => {
  it("does not confirm when the submitted selection is unchanged", () => {
    expect(
      describeSelectionChange({
        initial: OPTIONS[0],
        nextValue: "a",
        options: OPTIONS,
        emptyLabel: "Not assigned",
      }),
    ).toBeNull();
    expect(
      describeSelectionChange({
        initial: null,
        nextValue: "  ",
        options: OPTIONS,
        emptyLabel: "Not assigned",
      }),
    ).toBeNull();
  });

  it("returns user-facing before and after labels for a real change", () => {
    expect(
      describeSelectionChange({
        initial: OPTIONS[0],
        nextValue: "b",
        options: OPTIONS,
        emptyLabel: "Not assigned",
      }),
    ).toEqual({
      beforeValue: "a",
      afterValue: "b",
      beforeLabel: "Alpha",
      afterLabel: "Beta",
    });
  });

  it("describes clearing a selection without inventing a replacement", () => {
    expect(
      describeSelectionChange({
        initial: OPTIONS[0],
        nextValue: "",
        options: OPTIONS,
        emptyLabel: "Not assigned",
      }),
    ).toMatchObject({ beforeLabel: "Alpha", afterLabel: "Not assigned" });
  });
});
