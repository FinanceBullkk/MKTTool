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
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import {
  ROLLOUT_SCOPE_ENV,
  isPlatformInRolloutScope,
  isPostingFullyParked,
  parkedPlatformMessage,
  parkedPlatforms,
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

describe("phạm vi bàn giao", () => {
  it("không đặt biến môi trường thì mọi nền tảng đều đóng", () => {
    setScope(undefined);
    expect(isPlatformInRolloutScope("FACEBOOK_PAGE")).toBe(false);
    expect(isPlatformInRolloutScope("REDDIT")).toBe(false);
    expect(isPlatformInRolloutScope("FACEBOOK_GROUP")).toBe(false);
    expect(isPostingFullyParked()).toBe(true);
  });

  it("chuỗi rỗng cũng là đóng, không phải là mở hết", () => {
    setScope("");
    expect(isPostingFullyParked()).toBe(true);
  });

  it("mở đúng nền tảng được liệt kê, không mở lây sang nền tảng khác", () => {
    setScope("FACEBOOK_PAGE");
    expect(isPlatformInRolloutScope("FACEBOOK_PAGE")).toBe(true);
    expect(isPlatformInRolloutScope("FACEBOOK_GROUP")).toBe(false);
    expect(isPlatformInRolloutScope("REDDIT")).toBe(false);
    expect(parkedPlatforms()).toEqual(["REDDIT", "FACEBOOK_GROUP"]);
    expect(isPostingFullyParked()).toBe(false);
  });

  it("bỏ qua khoảng trắng và không phân biệt hoa thường", () => {
    setScope(" facebook_page , reddit ");
    expect(isPlatformInRolloutScope("FACEBOOK_PAGE")).toBe(true);
    expect(isPlatformInRolloutScope("REDDIT")).toBe(true);
  });

  it("loại đích lạ thì đóng — không biết là không mở", () => {
    setScope("FACEBOOK_PAGE");
    expect(isPlatformInRolloutScope("TIKTOK")).toBe(false);
    expect(isPlatformInRolloutScope("")).toBe(false);
  });

  it("câu từ chối nói được nền tảng nào và mở lại bằng cách gì", () => {
    const message = parkedPlatformMessage("FACEBOOK_PAGE");
    expect(message).toContain("FACEBOOK_PAGE");
    expect(message).toContain(ROLLOUT_SCOPE_ENV);
  });
});

describe("chốt chặn đã nối vào lối vào đăng bài", () => {
  const read = (relative: string) => readFileSync(join(process.cwd(), relative), "utf8");

  it("đường publish Fanpage gọi chốt phạm vi", () => {
    const source = read("src/lib/facebook/facebook-publish-action.ts");
    expect(source).toContain("isPlatformInRolloutScope");
    expect(source).toContain("if (!isPlatformInRolloutScope(job.target.platform))");
  });

  it("đường xếp lịch job gọi chốt phạm vi", () => {
    const source = read("src/lib/queue/post-job-actions.ts");
    expect(source).toContain("isPlatformInRolloutScope");
    expect(source).toContain("if (!isPlatformInRolloutScope(scheduledTarget.platform))");
  });

  it("chốt phạm vi đứng TRƯỚC lượt gọi Graph API", () => {
    const source = read("src/lib/facebook/facebook-publish-action.ts");
    const guard = source.indexOf("isPlatformInRolloutScope(job.target.platform)");
    const publish = source.indexOf("publishToPage(");
    expect(guard).toBeGreaterThan(-1);
    expect(publish).toBeGreaterThan(-1);
    expect(guard).toBeLessThan(publish);
  });
});
