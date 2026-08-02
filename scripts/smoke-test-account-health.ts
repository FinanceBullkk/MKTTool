/**
 * Kiểm chứng Phase 03 (theo dõi sức khỏe nick) KHÔNG cần nick thật, KHÔNG cần proxy.
 *
 * Hai phần tách bạch:
 *  A. Đường đi trong máy — ghi bản ghi dò, ép trạng thái nick, và bộ luật Phase 02 có chặn
 *     job của nick vừa bị cách ly không. Không chạm mạng.
 *  B. HTML thật của Reddit — mở trang profile của một nick công khai và một tên chắc chắn
 *     không tồn tại, xem parser có đọc đúng không. Đây là phần duy nhất cần mạng, và cũng là
 *     phần duy nhất bắt được lúc Reddit đổi giao diện.
 *
 * Phần B đi thẳng, KHÔNG qua proxy quan sát viên: nó kiểm parser chứ không kiểm proxy, và
 * bắt phải có proxy mới chạy được thì cái test hay hỏng nhất lại là cái ít được chạy nhất.
 *
 * Idempotent: dọn rác của lần chạy trước khi bắt đầu, và luôn dọn khi kết thúc.
 *
 * Chạy: npm run health:smoke
 */
import { chromium } from "playwright";
import { encryptCredential } from "../src/lib/crypto/credential-encryption";
import { prisma } from "../src/lib/db/prisma-client";
import { detectCheckpoint } from "../src/lib/health/checkpoint-detector";
import { recordHealthCheck } from "../src/lib/health/health-check-recorder";
import { evaluateHealth } from "../src/lib/health/health-status-evaluator";
import { parseRedditProfile } from "../src/lib/health/reddit-profile-parser";
import {
  OBSERVATION_WINDOW_DAYS,
  redditProfileUrl,
} from "../src/lib/health/reddit-shadowban-prober";
import { ruleAccountHealth } from "../src/lib/rules/rule-account-health";
import type { RuleContext } from "../src/lib/rules/rule-types";

const PREFIX = "smoke-health-";

/** Nick công khai chắc chắn tồn tại. Đổi được bằng biến môi trường nếu nick này biến mất. */
const LIVE_USERNAME = process.env.HEALTH_SMOKE_USERNAME?.trim() || "spez";

let failures = 0;

function check(name: string, passed: boolean, detail = "") {
  console.log(`  ${passed ? "PASS" : "FAIL"}  ${name}${detail ? ` — ${detail}` : ""}`);
  if (!passed) failures += 1;
}

async function cleanup() {
  // AuditLog cố ý không có quan hệ tới Account (nhật ký phải sống lâu hơn thứ nó ghi lại),
  // nên phải gom id trước rồi xóa theo id.
  const seeded = await prisma.account.findMany({
    where: { username: { startsWith: PREFIX } },
    select: { id: true },
  });
  const accountIds = seeded.map((account) => account.id);

  if (accountIds.length > 0) {
    await prisma.healthCheck.deleteMany({ where: { accountId: { in: accountIds } } });
    await prisma.auditLog.deleteMany({ where: { accountId: { in: accountIds } } });
  }

  await prisma.account.deleteMany({ where: { username: { startsWith: PREFIX } } });
  await prisma.proxy.deleteMany({ where: { label: { startsWith: PREFIX } } });
  await prisma.persona.deleteMany({ where: { name: { startsWith: PREFIX } } });
}

async function seedAccount(): Promise<{ id: string; username: string; status: string }> {
  const persona = await prisma.persona.create({
    data: { name: `${PREFIX}nhan vat`, voice: "thân mật", contentAngle: "self-hosting" },
  });
  // Địa chỉ dựng từ mốc thời gian: bảng Proxy có ràng buộc duy nhất (host, port, username),
  // và địa chỉ giả "đẹp" kiểu 10.0.0.1:8080 rất dễ đụng rác của smoke test khác.
  const unique = Date.now() % 100_000;
  const proxy = await prisma.proxy.create({
    data: {
      label: `${PREFIX}proxy`,
      host: `10.255.${Math.floor(unique / 256) % 256}.${unique % 256}`,
      port: 40_000 + (unique % 20_000),
      username: `${PREFIX}user`,
      passwordEnc: encryptCredential("mat-khau-gia"),
      country: "GB",
    },
  });

  return prisma.account.create({
    data: {
      platform: "REDDIT",
      username: `${PREFIX}nick`,
      passwordEnc: encryptCredential("mat-khau-gia"),
      emailAddress: "smoke@example.com",
      emailPasswordEnc: encryptCredential("mat-khau-gia"),
      antidetectProfileId: `${PREFIX}profile`,
      personaId: persona.id,
      proxyId: proxy.id,
      status: "ALIVE",
      karma: 100,
    },
    select: { id: true, username: true, status: true },
  });
}

