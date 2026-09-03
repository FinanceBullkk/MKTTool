import { describe, expect, it } from "vitest";
import { HEALTH_VERDICTS } from "@/lib/health/health-verdict";
import { isUnresolvableShareLink, normalizeThreadUrl } from "./rule-thread-collision";
import { DEFAULT_RULE_THRESHOLDS, applyThresholdOverrides } from "./rule-thresholds";
import type { RuleContext } from "./rule-types";
import { deserializeEvaluation, evaluateRules, serializeEvaluation } from "./rules-engine";

const AT = new Date("2026-08-10T09:00:00+07:00");
const DAY = 86_400_000;
const HOUR = 3_600_000;

/** Ngữ cảnh "mọi thứ đều ổn" — mỗi test chỉ chỉnh đúng thứ nó muốn thử. */
function makeContext(overrides: Partial<RuleContext> = {}): RuleContext {
  return {
    at: AT,
    account: {
      id: "acc-1",
      username: "u/anna",
      platform: "REDDIT",
      status: "ALIVE",
      karma: 500,
      coldStartUntil: new Date(AT.getTime() - 30 * DAY),
      platformCreatedAt: new Date(AT.getTime() - 400 * DAY),
    },
    target: {
      id: "tgt-1",
      name: "r/selfhosted",
      platform: "REDDIT",
      minKarma: 100,
      minAccountAgeDays: 30,
      promoRatio: 9,
      allowsLinks: true,
    },
    content: { type: "VALUE", title: "Backup homelab", body: "Restic + old NAS.", links: [] },
    postsSameDay: 0,
    hoursToNearestPostSameTarget: null,
    promoTally: { valueCount: 0, promoCount: 0 },
    recentContentSamePlatform: [],
    threadCollisions: [],
    sameTargetNeighbors: [],
    // Vừa dò xong và khỏe — "ngữ cảnh mọi thứ đều ổn" phải gồm cả việc ĐÃ KIỂM CHỨNG là ổn,
    // không phải chỉ là chưa có tin xấu.
    latestHealthCheck: { verdict: "HEALTHY", checkedAt: new Date(AT.getTime() - 2 * HOUR) },
    thresholds: DEFAULT_RULE_THRESHOLDS,
    ...overrides,
  };
}

function levelOf(ctx: RuleContext, ruleId: string) {
  const result = evaluateRules(ctx).results.find((entry) => entry.id === ruleId);
  if (!result) throw new Error(`Rule not found: ${ruleId}`);
  return result.level;
}

function reasonOf(ctx: RuleContext, ruleId: string): string {
  return evaluateRules(ctx).results.find((entry) => entry.id === ruleId)?.reason ?? "";
}

describe("context is clean", () => {
  it("no violations", () => {
    const evaluation = evaluateRules(makeContext());
    expect(evaluation.level).toBe("ALLOW");
    expect(evaluation.blocks).toHaveLength(0);
    expect(evaluation.warnings).toHaveLength(0);
  });

  it("run all 10 rules, each reporting once", () => {
    expect(evaluateRules(makeContext()).results).toHaveLength(10);
  });
});

/** Đích Fanpage — nick vẫn là FACEBOOK, chỉ khác loại đích. */
function facebookPageContext(overrides: Partial<RuleContext> = {}): RuleContext {
  const base = makeContext();
  return {
    ...base,
    account: { ...base.account, platform: "FACEBOOK", username: "Main Shop Page" },
    target: { ...base.target, name: "Official Fanpage", platform: "FACEBOOK_PAGE" },
    ...overrides,
  };
}

