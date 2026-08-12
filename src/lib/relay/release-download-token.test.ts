import { afterEach, describe, expect, it } from "vitest";
import {
  MIN_RELEASE_DOWNLOAD_TOKEN_LENGTH,
  RELEASE_DOWNLOAD_TOKEN_ENV,
  readReleaseDownloadToken,
  releaseDownloadTokenMatches,
} from "./release-download-token";

const TOKEN = "b".repeat(MIN_RELEASE_DOWNLOAD_TOKEN_LENGTH);

afterEach(() => {
  delete process.env[RELEASE_DOWNLOAD_TOKEN_ENV];
});

describe("release download token", () => {
  it("treats an unset token as token auth being unavailable", () => {
    expect(readReleaseDownloadToken()).toBeNull();
    expect(releaseDownloadTokenMatches(`Bearer ${TOKEN}`)).toBe(false);
  });

  it("treats whitespace as unset", () => {
    process.env[RELEASE_DOWNLOAD_TOKEN_ENV] = "   ";
    expect(readReleaseDownloadToken()).toBeNull();
  });

  // Một token yếu nguy hiểm hơn không có token: nó mở tuyến cho người đoán ra mà không ai biết.
  it("refuses a token below the minimum length instead of accepting it quietly", () => {
    process.env[RELEASE_DOWNLOAD_TOKEN_ENV] = "b".repeat(MIN_RELEASE_DOWNLOAD_TOKEN_LENGTH - 1);
    expect(() => readReleaseDownloadToken()).toThrow(/ít nhất/);
    expect(() => releaseDownloadTokenMatches(`Bearer short`)).toThrow(/ít nhất/);
  });

  it("accepts the exact bearer header", () => {
    process.env[RELEASE_DOWNLOAD_TOKEN_ENV] = TOKEN;
    expect(releaseDownloadTokenMatches(`Bearer ${TOKEN}`)).toBe(true);
  });

  it("rejects a wrong token of the same length", () => {
    process.env[RELEASE_DOWNLOAD_TOKEN_ENV] = TOKEN;
    expect(releaseDownloadTokenMatches(`Bearer ${"c".repeat(TOKEN.length)}`)).toBe(false);
  });

  // `timingSafeEqual` ném khi hai vế lệch độ dài, nên nhánh này phải trả false chứ không được đổ.
  it("rejects a token of a different length without throwing", () => {
    process.env[RELEASE_DOWNLOAD_TOKEN_ENV] = TOKEN;
    expect(releaseDownloadTokenMatches("Bearer c")).toBe(false);
    expect(releaseDownloadTokenMatches(`Bearer ${TOKEN}${TOKEN}`)).toBe(false);
  });

  it("rejects a missing header, a raw token, and a mistyped scheme", () => {
    process.env[RELEASE_DOWNLOAD_TOKEN_ENV] = TOKEN;
    expect(releaseDownloadTokenMatches(null)).toBe(false);
    expect(releaseDownloadTokenMatches(TOKEN)).toBe(false);
    expect(releaseDownloadTokenMatches(`bearer ${TOKEN}`)).toBe(false);
    expect(releaseDownloadTokenMatches(`Bearer  ${TOKEN}`)).toBe(false);
    expect(releaseDownloadTokenMatches(` Bearer ${TOKEN}`)).toBe(false);
  });
});
