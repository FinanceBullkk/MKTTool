/**
 * Kiểm chứng các tiêu chí nghiệm thu của Phase 02 trên database thật.
 *
 * Unit test chỉ chứng minh 9 luật tính đúng trên dữ liệu dựng tay. Script này chứng minh
 * phần còn lại: truy vấn có lấy đúng dữ liệu không, ràng buộc có khớp thực tế không.
 *
 * Idempotent: dọn rác của lần chạy trước khi bắt đầu, và luôn dọn khi kết thúc.
 *
 * Chạy: npm run rules:smoke
 * (cần cờ --env-file vì prisma-client.ts đọc DATABASE_URL ngay lúc import)
 */
import { prisma } from "../src/lib/db/prisma-client";
import { buildRuleContext } from "../src/lib/rules/rule-context-builder";
import { normalizeThreadUrl } from "../src/lib/rules/rule-thread-collision";
import { type RuleEvaluation, evaluateRules } from "../src/lib/rules/rules-engine";

const PREFIX = "smoke-rules-";
const DAY = 86_400_000;
const THREAD_URL = "https://www.reddit.com/r/smoke/comments/zzz999/bai_test/";

const BODY_A =
  "Mình tự dựng backup cho homelab bằng restic, đẩy sang một con NAS cũ, chạy ổn suốt hai năm. " +
  "Cấu hình mất khoảng một buổi, phần khó nhất là chính sách giữ bản sao.";

let failures = 0;

function check(name: string, passed: boolean, detail = "") {
  console.log(`  ${passed ? "PASS" : "FAIL"}  ${name}${detail ? ` — ${detail}` : ""}`);
  if (!passed) failures += 1;
}

async function cleanup() {
  const where = { account: { username: { startsWith: PREFIX } } };
  await prisma.interaction.deleteMany({ where });
  await prisma.postJob.deleteMany({ where });
  await prisma.contentItem.deleteMany({ where: { authorName: { startsWith: PREFIX } } });
  await prisma.account.deleteMany({ where: { username: { startsWith: PREFIX } } });
  await prisma.proxy.deleteMany({ where: { label: { startsWith: PREFIX } } });
  await prisma.persona.deleteMany({ where: { name: { startsWith: PREFIX } } });
  await prisma.platformTarget.deleteMany({ where: { name: { startsWith: PREFIX } } });
}

/** Nick khỏe, hết cold-start, dư karma — để chỉ luật đang thử nghiệm là thứ duy nhất lên tiếng. */
async function createAccount(suffix: string, proxyId: string, personaId: string) {
  return prisma.account.create({
    data: {
      platform: "REDDIT",
      username: `${PREFIX}${suffix}`,
      passwordEnc: "x",
      emailAddress: `${suffix}@example.com`,
      emailPasswordEnc: "x",
      antidetectProfileId: `${PREFIX}profile-${suffix}`,
      personaId,
      proxyId,
      status: "ALIVE",
      karma: 5000,
      coldStartUntil: new Date(Date.now() - 60 * DAY),
      platformCreatedAt: new Date(Date.now() - 700 * DAY),
    },
  });
}

async function verdictFor(input: {
  accountId: string;
  targetId: string;
  contentItemId: string;
  scheduledAt: Date;
  threadUrl?: string;
}) {
  const built = await buildRuleContext({
    accountId: input.accountId,
    targetId: input.targetId,
    content: { contentItemId: input.contentItemId },
    scheduledAt: input.scheduledAt,
    threadUrl: input.threadUrl ?? null,
  });

  if (!built.ok) throw new Error(`Không dựng được ngữ cảnh: ${built.message}`);
  return evaluateRules(built.ctx);
}

function ruleLevel(evaluation: RuleEvaluation, ruleId: string) {
  return evaluation.results.find((result) => result.id === ruleId);
}