describe("rules by platform", () => {
  const COMMUNITY_ONLY = ["daily-cap", "target-cooldown", "promo-ratio", "thread-collision"];
  /** Chỉ Reddit mới có bộ dò shadowban — xem đầu rule-health-check.ts. */
  const REDDIT_ONLY = ["health-check"];

  it("Reddit runs all 10 rules, skipping none", () => {
    const evaluation = evaluateRules(makeContext());
    expect(evaluation.results).toHaveLength(10);
    expect(evaluation.skipped).toHaveLength(0);
  });

  it("Facebook Group keeps 4 community rules, only skipping health check rule", () => {
    const ctx = facebookPageContext({
      target: { ...makeContext().target, name: "Group Homelab VN", platform: "FACEBOOK_GROUP" },
    });
    expect(evaluateRules(ctx).results).toHaveLength(9);
    expect(evaluateRules(ctx).skipped.map((rule) => rule.id)).toEqual(REDDIT_ONLY);
  });

  it("Fanpage skips four community-cadence rules and the Reddit health check", () => {
    const evaluation = evaluateRules(facebookPageContext());

    expect(evaluation.skipped.map((rule) => rule.id).sort()).toEqual(
      [...COMMUNITY_ONLY, ...REDDIT_ONLY].sort(),
    );
    expect(evaluation.results).toHaveLength(5);
    expect(evaluation.results.map((result) => result.id).sort()).toEqual([
      "account-health",
      "cold-start",
      "content-similarity",
      "link-policy",
      "target-eligibility",
    ]);
  });

  it("allows a Fanpage to publish five posts per day as a normal brand cadence", () => {
    const evaluation = evaluateRules(facebookPageContext({ postsSameDay: 5 }));
    expect(evaluation.level).toBe("ALLOW");
  });

  it("Fanpage posts consecutively on the same day without being blocked by 24-hour cooldown rule", () => {
    const evaluation = evaluateRules(facebookPageContext({ hoursToNearestPostSameTarget: 2 }));
    expect(evaluation.level).toBe("ALLOW");
  });

  it("Fanpage posts all promotional posts without being blocked by 9:1 ratio", () => {
    const evaluation = evaluateRules(
      facebookPageContext({
        content: { type: "PROMO", title: "20% discount", body: "This week only.", links: [] },
        promoTally: { valueCount: 0, promoCount: 12 },
      }),
    );
    expect(evaluation.level).toBe("ALLOW");
  });

  it("Fanpage replying under its own post does not get blocked by collision rule", () => {
    const evaluation = evaluateRules(
      facebookPageContext({
        threadCollisions: [{ accountUsername: "Nick admin", kind: "COMMENT", at: AT }],
      }),
    );
    expect(evaluation.level).toBe("ALLOW");
    expect(evaluation.overridable).toBe(true);
  });

  it("Fanpage IS blocked by nick health check rule — this rule applies to all platforms", () => {
    const base = facebookPageContext();
    const ctx = { ...base, account: { ...base.account, status: "CHECKPOINT" } };
    expect(levelOf(ctx, "account-health")).toBe("BLOCK");
  });

  it("Fanpage IS blocked when copying entire content of posted article — Meta sees it all", () => {
    const ctx = facebookPageContext({
      recentContentSamePlatform: [
        { label: "Secondary Fanpage on 05/08", text: "Backup homelab\nRestic + old NAS." },
      ],
    });
    expect(levelOf(ctx, "content-similarity")).toBe("BLOCK");
  });

  it("rules skipped MUST NOT silently disappear — list names in skipped to inform users", () => {
    const labels = evaluateRules(facebookPageContext()).skipped.map((rule) => rule.label);
    expect(labels).toContain("Daily posting cap");
    expect(labels).toContain("Same-target collision (another nick)");
    expect(labels).toContain("Latest health check");
  });
});

