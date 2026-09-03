import { describe, expect, it } from "vitest";
import { extractTrigrams, findMostSimilar, jaccardSimilarity } from "./content-similarity-calculator";
import { normalizeText } from "./text-normalizer";

describe("text-normalizer", () => {
  it("removes punctuation, capitalization, and extra whitespace", () => {
    expect(normalizeText("  HELLO,   world!!!  ")).toBe("hello world");
  });

  it("removes accents and normalizes the Vietnamese d-with-stroke character", () => {
    const accented = `R${String.fromCodePoint(0xe9)}sum${String.fromCodePoint(0xe9)} ${String.fromCodePoint(0x110)}uplicate posts`;
    expect(normalizeText(accented)).toBe("resume duplicate posts");
  });

  it("normalizes two equivalent spellings to the same string", () => {
    expect(normalizeText("Self-hosted backup: 3 ways")).toBe(
      normalizeText("self hosted backup 3 ways"),
    );
  });
});

describe("extractTrigrams", () => {
  it("returns no trigrams for an empty string", () => {
    expect(extractTrigrams("").size).toBe(0);
  });

  it("keeps a string shorter than three characters as one token", () => {
    expect([...extractTrigrams("ab")]).toEqual(["ab"]);
  });

  it("extracts the correct trigrams", () => {
    expect([...extractTrigrams("abcd")]).toEqual(["abc", "bcd"]);
  });
});

describe("jaccardSimilarity", () => {
  const original =
    "I set up backups for my homelab with restic and an old NAS, and it has run reliably for two years.";

  it("returns 1.0 for identical sentences", () => {
    expect(jaccardSimilarity(original, original)).toBe(1);
  });

  it("treats punctuation and capitalization differences as an exact match", () => {
    const retyped =
      "I SET UP BACKUPS FOR MY HOMELAB WITH RESTIC AND AN OLD NAS, AND IT HAS RUN RELIABLY FOR TWO YEARS!!!";
    expect(jaccardSimilarity(original, retyped)).toBe(1);
  });

  it("scores unrelated topics below 0.2", () => {
    const different =
      "Office rental prices rose sharply this quarter, so several companies moved to the suburbs.";
    expect(jaccardSimilarity(original, different)).toBeLessThan(0.2);
  });

  it("places a lightly edited post in the warning range", () => {
    const lightlyEdited =
      "I set up backups for the homelab with restic and an old NAS, and it has run well for three years.";
    const score = jaccardSimilarity(original, lightlyEdited);
    expect(score).toBeGreaterThan(0.6);
    expect(score).toBeLessThan(0.8);
  });

  it("returns 0 for empty input instead of 1", () => {
    expect(jaccardSimilarity("", "")).toBe(0);
    expect(jaccardSimilarity(original, "   ")).toBe(0);
  });

  it("is symmetric", () => {
    const other = "I use restic to back up my homelab to an old NAS.";
    expect(jaccardSimilarity(original, other)).toBeCloseTo(jaccardSimilarity(other, original), 10);
  });
});

describe("findMostSimilar", () => {
  it("returns null when there are no comparison posts", () => {
    expect(findMostSimilar("anything", [])).toBeNull();
  });

  it("selects the most similar post instead of the first post", () => {
    const match = findMostSimilar("restic backup for homelab", [
      { label: "unrelated post", text: "office rent in the city center" },
      { label: "duplicate post", text: "restic backup for homelab" },
      { label: "similar post", text: "rsync backup for a homelab" },
    ]);

    expect(match?.candidate.label).toBe("duplicate post");
    expect(match?.score).toBe(1);
  });
});
