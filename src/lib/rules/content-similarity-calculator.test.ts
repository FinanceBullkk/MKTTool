import { describe, expect, it } from "vitest";
import { extractTrigrams, findMostSimilar, jaccardSimilarity } from "./content-similarity-calculator";
import { normalizeText } from "./text-normalizer";

describe("text-normalizer", () => {
  it("bỏ dấu câu, viết hoa và khoảng trắng thừa", () => {
    expect(normalizeText("  Xin CHÀO,   thế giới!!!  ")).toBe("xin chao the gioi");
  });

  it("bỏ dấu tiếng Việt và chữ đ để bài gõ có dấu / không dấu vẫn khớp", () => {
    expect(normalizeText("Đừng đăng trùng")).toBe("dung dang trung");
  });

  it("hai cách viết cùng một câu cho ra cùng một chuỗi", () => {
    expect(normalizeText("Self-hosted backup: 3 cách")).toBe(normalizeText("self hosted backup 3 cach"));
  });
});

describe("extractTrigrams", () => {
  it("chuỗi rỗng không có trigram nào", () => {
    expect(extractTrigrams("").size).toBe(0);
  });

  it("chuỗi ngắn hơn 3 ký tự giữ nguyên làm một token", () => {
    expect([...extractTrigrams("ab")]).toEqual(["ab"]);
  });

  it("cắt đúng số trigram", () => {
    expect([...extractTrigrams("abcd")]).toEqual(["abc", "bcd"]);
  });
});

describe("jaccardSimilarity", () => {
  const original =
    "Tôi tự dựng backup cho homelab bằng restic và một con NAS cũ, chạy ổn suốt hai năm nay.";

  it("hai câu giống hệt cho 1.0", () => {
    expect(jaccardSimilarity(original, original)).toBe(1);
  });

  it("chỉ khác dấu câu và viết hoa vẫn coi là trùng khít", () => {
    const retyped =
      "TÔI TỰ DỰNG BACKUP CHO HOMELAB BẰNG RESTIC VÀ MỘT CON NAS CŨ, CHẠY ỔN SUỐT HAI NĂM NAY!!!";
    expect(jaccardSimilarity(original, retyped)).toBe(1);
  });

  it("hai câu khác hẳn chủ đề cho dưới 0.2", () => {
    const different =
      "Giá thuê văn phòng quận 1 tăng mạnh trong quý này, nhiều công ty chuyển ra vùng ven.";
    expect(jaccardSimilarity(original, different)).toBeLessThan(0.2);
  });

  it("đổi vài từ trong cùng một bài cho khoảng 0.6-0.8 — đúng vùng cảnh báo", () => {
    const lightlyEdited =
      "Tôi tự dựng backup cho homelab bằng restic và một con NAS cũ, chạy ngon suốt ba năm rồi.";
    const score = jaccardSimilarity(original, lightlyEdited);
    expect(score).toBeGreaterThan(0.6);
    expect(score).toBeLessThan(0.8);
  });

  it("chuỗi rỗng luôn cho 0, không phải 1", () => {
    expect(jaccardSimilarity("", "")).toBe(0);
    expect(jaccardSimilarity(original, "   ")).toBe(0);
  });

  it("đối xứng", () => {
    const other = "Tôi dùng restic cho homelab, backup sang NAS cũ.";
    expect(jaccardSimilarity(original, other)).toBeCloseTo(jaccardSimilarity(other, original), 10);
  });
});

describe("findMostSimilar", () => {
  it("không có đối chứng thì trả null", () => {
    expect(findMostSimilar("bất kỳ", [])).toBeNull();
  });

  it("chọn đúng bài giống nhất chứ không phải bài đầu tiên", () => {
    const match = findMostSimilar("restic backup cho homelab", [
      { label: "bài lạc đề", text: "giá thuê văn phòng quận 1" },
      { label: "bài trùng", text: "restic backup cho homelab" },
      { label: "bài hơi giống", text: "backup cho homelab bằng rsync" },
    ]);

    expect(match?.candidate.label).toBe("bài trùng");
    expect(match?.score).toBe(1);
  });
});