describe("rule 10 — most recent check result", () => {
  it("allows a recently checked healthy nick", () => {
    expect(levelOf(makeContext(), "health-check")).toBe("ALLOW");
  });

  it("warns when a nick has never been checked because no evidence is not healthy evidence", () => {
    expect(levelOf(makeContext({ latestHealthCheck: null }), "health-check")).toBe("WARN");
  });

  it("warns when the latest check is too old to describe current health", () => {
    const ctx = makeContext({
      latestHealthCheck: { verdict: "HEALTHY", checkedAt: new Date(AT.getTime() - 9 * DAY) },
    });
    expect(levelOf(ctx, "health-check")).toBe("WARN");
    expect(reasonOf(ctx, "health-check")).toContain("9 days ago");
  });

  /**
   * Lý do chính khiến luật này tồn tại tách khỏi luật 1: luật 1 đọc `status` — thứ người tự
   * đặt — nên gỡ cách ly bằng tay là nó cho qua ngay. Luật này đọc thứ người ngoài nhìn thấy.
   */
  it("still blocks after manual quarantine release without a fresh check", () => {
    const ctx = makeContext({
      account: { ...makeContext().account, status: "ALIVE" },
      latestHealthCheck: { verdict: "SHADOWBANNED", checkedAt: new Date(AT.getTime() - 1 * DAY) },
    });
    expect(levelOf(ctx, "account-health")).toBe("ALLOW");
    expect(levelOf(ctx, "health-check")).toBe("BLOCK");
  });

  it("warns when the checker is blind instead of silently allowing the post", () => {
    const ctx = makeContext({
      latestHealthCheck: { verdict: "ERROR", checkedAt: new Date(AT.getTime() - 1 * HOUR) },
    });
    expect(levelOf(ctx, "health-check")).toBe("WARN");
  });

  it("warns when fewer posts are visible than the queue records", () => {
    const ctx = makeContext({
      latestHealthCheck: { verdict: "WARN", checkedAt: new Date(AT.getTime() - 1 * HOUR) },
    });
    expect(levelOf(ctx, "health-check")).toBe("WARN");
  });

  /**
   * Dò xong mà không có bài nào để so thì lần dò đó chỉ chứng minh nick còn tồn tại. Đây là
   * trạng thái của một nick đăng đều nhưng không ai bấm "Đã đăng" — đúng lúc cần cảnh báo
   * nhất thì cũng đúng lúc dễ trông như khỏe nhất.
   */
  it("warns when a completed check has no posted baseline", () => {
    const ctx = makeContext({
      latestHealthCheck: { verdict: "NO_BASELINE", checkedAt: new Date(AT.getTime() - 1 * HOUR) },
    });
    expect(levelOf(ctx, "health-check")).toBe("WARN");
    expect(reasonOf(ctx, "health-check")).toContain("Posted");
  });

  /**
   * Kết luận này CÓ THẬT trong `HEALTH_VERDICTS` nhưng luật 10 chưa từng nhắc tới, nên trước khi
   * sửa nó rơi thẳng xuống `return ALLOW` cuối hàm — cho đăng, im lặng.
   *
   * Cảnh báo chứ không chặn, vì bản thân nick không sao: thứ thiếu là SỔ SÁCH của mình (xem
   * `statusForcedBy` trong health-verdict.ts, nó cố ý không cách ly nick vì kết luận này). Nhưng
   * cũng không được im, vì luật 4, 5 và 6 đang đếm thiếu đúng số bài mà bộ dò vừa nhìn thấy.
   */
  it("warns when visible posts are missing from the queue counts", () => {
    const ctx = makeContext({
      latestHealthCheck: { verdict: "UNTRACKED_POSTS", checkedAt: new Date(AT.getTime() - HOUR) },
    });
    expect(levelOf(ctx, "health-check")).toBe("WARN");
    expect(reasonOf(ctx, "health-check")).toContain("undercounted");
  });

  /**
   * Luật 1 chặn mọi `status` nó không nhận ra; luật này từng làm ngược lại — cùng một họ dữ liệu,
   * hai mặc định trái nhau, và cái mặc định sai nằm ở đúng luật đọc thứ người ngoài nhìn thấy.
   */
  it("blocks an unknown verdict instead of allowing it", () => {
    const ctx = makeContext({
      latestHealthCheck: { verdict: "SOMETHING_NEW", checkedAt: new Date(AT.getTime() - HOUR) },
    });
    expect(levelOf(ctx, "health-check")).toBe("BLOCK");
    expect(reasonOf(ctx, "health-check")).toContain("does not know how to evaluate");
  });

  /**
   * Nhánh "kết luận lạ" phải đứng TRƯỚC phép kiểm cũ/mới. Nếu đứng sau, một kết luận lạ mà lại cũ
   * sẽ bị nhánh "số liệu cũ" nuốt mất và trả WARN — tức vẫn cho đăng, đúng lỗ hổng vừa bịt.
   */
  it("still blocks a stale unknown verdict instead of treating it as stale data", () => {
    const ctx = makeContext({
      latestHealthCheck: { verdict: "SOMETHING_NEW", checkedAt: new Date(AT.getTime() - 9 * DAY) },
    });
    expect(levelOf(ctx, "health-check")).toBe("BLOCK");
  });

  /**
   * Chốt chặn cho người thêm kết luận mới vào bộ dò: gặp test đỏ ở máy mình, chứ không gặp cả đàn
   * nick bị chặn trên máy chủ. Đây là nửa thứ hai của việc luật 10 giữ danh sách riêng — nửa đầu
   * là chặn lúc chạy, nửa này là báo lúc phát triển.
   */
  it("evaluates every checker verdict without falling into the unknown branch", () => {
    for (const verdict of HEALTH_VERDICTS) {
      const ctx = makeContext({
        latestHealthCheck: { verdict, checkedAt: new Date(AT.getTime() - HOUR) },
      });
      expect(reasonOf(ctx, "health-check") ?? "", `verdict ${verdict}`).not.toContain(
        "does not know how to evaluate",
      );
    }
  });
});

