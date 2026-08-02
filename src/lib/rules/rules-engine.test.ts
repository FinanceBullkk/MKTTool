import { describe, expect, it } from "vitest";
import { normalizeThreadUrl } from "./rule-thread-collision";
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
    content: { type: "VALUE", title: "Backup homelab", body: "Restic + NAS cũ.", links: [] },
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
  if (!result) throw new Error(`Không có luật ${ruleId}`);
  return result.level;
}

function reasonOf(ctx: RuleContext, ruleId: string): string {
  return evaluateRules(ctx).results.find((entry) => entry.id === ruleId)?.reason ?? "";
}

describe("ngữ cảnh sạch", () => {
  it("không vi phạm luật nào", () => {
    const evaluation = evaluateRules(makeContext());
    expect(evaluation.level).toBe("ALLOW");
    expect(evaluation.blocks).toHaveLength(0);
    expect(evaluation.warnings).toHaveLength(0);
  });

  it("chạy đủ 10 luật, mỗi luật báo cáo một lần", () => {
    expect(evaluateRules(makeContext()).results).toHaveLength(10);
  });
});

/** Đích Fanpage — nick vẫn là FACEBOOK, chỉ khác loại đích. */
function facebookPageContext(overrides: Partial<RuleContext> = {}): RuleContext {
  const base = makeContext();
  return {
    ...base,
    account: { ...base.account, platform: "FACEBOOK", username: "Trang Cửa Hàng" },
    target: { ...base.target, name: "Fanpage chính thức", platform: "FACEBOOK_PAGE" },
    ...overrides,
  };
}