async function run() {
  const persona = await prisma.persona.create({
    data: { name: `${PREFIX}persona`, voice: "test", contentAngle: "test" },
  });

  const [proxyA, proxyB] = await Promise.all(
    [1, 2].map((index) =>
      prisma.proxy.create({
        data: {
          label: `${PREFIX}proxy-${index}`,
          host: `203.0.113.${100 + index}`, // dải TEST-NET-3, không đụng IP thật
          port: 8080,
          username: `${PREFIX}user`,
          passwordEnc: "x",
          country: "US",
        },
      }),
    ),
  );

  const accountA = await createAccount("nick-a", proxyA.id, persona.id);
  const accountB = await createAccount("nick-b", proxyB.id, persona.id);

  const target = await prisma.platformTarget.create({
    data: {
      platform: "REDDIT",
      name: `${PREFIX}r/selfhosted`,
      url: "https://example.com/r/smoke",
      minKarma: 100,
      minAccountAgeDays: 30,
      promoRatio: 9,
      allowsLinks: true,
    },
  });

  const contentA = await prisma.contentItem.create({
    data: {
      title: "Backup cho homelab bằng restic",
      body: BODY_A,
      type: "VALUE",
      authorName: `${PREFIX}tester`,
    },
  });

  const baseTime = new Date(Date.now() + 2 * DAY);

  // 0. Nick khỏe, bài đầu tiên, không có gì để so → phải cho qua.
  const clean = await verdictFor({
    accountId: accountA.id,
    targetId: target.id,
    contentItemId: contentA.id,
    scheduledAt: baseTime,
  });
  check("nick khỏe + bài đầu tiên được cho qua", clean.level === "ALLOW", clean.level);

  // 1. Hai nick, cùng một bài, cùng nền tảng → nick thứ hai bị chặn.
  await prisma.postJob.create({
    data: {
      contentItemId: contentA.id,
      accountId: accountA.id,
      targetId: target.id,
      scheduledAt: baseTime,
      status: "PENDING",
    },
  });

  const duplicate = await verdictFor({
    accountId: accountB.id,
    targetId: target.id,
    contentItemId: contentA.id,
    scheduledAt: new Date(baseTime.getTime() + 3 * DAY),
  });
  const similarity = ruleLevel(duplicate, "content-similarity");
  check(
    "nick thứ hai đăng lại đúng bài đó bị CHẶN",
    duplicate.level === "BLOCK" && similarity?.level === "BLOCK",
    similarity?.reason ?? "",
  );

  // 2. Bài quảng cáo khi mới có 3 bài hữu ích → chặn, nói rõ còn thiếu 6.
  for (let index = 0; index < 2; index += 1) {
    const filler = await prisma.contentItem.create({
      data: {
        title: `Bài hữu ích số ${index}`,
        body: `Nội dung khác hẳn nhau, chủ đề số ${index}: ${"xoay vòng ".repeat(index + 2)}`,
        type: "VALUE",
        authorName: `${PREFIX}tester`,
      },
    });
    await prisma.postJob.create({
      data: {
        contentItemId: filler.id,
        accountId: accountA.id,
        targetId: target.id,
        scheduledAt: new Date(baseTime.getTime() + (index + 1) * 10 * DAY),
        status: "POSTED",
      },
    });
  }

  const promo = await prisma.contentItem.create({
    data: {
      title: "Bên mình vừa ra công cụ quản lý backup",
      body: "Chi tiết ở trang chủ, ai cần thì thử.",
      type: "PROMO",
      authorName: `${PREFIX}tester`,
    },
  });

  const promoVerdict = await verdictFor({
    accountId: accountA.id,
    targetId: target.id,
    contentItemId: promo.id,
    scheduledAt: new Date(baseTime.getTime() + 60 * DAY),
  });
  const promoRule = ruleLevel(promoVerdict, "promo-ratio");
  check(
    "bài quảng cáo khi mới có 3 bài hữu ích bị CHẶN, nêu rõ còn thiếu 6",
    promoRule?.level === "BLOCK" && (promoRule.reason ?? "").includes("thiếu 6 bài hữu ích"),
    promoRule?.reason ?? "",
  );

  // 3. Hai nick đụng cùng một thread → chặn, không cho ghi đè.
  await prisma.interaction.create({
    data: {
      accountId: accountA.id,
      targetId: target.id,
      threadUrl: THREAD_URL,
      threadKey: normalizeThreadUrl(THREAD_URL),
      kind: "COMMENT",
    },
  });

  const collision = await verdictFor({
    accountId: accountB.id,
    targetId: target.id,
    contentItemId: promo.id,
    scheduledAt: new Date(baseTime.getTime() + 90 * DAY),
    // Cùng bài đó nhưng viết bằng URL khác — phải rút về cùng một khóa mới bắt được.
    threadUrl: "https://old.reddit.com/r/smoke/comments/zzz999/?utm_source=share",
  });
  const collisionRule = ruleLevel(collision, "thread-collision");
  check(
    "nick khác đụng đúng thread đó bị CHẶN",
    collisionRule?.level === "BLOCK",
    collisionRule?.reason ?? "",
  );
  check("luật đụng độ thread KHÔNG cho ghi đè", collision.overridable === false);

  // 4. Tốc độ: yêu cầu phi chức năng của phase-02 là dưới 200ms.
  const started = performance.now();
  await verdictFor({
    accountId: accountB.id,
    targetId: target.id,
    contentItemId: contentA.id,
    scheduledAt: baseTime,
  });
  const elapsed = performance.now() - started;
  check("bộ luật chạy dưới 200ms", elapsed < 200, `${Math.round(elapsed)}ms`);
}

async function main() {
  console.log("\nSmoke test — Phase 02 Hàng đợi content + Bộ luật an toàn\n");
  await cleanup();
  try {
    await run();
  } finally {
    await cleanup();
    await prisma.$disconnect();
  }
  console.log(`\n${failures === 0 ? "Tất cả kiểm tra đều đạt." : `${failures} kiểm tra KHÔNG đạt.`}\n`);
  process.exit(failures === 0 ? 0 : 1);
}

main().catch((error) => {
  console.error("Smoke test lỗi:", error instanceof Error ? error.message : error);
  process.exit(1);
});