describe("rule 1 — nick health", () => {
  it("blocks every status other than ALIVE", () => {
    for (const status of ["COLD_START", "CHECKPOINT", "SHADOWBANNED", "DEAD"]) {
      const ctx = makeContext({ account: { ...makeContext().account, status } });
      expect(levelOf(ctx, "account-health")).toBe("BLOCK");
    }
  });
});

describe("rule 2 — cold start", () => {
  it("blocks a post scheduled during cold start and reports the remaining days", () => {
    const ctx = makeContext({
      account: { ...makeContext().account, coldStartUntil: new Date(AT.getTime() + 5 * DAY) },
    });
    expect(levelOf(ctx, "cold-start")).toBe("BLOCK");
    expect(reasonOf(ctx, "cold-start")).toContain("5 days");
  });

  it("allows a post scheduled after cold start ends", () => {
    const ctx = makeContext({
      at: new Date(AT.getTime() + 10 * DAY), // xếp lịch 10 ngày nữa
      account: { ...makeContext().account, coldStartUntil: new Date(AT.getTime() + 5 * DAY) },
    });
    // Lúc đăng thì cold-start đã hết được 5 ngày — ngoài cả ngưỡng cảnh báo 2 ngày.
    expect(levelOf(ctx, "cold-start")).toBe("ALLOW");
  });

  it("warns during the first few days after cold start ends", () => {
    const ctx = makeContext({
      account: { ...makeContext().account, coldStartUntil: new Date(AT.getTime() - 12 * HOUR) },
    });
    expect(levelOf(ctx, "cold-start")).toBe("WARN");
  });

  it("allows a nick with no cold-start date", () => {
    const ctx = makeContext({ account: { ...makeContext().account, coldStartUntil: null } });
    expect(levelOf(ctx, "cold-start")).toBe("ALLOW");
  });
});

describe("rule 3 — target eligibility", () => {
  it("blocks insufficient karma", () => {
    const ctx = makeContext({ account: { ...makeContext().account, karma: 50 } });
    expect(levelOf(ctx, "target-eligibility")).toBe("BLOCK");
    expect(reasonOf(ctx, "target-eligibility")).toContain("100 karma");
  });

  it("blocks a nick that is too new", () => {
    const ctx = makeContext({
      account: { ...makeContext().account, platformCreatedAt: new Date(AT.getTime() - 10 * DAY) },
    });
    expect(levelOf(ctx, "target-eligibility")).toBe("BLOCK");
  });

  it("warns when karma is less than 20% above the minimum", () => {
    const ctx = makeContext({ account: { ...makeContext().account, karma: 110 } });
    expect(levelOf(ctx, "target-eligibility")).toBe("WARN");
  });

  it("warns when the target requires account age but the creation date is missing", () => {
    const ctx = makeContext({ account: { ...makeContext().account, platformCreatedAt: null } });
    expect(levelOf(ctx, "target-eligibility")).toBe("WARN");
  });
});