describe("luật theo nền tảng", () => {
  const COMMUNITY_ONLY = ["daily-cap", "target-cooldown", "promo-ratio", "thread-collision"];
  /** Chỉ Reddit mới có bộ dò shadowban — xem đầu rule-health-check.ts. */
  const REDDIT_ONLY = ["health-check"];

  it("Reddit chạy đủ 10 luật, không bỏ luật nào", () => {
    const evaluation = evaluateRules(makeContext());
    expect(evaluation.results).toHaveLength(10);
    expect(evaluation.skipped).toHaveLength(0);
  });

  it("Facebook Group giữ 4 luật cộng đồng, chỉ bỏ luật dò shadowban", () => {
    const ctx = facebookPageContext({
      target: { ...makeContext().target, name: "Group Homelab VN", platform: "FACEBOOK_GROUP" },
    });
    expect(evaluateRules(ctx).results).toHaveLength(9);
    expect(evaluateRules(ctx).skipped.map((rule) => rule.id)).toEqual(REDDIT_ONLY);
  });

  it("Fanpage bỏ 4 luật giữ nhịp cộng luật dò, giữ 5 luật còn lại", () => {
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

  it("Fanpage đăng 5 bài một ngày không bị chặn — chuyện thường của kênh thương hiệu", () => {
    const evaluation = evaluateRules(facebookPageContext({ postsSameDay: 5 }));
    expect(evaluation.level).toBe("ALLOW");
  });

  it("Fanpage đăng liên tiếp cùng ngày không bị luật nghỉ 24h chặn", () => {
    const evaluation = evaluateRules(facebookPageContext({ hoursToNearestPostSameTarget: 2 }));
    expect(evaluation.level).toBe("ALLOW");
  });

  it("Fanpage đăng toàn bài quảng cáo không bị tỷ lệ 9:1 chặn", () => {
    const evaluation = evaluateRules(
      facebookPageContext({
        content: { type: "PROMO", title: "Giảm giá 20%", body: "Tuần này thôi.", links: [] },
        promoTally: { valueCount: 0, promoCount: 12 },
      }),
    );
    expect(evaluation.level).toBe("ALLOW");
  });

  it("Fanpage trả lời dưới bài của chính mình không bị luật đụng độ chặn", () => {
    const evaluation = evaluateRules(
      facebookPageContext({
        threadCollisions: [{ accountUsername: "Nick admin", kind: "COMMENT", at: AT }],
      }),
    );
    expect(evaluation.level).toBe("ALLOW");
    expect(evaluation.overridable).toBe(true);
  });

  it("Fanpage VẪN bị chặn bởi luật sức khỏe nick — luật này áp cho mọi nền tảng", () => {
    const base = facebookPageContext();
    const ctx = { ...base, account: { ...base.account, status: "CHECKPOINT" } };
    expect(levelOf(ctx, "account-health")).toBe("BLOCK");
  });

  it("Fanpage VẪN bị chặn khi copy nguyên si bài đã đăng — Meta nhìn thấy hết", () => {
    const ctx = facebookPageContext({
      recentContentSamePlatform: [
        { label: "Fanpage phụ ngày 05/08", text: "Backup homelab\nRestic + NAS cũ." },
      ],
    });
    expect(levelOf(ctx, "content-similarity")).toBe("BLOCK");
  });

  it("luật bị bỏ KHÔNG lặng lẽ biến mất — nêu tên trong skipped để người dùng biết", () => {
    const labels = evaluateRules(facebookPageContext()).skipped.map((rule) => rule.label);
    expect(labels).toContain("Hạn mức ngày");
    expect(labels).toContain("Đụng độ thread (nick khác cùng đích)");
    expect(labels).toContain("Kết quả dò gần nhất");
  });
});

describe("luật 10 — kết quả dò gần nhất", () => {
  it("vừa dò xong và khỏe thì cho qua", () => {
    expect(levelOf(makeContext(), "health-check")).toBe("ALLOW");
  });

  it("chưa dò lần nào thì cảnh báo — không có tin xấu không phải là tin tốt", () => {
    expect(levelOf(makeContext({ latestHealthCheck: null }), "health-check")).toBe("WARN");
  });

  it("dò lâu rồi thì cảnh báo, số liệu cũ không nói được gì về hôm nay", () => {
    const ctx = makeContext({
      latestHealthCheck: { verdict: "HEALTHY", checkedAt: new Date(AT.getTime() - 9 * DAY) },
    });
    expect(levelOf(ctx, "health-check")).toBe("WARN");
    expect(reasonOf(ctx, "health-check")).toContain("9 ngày trước");
  });

  /**
   * Lý do chính khiến luật này tồn tại tách khỏi luật 1: luật 1 đọc `status` — thứ người tự
   * đặt — nên gỡ cách ly bằng tay là nó cho qua ngay. Luật này đọc thứ người ngoài nhìn thấy.
   */
  it("gỡ cách ly bằng tay mà chưa dò lại thì VẪN bị chặn", () => {
    const ctx = makeContext({
      account: { ...makeContext().account, status: "ALIVE" },
      latestHealthCheck: { verdict: "SHADOWBANNED", checkedAt: new Date(AT.getTime() - 1 * DAY) },
    });
    expect(levelOf(ctx, "account-health")).toBe("ALLOW");
    expect(levelOf(ctx, "health-check")).toBe("BLOCK");
  });

  it("bộ dò đang mù (ERROR) thì cảnh báo, không im lặng cho qua", () => {
    const ctx = makeContext({
      latestHealthCheck: { verdict: "ERROR", checkedAt: new Date(AT.getTime() - 1 * HOUR) },
    });
    expect(levelOf(ctx, "health-check")).toBe("WARN");
  });

  it("thấy ít bài hơn số đã đăng thì cảnh báo", () => {
    const ctx = makeContext({
      latestHealthCheck: { verdict: "WARN", checkedAt: new Date(AT.getTime() - 1 * HOUR) },
    });
    expect(levelOf(ctx, "health-check")).toBe("WARN");
  });
});

describe("luật 1 — sức khỏe nick", () => {
  it("chặn mọi trạng thái không phải ALIVE", () => {
    for (const status of ["COLD_START", "CHECKPOINT", "SHADOWBANNED", "DEAD"]) {
      const ctx = makeContext({ account: { ...makeContext().account, status } });
      expect(levelOf(ctx, "account-health")).toBe("BLOCK");
    }
  });
});

describe("luật 2 — cold start", () => {
  it("chặn khi giờ đăng còn nằm trong cold-start, kèm số ngày còn lại", () => {
    const ctx = makeContext({
      account: { ...makeContext().account, coldStartUntil: new Date(AT.getTime() + 5 * DAY) },
    });
    expect(levelOf(ctx, "cold-start")).toBe("BLOCK");
    expect(reasonOf(ctx, "cold-start")).toContain("5 ngày");
  });

  it("cho qua khi bài được xếp vào sau ngày hết cold-start", () => {
    const ctx = makeContext({
      at: new Date(AT.getTime() + 10 * DAY), // xếp lịch 10 ngày nữa
      account: { ...makeContext().account, coldStartUntil: new Date(AT.getTime() + 5 * DAY) },
    });
    // Lúc đăng thì cold-start đã hết được 5 ngày — ngoài cả ngưỡng cảnh báo 2 ngày.
    expect(levelOf(ctx, "cold-start")).toBe("ALLOW");
  });

  it("cảnh báo trong vài ngày đầu vừa hết cold-start", () => {
    const ctx = makeContext({
      account: { ...makeContext().account, coldStartUntil: new Date(AT.getTime() - 12 * HOUR) },
    });
    expect(levelOf(ctx, "cold-start")).toBe("WARN");
  });

  it("nick không đặt cold-start thì bỏ qua luật này", () => {
    const ctx = makeContext({ account: { ...makeContext().account, coldStartUntil: null } });
    expect(levelOf(ctx, "cold-start")).toBe("ALLOW");
  });
});

describe("luật 3 — điều kiện đích", () => {
  it("chặn khi thiếu karma", () => {
    const ctx = makeContext({ account: { ...makeContext().account, karma: 50 } });
    expect(levelOf(ctx, "target-eligibility")).toBe("BLOCK");
    expect(reasonOf(ctx, "target-eligibility")).toContain("100 karma");
  });

  it("chặn khi nick chưa đủ tuổi", () => {
    const ctx = makeContext({
      account: { ...makeContext().account, platformCreatedAt: new Date(AT.getTime() - 10 * DAY) },
    });
    expect(levelOf(ctx, "target-eligibility")).toBe("BLOCK");
  });

  it("cảnh báo khi karma dư dưới 20%", () => {
    const ctx = makeContext({ account: { ...makeContext().account, karma: 110 } });
    expect(levelOf(ctx, "target-eligibility")).toBe("WARN");
  });

  it("cảnh báo khi sub đòi tuổi nick mà chưa nhập ngày tạo", () => {
    const ctx = makeContext({ account: { ...makeContext().account, platformCreatedAt: null } });
    expect(levelOf(ctx, "target-eligibility")).toBe("WARN");
  });
});

describe("luật 4 — hạn mức ngày", () => {
  it("cảnh báo ở bài thứ hai, chặn từ bài thứ ba", () => {
    expect(levelOf(makeContext({ postsSameDay: 0 }), "daily-cap")).toBe("ALLOW");
    expect(levelOf(makeContext({ postsSameDay: 1 }), "daily-cap")).toBe("WARN");
    expect(levelOf(makeContext({ postsSameDay: 2 }), "daily-cap")).toBe("BLOCK");
  });
});

describe("luật 5 — nghỉ giữa 2 bài cùng đích", () => {
  it("chặn dưới 24 tiếng, cảnh báo dưới 48, cho qua sau đó", () => {
    expect(levelOf(makeContext({ hoursToNearestPostSameTarget: 5 }), "target-cooldown")).toBe("BLOCK");
    expect(levelOf(makeContext({ hoursToNearestPostSameTarget: 30 }), "target-cooldown")).toBe("WARN");
    expect(levelOf(makeContext({ hoursToNearestPostSameTarget: 72 }), "target-cooldown")).toBe("ALLOW");
    expect(levelOf(makeContext({ hoursToNearestPostSameTarget: null }), "target-cooldown")).toBe("ALLOW");
  });
});

describe("luật 6 — tỷ lệ promo 9:1", () => {
  const promo = { type: "PROMO" as const, title: "Thử app của bên mình", body: "Link ở dưới.", links: [] };

  it("bài hữu ích không bao giờ dính luật này", () => {
    expect(levelOf(makeContext({ promoTally: { valueCount: 0, promoCount: 0 } }), "promo-ratio")).toBe(
      "ALLOW",
    );
  });

  it("chặn và nói rõ còn thiếu mấy bài hữu ích", () => {
    const ctx = makeContext({ content: promo, promoTally: { valueCount: 3, promoCount: 0 } });
    expect(levelOf(ctx, "promo-ratio")).toBe("BLOCK");
    expect(reasonOf(ctx, "promo-ratio")).toContain("thiếu 6 bài hữu ích");
  });

  it("đủ 9 bài hữu ích thì cho qua kèm cảnh báo hết quota", () => {
    const ctx = makeContext({ content: promo, promoTally: { valueCount: 9, promoCount: 0 } });
    expect(levelOf(ctx, "promo-ratio")).toBe("WARN");
  });

  it("tỷ lệ trượt: bài quảng cáo thứ hai đòi thêm 9 bài hữu ích nữa", () => {
    const ctx = makeContext({ content: promo, promoTally: { valueCount: 10, promoCount: 1 } });
    expect(levelOf(ctx, "promo-ratio")).toBe("BLOCK");
    expect(reasonOf(ctx, "promo-ratio")).toContain("thiếu 8 bài hữu ích");
  });

  it("đích không áp tỷ lệ (promoRatio = 0) thì bỏ qua", () => {
    const ctx = makeContext({
      content: promo,
      target: { ...makeContext().target, promoRatio: 0 },
      promoTally: { valueCount: 0, promoCount: 5 },
    });
    expect(levelOf(ctx, "promo-ratio")).toBe("ALLOW");
  });
});

describe("luật 7 — trùng nội dung", () => {
  const original = { label: "u/bob ở r/selfhosted ngày 05/08", text: "Backup homelab\nRestic + NAS cũ." };

  it("chặn bài copy nguyên si của nick khác cùng nền tảng", () => {
    const ctx = makeContext({ recentContentSamePlatform: [original] });
    expect(levelOf(ctx, "content-similarity")).toBe("BLOCK");
    expect(reasonOf(ctx, "content-similarity")).toContain("u/bob");
  });

  it("bài khác hẳn thì cho qua", () => {
    const ctx = makeContext({
      recentContentSamePlatform: [
        { label: "u/bob", text: "Giá thuê văn phòng quận 1 tăng mạnh trong quý này." },
      ],
    });
    expect(levelOf(ctx, "content-similarity")).toBe("ALLOW");
  });

  it("danh sách đối chứng rỗng (bài đầu tiên) thì cho qua", () => {
    expect(levelOf(makeContext(), "content-similarity")).toBe("ALLOW");
  });
});

describe("luật 8 — đụng độ thread", () => {
  it("chặn khi nick khác của mình đã chạm đúng thread đó", () => {
    const ctx = makeContext({
      threadCollisions: [{ accountUsername: "u/bob", kind: "COMMENT", at: new Date(AT.getTime() - HOUR) }],
    });
    expect(levelOf(ctx, "thread-collision")).toBe("BLOCK");
    expect(reasonOf(ctx, "thread-collision")).toContain("u/bob");
  });

  it("không cho ghi đè khi luật này chặn", () => {
    const evaluation = evaluateRules(
      makeContext({
        threadCollisions: [{ accountUsername: "u/bob", kind: "UPVOTE", at: AT }],
      }),
    );
    expect(evaluation.level).toBe("BLOCK");
    expect(evaluation.overridable).toBe(false);
  });

  it("chỉ cảnh báo khi nick khác hoạt động cùng sub nhưng khác thread", () => {
    const ctx = makeContext({
      sameTargetNeighbors: [{ accountUsername: "u/bob", kind: "POST", at: AT }],
    });
    expect(levelOf(ctx, "thread-collision")).toBe("WARN");
  });
});

describe("luật 9 — chính sách link", () => {
  it("chặn khi đích cấm link mà bài có link", () => {
    const ctx = makeContext({
      target: { ...makeContext().target, allowsLinks: false },
      content: { ...makeContext().content, links: ["https://vidu.com"] },
    });
    expect(levelOf(ctx, "link-policy")).toBe("BLOCK");
  });

  it("cảnh báo khi bài có từ 2 link trở lên", () => {
    const ctx = makeContext({
      content: { ...makeContext().content, links: ["https://a.com", "https://b.com"] },
    });
    expect(levelOf(ctx, "link-policy")).toBe("WARN");
  });

  it("một link ở đích cho phép link thì không sao", () => {
    const ctx = makeContext({ content: { ...makeContext().content, links: ["https://a.com"] } });
    expect(levelOf(ctx, "link-policy")).toBe("ALLOW");
  });
});

describe("gộp verdict", () => {
  it("mức nặng nhất thắng và gom hết lý do, không dừng ở luật chặn đầu tiên", () => {
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

  it("chỉ có cảnh báo thì kết luận là WARN", () => {
    expect(evaluateRules(makeContext({ postsSameDay: 1 })).level).toBe("WARN");
  });

  it("giữ nguyên qua một vòng lưu/đọc JSON", () => {
    const evaluation = evaluateRules(makeContext({ postsSameDay: 2 }));
    expect(deserializeEvaluation(serializeEvaluation(evaluation))).toEqual(evaluation);
  });

  it("JSON hỏng không làm sập trang", () => {
    expect(deserializeEvaluation("{ không phải json")).toBeNull();
    expect(deserializeEvaluation(null)).toBeNull();
  });

  it("verdict cũ chưa có trường skipped vẫn đọc được, bù mảng rỗng", () => {
    // Bản ghi lưu trước khi có luật theo nền tảng — không được làm sập trang hàng đợi.
    const legacy = JSON.stringify({
      level: "ALLOW",
      results: [{ id: "daily-cap", label: "Hạn mức ngày", level: "ALLOW", reason: null, overridable: true }],
      blocks: [],
      warnings: [],
      overridable: true,
    });
    expect(deserializeEvaluation(legacy)?.skipped).toEqual([]);
  });
});

describe("ngưỡng chỉnh được", () => {
  it("giá trị trong RuleConfig ghi đè mặc định", () => {
    const thresholds = applyThresholdOverrides([{ key: "maxPostsPerDay", value: "5" }]);
    expect(thresholds.maxPostsPerDay).toBe(5);
    expect(levelOf(makeContext({ postsSameDay: 3, thresholds }), "daily-cap")).toBe("WARN");
  });

  it("key lạ hoặc giá trị hỏng bị bỏ qua, quay về mặc định chặt hơn", () => {
    const thresholds = applyThresholdOverrides([
      { key: "khongCoLuatNay", value: "9" },
      { key: "maxPostsPerDay", value: "nhiều lắm" },
      { key: "similarityBlock", value: "-1" },
    ]);
    expect(thresholds).toEqual(DEFAULT_RULE_THRESHOLDS);
  });
});

describe("normalizeThreadUrl", () => {
  it("rút mọi biến thể permalink Reddit về cùng một khóa", () => {
    const key = normalizeThreadUrl("https://www.reddit.com/r/selfhosted/comments/1a2b3c/backup_setup/");
    expect(normalizeThreadUrl("https://old.reddit.com/r/selfhosted/comments/1a2b3c/")).toBe(key);
    expect(normalizeThreadUrl("https://reddit.com/r/selfhosted/comments/1a2b3c/khac_slug/?utm=share")).toBe(
      key,
    );
    expect(key).toBe("reddit:1a2b3c");
  });

  it("URL thường thì bỏ www, tham số theo dõi và dấu / cuối", () => {
    expect(normalizeThreadUrl("https://www.facebook.com/pages/abc/?ref=bookmarks")).toBe(
      "facebook.com/pages/abc",
    );
    expect(normalizeThreadUrl("https://www.facebook.com/pages/abc?utm_source=x&__tn__=y")).toBe(
      "facebook.com/pages/abc",
    );
  });

  // Đây là bug đã sửa: bỏ nguyên query string thì mọi permalink.php ra cùng một khóa,
  // và luật 8 (không cho ghi đè) chặn nhầm vĩnh viễn.
  it("hai thread Facebook khác nhau nhưng cùng path cho hai khóa khác nhau", () => {
    const first = normalizeThreadUrl("https://www.facebook.com/permalink.php?story_fbid=111&id=999");
    const second = normalizeThreadUrl("https://www.facebook.com/permalink.php?story_fbid=222&id=999");

    expect(first).not.toBe(second);
    expect(normalizeThreadUrl("https://www.facebook.com/story.php?story_fbid=abc&id=1")).not.toBe(
      normalizeThreadUrl("https://www.facebook.com/story.php?story_fbid=xyz&id=1"),
    );
  });

  it("cùng một thread Facebook viết khác thứ tự tham số vẫn ra cùng khóa", () => {
    expect(normalizeThreadUrl("https://www.facebook.com/permalink.php?story_fbid=111&id=999")).toBe(
      normalizeThreadUrl("https://facebook.com/permalink.php?id=999&story_fbid=111&fbclid=abc"),
    );
  });

  it("hai bài Reddit khác nhau cho hai khóa khác nhau", () => {
    expect(normalizeThreadUrl("https://reddit.com/r/x/comments/aaa/")).not.toBe(
      normalizeThreadUrl("https://reddit.com/r/x/comments/bbb/"),
    );
  });

  it("chuỗi không phải URL vẫn dùng được làm khóa", () => {
    expect(normalizeThreadUrl("  Thread ABC  ")).toBe("thread abc");
  });
});
