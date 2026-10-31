/**
 * Phạm vi bàn giao: kiểm hành vi thật qua biến môi trường, và kiểm rằng chốt chặn có nối
 * vào hai lối vào đăng bài.
 *
 * Phần thứ hai kiểm bằng chuỗi ký tự trong file nguồn — cách kiểm mà `guarded-action.ts` chê
 * là "gần như luôn xanh". Chê đúng, nhưng đúng cho trường hợp của nó chứ không phải của đây:
 * ở đó cái cần chứng minh là một lượt gọi CÓ chạy trong mọi nhánh, thứ mà quét chuỗi không
 * thấy được. Ở đây cái cần chứng minh nhỏ hơn nhiều — chốt chặn còn được import và còn được
 * gọi trong file. Ai gỡ nó ra để "cho đỡ vướng" sẽ thấy đỏ ngay.
 *
 * Chặn thật thì đã có test hành vi ở `post-job-actions.database.test.ts` chạy qua cơ sở dữ
 * liệu thật.
 */
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { afterEach, describe, expect, it } from "vitest";
import { ParkedScopeBanner } from "@/components/layout/parked-scope-banner";
import {
  ROLLOUT_SCOPE_ENV,
  isPlatformInRolloutScope,
  isPostingFullyParked,
  parkedPlatformMessage,
  parkedPlatforms,
  rolloutPlatformLabel,
} from "./rollout-scope";

const original = process.env[ROLLOUT_SCOPE_ENV];

afterEach(() => {
  if (original === undefined) delete process.env[ROLLOUT_SCOPE_ENV];
  else process.env[ROLLOUT_SCOPE_ENV] = original;
});

function setScope(value: string | undefined) {
  if (value === undefined) delete process.env[ROLLOUT_SCOPE_ENV];
  else process.env[ROLLOUT_SCOPE_ENV] = value;
}

describe("rollout scope", () => {
  it("parks every platform when the environment variable is unset", () => {
    setScope(undefined);
    expect(isPlatformInRolloutScope("FACEBOOK_PAGE")).toBe(false);
    expect(isPlatformInRolloutScope("REDDIT")).toBe(false);
    expect(isPlatformInRolloutScope("FACEBOOK_GROUP")).toBe(false);
    expect(isPostingFullyParked()).toBe(true);
  });

  it("treats an empty value as fully parked instead of fully open", () => {
    setScope("");
    expect(isPostingFullyParked()).toBe(true);
  });

  it("opens only listed platforms", () => {
    setScope("FACEBOOK_PAGE");
    expect(isPlatformInRolloutScope("FACEBOOK_PAGE")).toBe(true);
    expect(isPlatformInRolloutScope("FACEBOOK_GROUP")).toBe(false);
    expect(isPlatformInRolloutScope("REDDIT")).toBe(false);
    expect(parkedPlatforms()).toEqual(["REDDIT", "FACEBOOK_GROUP"]);
    expect(isPostingFullyParked()).toBe(false);
  });

  it("ignores whitespace and letter case", () => {
    setScope(" facebook_page , reddit ");
    expect(isPlatformInRolloutScope("FACEBOOK_PAGE")).toBe(true);
    expect(isPlatformInRolloutScope("REDDIT")).toBe(true);
  });

  it("parks unknown target types", () => {
    setScope("FACEBOOK_PAGE");
    expect(isPlatformInRolloutScope("TIKTOK")).toBe(false);
    expect(isPlatformInRolloutScope("")).toBe(false);
  });

  it("uses a friendly label and gives operators a route back", () => {
    const message = parkedPlatformMessage("FACEBOOK_PAGE");
    expect(message).toContain("Facebook Page");
    expect(message).toContain("viewing history only");
    expect(message).toContain("posting is unavailable");
    expect(message).toContain("/accounts");
    expect(message).not.toContain("FACEBOOK_PAGE");
    expect(message).not.toContain(ROLLOUT_SCOPE_ENV);
  });

  it("does not expose an unknown enum to operators", () => {
    expect(rolloutPlatformLabel("SOME_NEW_PLATFORM")).toBe("This platform");
  });

  it("states that the banner is history-only and links to the nick vault", () => {
    const markup = renderToStaticMarkup(
      createElement(ParkedScopeBanner, { what: "posting queue" }),
    );

    expect(markup).toContain("viewing history only");
    expect(markup).toContain("posting is unavailable");
    expect(markup).toContain('href="/accounts"');
    expect(markup).not.toContain("current TikTok scope");
  });
});