describe("rule 4 — daily limit", () => {
  it("warn at post two, block from post three", () => {
    expect(levelOf(makeContext({ postsSameDay: 0 }), "daily-cap")).toBe("ALLOW");
    expect(levelOf(makeContext({ postsSameDay: 1 }), "daily-cap")).toBe("WARN");
    expect(levelOf(makeContext({ postsSameDay: 2 }), "daily-cap")).toBe("BLOCK");
  });
});

describe("rule 5 — same-target cooldown", () => {
  it("block within 24 hours, warn under 48, allow after that", () => {
    expect(levelOf(makeContext({ hoursToNearestPostSameTarget: 5 }), "target-cooldown")).toBe("BLOCK");
    expect(levelOf(makeContext({ hoursToNearestPostSameTarget: 30 }), "target-cooldown")).toBe("WARN");
    expect(levelOf(makeContext({ hoursToNearestPostSameTarget: 72 }), "target-cooldown")).toBe("ALLOW");
    expect(levelOf(makeContext({ hoursToNearestPostSameTarget: null }), "target-cooldown")).toBe("ALLOW");
  });
});

describe("rule 6 — 9:1 promo ratio", () => {
  const promo = {
    type: "PROMO" as const,
    title: "Try our app",
    body: "Link below.",
    links: [],
  };

  it("useful post never hits this rule", () => {
    expect(levelOf(makeContext({ promoTally: { valueCount: 0, promoCount: 0 } }), "promo-ratio")).toBe(
      "ALLOW",
    );
  });

  it("blocks and reports how many value posts are missing", () => {
    const ctx = makeContext({ content: promo, promoTally: { valueCount: 3, promoCount: 0 } });
    expect(levelOf(ctx, "promo-ratio")).toBe("BLOCK");
    expect(reasonOf(ctx, "promo-ratio")).toContain("Add 6 more value posts");
  });

  it("warns when this promotion exactly consumes the available ratio", () => {
    const ctx = makeContext({ content: promo, promoTally: { valueCount: 9, promoCount: 0 } });
    expect(levelOf(ctx, "promo-ratio")).toBe("WARN");
  });

  it("requires another nine value posts before a second promotion", () => {
    const ctx = makeContext({ content: promo, promoTally: { valueCount: 10, promoCount: 1 } });
    expect(levelOf(ctx, "promo-ratio")).toBe("BLOCK");
    expect(reasonOf(ctx, "promo-ratio")).toContain("Add 8 more value posts");
  });

  it("if no ratio (promoRatio = 0) then ignore target", () => {
    const ctx = makeContext({
      content: promo,
      target: { ...makeContext().target, promoRatio: 0 },
      promoTally: { valueCount: 0, promoCount: 5 },
    });
    expect(levelOf(ctx, "promo-ratio")).toBe("ALLOW");
  });
});

describe("rule 7 — duplicate content", () => {
  const original = {
    label: "u/bob on r/selfhosted, 05/08",
    text: "Backup homelab\nRestic + old NAS.",
  };

  it("block post copying verbatim of other user on same platform", () => {
    const ctx = makeContext({ recentContentSamePlatform: [original] });
    expect(levelOf(ctx, "content-similarity")).toBe("BLOCK");
    expect(reasonOf(ctx, "content-similarity")).toContain("u/bob");
  });

  it("allow if content is different", () => {
    const ctx = makeContext({
      recentContentSamePlatform: [
        { label: "u/bob", text: "Office rent in district 1 rises strongly this quarter." },
      ],
    });
    expect(levelOf(ctx, "content-similarity")).toBe("ALLOW");
  });

  it("allows the first post when there is no comparison set", () => {
    expect(levelOf(makeContext(), "content-similarity")).toBe("ALLOW");
  });
});

