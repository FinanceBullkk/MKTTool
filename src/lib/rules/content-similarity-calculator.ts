/**
 * So độ giống hai bài bằng Jaccard trên tập trigram ký tự.
 *
 * Vì sao không dùng embedding/AI: trigram chạy trong micro giây, không cần mạng, không tốn tiền,
 * và bắt được đúng thứ cần bắt ở giai đoạn này — bài copy-paste rồi sửa vài chữ giữa các nick.
 * Bài "viết lại hoàn toàn cùng ý" thì lọt, chấp nhận (xem phần Risk của phase-02).
 */
import type { ComparableContent } from "./rule-types";
import { normalizeText } from "./text-normalizer";

const TRIGRAM_SIZE = 3;

export function extractTrigrams(normalized: string): Set<string> {
  if (normalized.length === 0) return new Set();
  if (normalized.length <= TRIGRAM_SIZE) return new Set([normalized]);

  const grams = new Set<string>();
  for (let i = 0; i + TRIGRAM_SIZE <= normalized.length; i += 1) {
    grams.add(normalized.slice(i, i + TRIGRAM_SIZE));
  }
  return grams;
}

/** 0 = không dính gì nhau, 1 = trùng khít. Chuỗi rỗng luôn cho 0 (không có gì để so). */
export function jaccardSimilarity(left: string, right: string): number {
  const leftGrams = extractTrigrams(normalizeText(left));
  const rightGrams = extractTrigrams(normalizeText(right));
  if (leftGrams.size === 0 || rightGrams.size === 0) return 0;

  let intersection = 0;
  for (const gram of leftGrams) {
    if (rightGrams.has(gram)) intersection += 1;
  }

  const union = leftGrams.size + rightGrams.size - intersection;
  return union === 0 ? 0 : intersection / union;
}

export interface SimilarityMatch {
  score: number;
  candidate: ComparableContent;
}

/** Bài giống nhất trong đống đối chứng. null khi không có gì để so. */
export function findMostSimilar(
  text: string,
  candidates: ComparableContent[],
): SimilarityMatch | null {
  let best: SimilarityMatch | null = null;

  for (const candidate of candidates) {
    const score = jaccardSimilarity(text, candidate.text);
    if (!best || score > best.score) best = { score, candidate };
  }

  return best;
}