/** ── Phần A: đường đi trong máy ─────────────────────────────────────────────── */
async function partA() {
  console.log("\nA. Đường đi trong máy (không chạm mạng)");
  const account = await seedAccount();

  // Nick bị Reddit trả về "nobody goes by that name" = shadowban toàn cục.
  const evaluation = evaluateHealth({
    checkpoint: null,
    profile: { kind: "MISSING" },
    expectedPosts: 3,
    visiblePosts: null,
    windowDays: OBSERVATION_WINDOW_DAYS,
  });
  check("nick vô hình với người ngoài → SHADOWBANNED", evaluation.verdict === "SHADOWBANNED");

  const recorded = await recordHealthCheck(account, {
    evaluation,
    karma: 250,
    visiblePosts: 0,
    expectedPosts: 3,
    screenshot: null,
  });
  check("bộ dò ép trạng thái nick sang SHADOWBANNED", recorded.statusChangedTo === "SHADOWBANNED");

  const after = await prisma.account.findUniqueOrThrow({ where: { id: account.id } });
  check("trạng thái nick trong DB đã đổi", after.status === "SHADOWBANNED");
  check("karma đọc được đã ghi vào nick", after.karma === 250);
  check("lý do cách ly được lưu để người đọc", Boolean(after.quarantineReason));

  const audit = await prisma.auditLog.findFirst({
    where: { accountId: account.id, action: "HEALTH_STATUS_FORCED" },
  });
  check("có AuditLog ghi lại lần ép trạng thái", audit !== null);

  // Tiêu chí nghiệm thu của Phase 03: nick bị cách ly thì Phase 02 tự chặn mọi job.
  const verdict = ruleAccountHealth({ account: after } as unknown as RuleContext);
  check("bộ luật Phase 02 chặn job của nick vừa bị cách ly", verdict.level === "BLOCK");

  // Dò khỏe sau đó KHÔNG được tự gỡ cách ly.
  const healthy = evaluateHealth({
    checkpoint: null,
    profile: { kind: "OK", karma: 260, postTimestamps: [], commentCount: 0 },
    expectedPosts: 0,
    visiblePosts: 0,
    windowDays: OBSERVATION_WINDOW_DAYS,
  });
  const second = await recordHealthCheck(
    { ...account, status: after.status },
    { evaluation: healthy, karma: 260, visiblePosts: 0, expectedPosts: 0, screenshot: null },
  );
  check("một lần dò khỏe KHÔNG tự gỡ cách ly", second.statusChangedTo === null);

  const checks = await prisma.healthCheck.count({ where: { accountId: account.id } });
  check("giữ đủ lịch sử cả hai lần dò", checks === 2);
}

/** ── Phần B: HTML thật của Reddit ───────────────────────────────────────────── */
async function partB() {
  console.log("\nB. HTML thật của Reddit (cần mạng, không cần proxy/nick)");

  const missingUsername = `mkttool-probe-${Math.random().toString(36).slice(2, 10)}`;
  const browser = await chromium.launch({ headless: true });

  try {
    const context = await browser.newContext({
      userAgent:
        "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) " +
        "Chrome/140.0.0.0 Safari/537.36",
      extraHTTPHeaders: { "accept-language": "en-US,en;q=0.9" },
    });
    context.setDefaultTimeout(30_000);

    async function load(
      username: string,
    ): Promise<{ url: string; html: string; status: number }> {
      const page = await context.newPage();
      try {
        const response = await page.goto(redditProfileUrl(username), {
          waitUntil: "domcontentloaded",
        });
        return { url: page.url(), html: await page.content(), status: response?.status() ?? 0 };
      } finally {
        await page.close();
      }
    }

    const live = await load(LIVE_USERNAME);
    const liveBlock = detectCheckpoint(live);
    if (liveBlock?.scope === "PROBE") {
      console.log(
        `  BỎ QUA  Reddit chặn chính máy này (${liveBlock.reason}) — ` +
          "chạy lại sau, hoặc chạy qua proxy khác. Không kết luận gì về parser.",
      );
      return;
    }

    const liveProfile = parseRedditProfile(live);
    check(`đọc được profile công khai u/${LIVE_USERNAME}`, liveProfile.kind === "OK");
    if (liveProfile.kind === "OK") {
      check("đọc được karma từ trang thật", liveProfile.karma !== null, `karma=${liveProfile.karma}`);
      check(
        "đọc được danh sách hoạt động",
        liveProfile.postTimestamps.length + liveProfile.commentCount > 0,
        `${liveProfile.postTimestamps.length} bài, ${liveProfile.commentCount} comment`,
      );
    }
    check("trang profile bình thường không bị coi là checkpoint", liveBlock === null);

    check(`u/${LIVE_USERNAME} trả HTTP 200`, live.status === 200, `status=${live.status}`);

    const missing = await load(missingUsername);
    // Tín hiệu shadowban thật nằm ở đây: Reddit trả 404 cho nick nó coi như không tồn tại.
    check(`tên không tồn tại trả HTTP 404`, missing.status === 404, `status=${missing.status}`);

    const missingProfile = parseRedditProfile(missing);
    check(
      `tên không tồn tại (u/${missingUsername}) → MISSING`,
      missingProfile.kind === "MISSING",
      `nhận được ${missingProfile.kind}`,
    );

    const missingVerdict = evaluateHealth({
      checkpoint: detectCheckpoint(missing),
      profile: missingProfile,
      expectedPosts: 2,
      visiblePosts: null,
      windowDays: OBSERVATION_WINDOW_DAYS,
    });
    check("kết luận cuối cùng cho nick vô hình là SHADOWBANNED", missingVerdict.verdict === "SHADOWBANNED");
  } finally {
    await browser.close();
  }
}

async function main() {
  console.log("Kiểm chứng Phase 03 — theo dõi sức khỏe nick\n");
  await cleanup();

  try {
    await partA();
    await partB();
  } finally {
    await cleanup();
    await prisma.$disconnect();
  }

  console.log(`\n${failures === 0 ? "Tất cả đều đạt." : `${failures} mục KHÔNG đạt.`}`);
  process.exit(failures === 0 ? 0 : 1);
}

main().catch(async (error) => {
  console.error("\nScript hỏng giữa chừng:", error);
  await cleanup().catch(() => {});
  await prisma.$disconnect();
  process.exit(1);
});