describe("rule 8 — thread collision", () => {
  it("blocks when another managed nick has touched the exact thread", () => {
    const ctx = makeContext({
      threadCollisions: [{ accountUsername: "u/bob", kind: "COMMENT", at: new Date(AT.getTime() - HOUR) }],
    });
    expect(levelOf(ctx, "thread-collision")).toBe("BLOCK");
    expect(reasonOf(ctx, "thread-collision")).toContain("u/bob");
  });

  it("does not allow an override when thread collision blocks", () => {
    const evaluation = evaluateRules(
      makeContext({
        threadCollisions: [{ accountUsername: "u/bob", kind: "UPVOTE", at: AT }],
      }),
    );
    expect(evaluation.level).toBe("BLOCK");
    expect(evaluation.overridable).toBe(false);
  });

  it("only warns when another managed nick is active on the same target but a different thread", () => {
    const ctx = makeContext({
      sameTargetNeighbors: [{ accountUsername: "u/bob", kind: "POST", at: AT }],
    });
    expect(levelOf(ctx, "thread-collision")).toBe("WARN");
  });
});

describe("rule 9 — link policy", () => {
  it("block when target disallows links and post contains links", () => {
    const ctx = makeContext({
      target: { ...makeContext().target, allowsLinks: false },
      content: { ...makeContext().content, links: ["https://vidu.com"] },
    });
    expect(levelOf(ctx, "link-policy")).toBe("BLOCK");
  });

  it("warn when post contains 2 or more links", () => {
    const ctx = makeContext({
      content: { ...makeContext().content, links: ["https://a.com", "https://b.com"] },
    });
    expect(levelOf(ctx, "link-policy")).toBe("WARN");
  });

  it("allows one link when the target permits links", () => {
    const ctx = makeContext({ content: { ...makeContext().content, links: ["https://a.com"] } });
    expect(levelOf(ctx, "link-policy")).toBe("ALLOW");
  });
});

describe("combine verdicts", () => {
  it("most severe verdict wins and combines all reasons, don't stop at first blocking rule", () => {
    const evaluation = evaluateRules(
      makeContext({
        account: { ...makeContext().account, status: "DEAD", karma: 1 },
        postsSameDay: 5,
      }),
    );

    expect(evaluation.level).toBe("BLOCK");
    expect(evaluation.blocks.map((entry) => entry.id).sort()).toEqual([
      "account-health",
      "daily-cap",
      "target-eligibility",
    ]);
    expect(evaluation.overridable).toBe(true); // toàn luật cho phép ghi đè
  });

  it("if only warnings, conclude as WARN", () => {
    expect(evaluateRules(makeContext({ postsSameDay: 1 })).level).toBe("WARN");
  });

  it("preserve across one round of JSON serialization/deserialization", () => {
    const evaluation = evaluateRules(makeContext({ postsSameDay: 2 }));
    expect(deserializeEvaluation(serializeEvaluation(evaluation))).toEqual(evaluation);
  });

  it("broken JSON does not crash page", () => {
    expect(deserializeEvaluation("{ not json")).toBeNull();
    expect(deserializeEvaluation(null)).toBeNull();
  });

  it("reads a legacy verdict without a skipped field and supplies an empty array", () => {
    // Bản ghi lưu trước khi có luật theo nền tảng — không được làm sập trang hàng đợi.
    const legacyLabel = "H\u1ea1n m\u1ee9c ng\u00e0y";
    const legacy = JSON.stringify({
      level: "ALLOW",
      results: [{ id: "daily-cap", label: legacyLabel, level: "ALLOW", reason: null, overridable: true }],
      blocks: [],
      warnings: [],
      overridable: true,
    });
    expect(deserializeEvaluation(legacy)?.skipped).toEqual([]);
    expect(deserializeEvaluation(legacy)?.results[0]?.label).toBe(legacyLabel);
  });
});

describe("editable rule thresholds", () => {
  it("value in RuleConfig overrides default", () => {
    const thresholds = applyThresholdOverrides([{ key: "maxPostsPerDay", value: "5" }]);
    expect(thresholds.maxPostsPerDay).toBe(5);
    expect(levelOf(makeContext({ postsSameDay: 3, thresholds }), "daily-cap")).toBe("WARN");
  });

  it("ignore unknown keys or broken values, revert to stricter default", () => {
    const thresholds = applyThresholdOverrides([
      { key: "khongCoLuatNay", value: "9" },
      { key: "maxPostsPerDay", value: "too much is enough" },
      { key: "similarityBlock", value: "-1" },
    ]);
    expect(thresholds).toEqual(DEFAULT_RULE_THRESHOLDS);
  });
});

describe("normalizeThreadUrl", () => {
  it("collapse all Reddit permalink variants to same key", () => {
    const key = normalizeThreadUrl("https://www.reddit.com/r/selfhosted/comments/1a2b3c/backup_setup/");
    expect(normalizeThreadUrl("https://old.reddit.com/r/selfhosted/comments/1a2b3c/")).toBe(key);
    expect(normalizeThreadUrl("https://reddit.com/r/selfhosted/comments/1a2b3c/khac_slug/?utm=share")).toBe(
      key,
    );
    expect(key).toBe("reddit:1a2b3c");
  });

  /**
   * Link rút gọn là dạng nút Share của app Reddit phát ra, tức dạng người dùng dán vào nhiều
   * nhất. Trước khi sửa, nó cho ra khóa `redd.it/1a2b3c` — khác hẳn `reddit:1a2b3c` của permalink
   * đầy đủ, nên hai nick vào cùng một thread bằng hai dạng link thì luật 8 không thấy đụng độ.
   * Mà luật 8 là luật DUY NHẤT không cho ghi đè, nên bỏ lọt ở đây là bỏ lọt hẳn.
   */
  it("collapse redd.it shortlinks to same key as full permalink", () => {
    const key = normalizeThreadUrl("https://www.reddit.com/r/selfhosted/comments/1a2b3c/backup/");

    expect(normalizeThreadUrl("https://redd.it/1a2b3c")).toBe(key);
    expect(normalizeThreadUrl("https://redd.it/1a2b3c/")).toBe(key);
    expect(normalizeThreadUrl("redd.it/1a2b3c")).toBe(key);
  });

  /** Khớp đúng host, không phải "có chứa chuỗi redd.it" — nếu không thì tên miền giả cũng lọt. */
  it("host matching only, not redd.it, is NOT considered a Reddit link", () => {
    expect(normalizeThreadUrl("https://notredd.it/1a2b3c")).toBe("notredd.it/1a2b3c");
    expect(normalizeThreadUrl("https://redd.it.evil.com/1a2b3c")).toBe("redd.it.evil.com/1a2b3c");
  });

  it("cannot resolve /s/ share links, so they produce a different key from a permalink", () => {
    // Ghi lại hành vi thật để không ai tưởng nhầm là đã xử lý: mã sau /s/ là mã mờ, chỉ redirect
    // của Reddit mới phân giải được. Vì vậy chốt nằm ở đầu vào, xem isUnresolvableShareLink.
    expect(normalizeThreadUrl("https://www.reddit.com/r/trove/s/abcdefgh12")).not.toBe(
      normalizeThreadUrl("https://www.reddit.com/r/trove/comments/1veg99o/tieu_de/"),
    );
  });

  it("normalize typical URLs by removing www, tracking params, and trailing /", () => {
    expect(normalizeThreadUrl("https://www.facebook.com/pages/abc/?ref=bookmarks")).toBe(
      "facebook.com/pages/abc",
    );
    expect(normalizeThreadUrl("https://www.facebook.com/pages/abc?utm_source=x&__tn__=y")).toBe(
      "facebook.com/pages/abc",
    );
  });

  // Đây là bug đã sửa: bỏ nguyên query string thì mọi permalink.php ra cùng một khóa,
  // và luật 8 (không cho ghi đè) chặn nhầm vĩnh viễn.
  it("two different Facebook threads but same path yields two different keys", () => {
    const first = normalizeThreadUrl("https://www.facebook.com/permalink.php?story_fbid=111&id=999");
    const second = normalizeThreadUrl("https://www.facebook.com/permalink.php?story_fbid=222&id=999");

    expect(first).not.toBe(second);
    expect(normalizeThreadUrl("https://www.facebook.com/story.php?story_fbid=abc&id=1")).not.toBe(
      normalizeThreadUrl("https://www.facebook.com/story.php?story_fbid=xyz&id=1"),
    );
  });

  it("same Facebook thread with params in different order still yields same key", () => {
    expect(normalizeThreadUrl("https://www.facebook.com/permalink.php?story_fbid=111&id=999")).toBe(
      normalizeThreadUrl("https://facebook.com/permalink.php?id=999&story_fbid=111&fbclid=abc"),
    );
  });

  it("two different Reddit posts yield two different keys", () => {
    expect(normalizeThreadUrl("https://reddit.com/r/x/comments/aaa/")).not.toBe(
      normalizeThreadUrl("https://reddit.com/r/x/comments/bbb/"),
    );
  });

  it("non-URL string still used as key", () => {
    expect(normalizeThreadUrl("  Thread ABC  ")).toBe("thread abc");
  });
});

/**
 * H109 — chốt đầu vào cho link share không phân giải được.
 *
 * Nửa còn lại của C27. `normalizeThreadUrl` rút được `redd.it/<id>` vì phần path chính là id bài,
 * nhưng `reddit.com/r/<sub>/s/<id>` thì không: mã đó mờ, chỉ đi theo redirect mới ra. Hàm thuần
 * không gọi mạng được, nên chặn lúc người ta dán — lúc họ còn đang mở đúng cái link đó.
 */
describe("isUnresolvableShareLink", () => {
  it("catch Reddit's /s/ share link at all host variations", () => {
    expect(isUnresolvableShareLink("https://www.reddit.com/r/trove/s/AbCdEfGh12")).toBe(true);
    expect(isUnresolvableShareLink("https://reddit.com/r/trove/s/abcdefgh12")).toBe(true);
    expect(isUnresolvableShareLink("https://old.reddit.com/r/trove/s/abcdefgh12/")).toBe(true);
    expect(isUnresolvableShareLink("reddit.com/r/trove/s/abcdefgh12")).toBe(true);
  });

  it("DO NOT block links that still resolve — otherwise this rule blocks normal functionality", () => {
    expect(
      isUnresolvableShareLink("https://www.reddit.com/r/trove/comments/1veg99o/tieu_de/"),
    ).toBe(false);
    // redd.it đã rút được từ C27, phải giữ nguyên đường đó.
    expect(isUnresolvableShareLink("https://redd.it/1veg99o")).toBe(false);
    expect(isUnresolvableShareLink("https://www.facebook.com/permalink.php?story_fbid=1&id=2")).toBe(
      false,
    );
  });

  /** Host chỉ trông giống Reddit thì không phải việc của chốt này. */
  it("do not accept fake domains", () => {
    expect(isUnresolvableShareLink("https://reddit.com.evil.test/r/x/s/abc")).toBe(false);
    expect(isUnresolvableShareLink("https://notreddit.com/r/x/s/abc")).toBe(false);
  });

  /** Bài Reddit có sub đặt tên là "s" vẫn phải đăng được — path phải khớp đúng /r/<sub>/s/<id>. */
  it("do not block paths that happen to contain an s", () => {
    expect(isUnresolvableShareLink("https://www.reddit.com/r/s/comments/1veg99o/tieu_de/")).toBe(
      false,
    );
    expect(isUnresolvableShareLink("https://www.reddit.com/user/ai_do/s/abc/them/nua")).toBe(false);
  });
});
