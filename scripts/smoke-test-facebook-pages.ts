/**
 * Kiểm chứng phần Facebook Pages KHÔNG cần Meta App thật.
 *
 * Chưa có app thì vẫn kiểm được toàn bộ đường đi trong máy mình: token có mã hóa không,
 * kết nối có tự tạo đích đăng không, publisher có chặn đúng chỗ không, nhắc việc group
 * có hiện không. Phần duy nhất phải chờ token thật là chính lời gọi Graph API.
 *
 * Idempotent: dọn rác của lần chạy trước khi bắt đầu, và luôn dọn khi kết thúc.
 *
 * Chạy: npm run facebook:smoke
 */
import { prisma } from "../src/lib/db/prisma-client";
import { decryptCredential } from "../src/lib/crypto/credential-encryption";
import { loadVaultKey } from "../src/lib/crypto/encryption-key-loader";
import { loadDueManualPostReminders } from "../src/lib/queue/manual-post-reminders";
import { FacebookPublishError, publishToPage } from "../src/lib/facebook/facebook-page-publisher";
import { saveConnectionWithPages } from "../src/lib/facebook/facebook-token-manager";

const PREFIX = "smoke-fb-";
const PAGE_ID = "999000111222333"; // id không tồn tại trên Facebook — script không gọi mạng
const FAKE_PAGE_TOKEN = "EAAfake-page-token-cua-smoke-test";
const DAY = 86_400_000;

let failures = 0;

function check(name: string, passed: boolean, detail = "") {
  console.log(`  ${passed ? "PASS" : "FAIL"}  ${name}${detail ? ` — ${detail}` : ""}`);
  if (!passed) failures += 1;
}

async function cleanup() {
  await prisma.facebookPage.deleteMany({ where: { pageId: PAGE_ID } });
  await prisma.facebookConnection.deleteMany({ where: { fbUserId: `${PREFIX}user` } });

  const where = { account: { username: { startsWith: PREFIX } } };
  await prisma.interaction.deleteMany({ where });
  await prisma.postJob.deleteMany({ where });
  await prisma.contentItem.deleteMany({ where: { authorName: { startsWith: PREFIX } } });
  await prisma.account.deleteMany({ where: { username: { startsWith: PREFIX } } });
  await prisma.proxy.deleteMany({ where: { label: { startsWith: PREFIX } } });
  await prisma.persona.deleteMany({ where: { name: { startsWith: PREFIX } } });
  await prisma.platformTarget.deleteMany({ where: { name: { startsWith: PREFIX } } });
}

async function run() {
  // 1. Kết nối: lưu token đã mã hóa và tự tạo đích đăng cho Page.
  const saved = await saveConnectionWithPages(
    { id: `${PREFIX}user`, name: `${PREFIX}Nguyen Van A` },
    { accessToken: "EAAfake-user-token", expiresAt: new Date(Date.now() + 60 * DAY) },
    [{ id: PAGE_ID, name: `${PREFIX}Fanpage thuong hieu`, accessToken: FAKE_PAGE_TOKEN }],
  );
  check("kết nối lưu được 1 Page", saved.savedPages === 1);

  const page = await prisma.facebookPage.findUnique({
    where: { pageId: PAGE_ID },
    include: { target: true, connection: true },
  });
  check("Page tự nối với một đích đăng FACEBOOK_PAGE", page?.target?.platform === "FACEBOOK_PAGE");

  // 2. Token phải nằm trong DB dạng đã mã hóa, không phải dạng trần.
  const storedRaw = page?.accessTokenEnc ?? "";
  check("token KHÔNG lưu dạng trần", storedRaw !== FAKE_PAGE_TOKEN && !storedRaw.includes("EAAfake"));
  check("token giải mã lại đúng nguyên bản", decryptCredential(storedRaw, loadVaultKey("server")) === FAKE_PAGE_TOKEN);

  const connectionRaw = page?.connection.accessTokenEnc ?? "";
  check("user token cũng được mã hóa", decryptCredential(connectionRaw, loadVaultKey("server")) === "EAAfake-user-token");

  // 3. Kết nối lại phải ghi đè token cũ chứ không đẻ thêm dòng.
  await saveConnectionWithPages(
    { id: `${PREFIX}user`, name: `${PREFIX}Nguyen Van A` },
    { accessToken: "EAAfake-user-token-2", expiresAt: new Date(Date.now() + 60 * DAY) },
    [{ id: PAGE_ID, name: `${PREFIX}Fanpage thuong hieu`, accessToken: "EAAfake-page-token-2" }],
  );
  const pageCount = await prisma.facebookPage.count({ where: { pageId: PAGE_ID } });
  const refreshed = await prisma.facebookPage.findUnique({ where: { pageId: PAGE_ID } });
  check("kết nối lại KHÔNG tạo Page trùng", pageCount === 1, `${pageCount} dòng`);
  check(
    "kết nối lại thay bằng token mới",
    decryptCredential(refreshed?.accessTokenEnc ?? "", loadVaultKey("server")) === "EAAfake-page-token-2",
  );

  // 4. Token bị Facebook từ chối thì publisher chặn TRƯỚC khi gọi mạng.
  await prisma.facebookPage.update({
    where: { pageId: PAGE_ID },
    data: { tokenValid: false, tokenNote: "mã 190 — hết hạn" },
  });

  let blockedMessage = "";
  try {
    await publishToPage(PAGE_ID, { title: "T", body: "B", links: [] });
  } catch (error) {
    blockedMessage = error instanceof FacebookPublishError ? error.message : String(error);
  }
  check(
    "token hỏng thì chặn đăng ngay, nêu đúng lý do",
    blockedMessage.includes("mã 190"),
    blockedMessage,
  );

  // 5. Page chưa kết nối thì báo rõ, không im lặng nuốt bài.
  let missingMessage = "";
  try {
    await publishToPage("000-khong-ton-tai", { title: "T", body: "B", links: [] });
  } catch (error) {
    missingMessage = error instanceof FacebookPublishError ? error.message : String(error);
  }
  check("Page chưa kết nối thì báo rõ", missingMessage.includes("Chưa kết nối"), missingMessage);

  // 6. Nhắc việc group: job FACEBOOK_GROUP đến giờ phải hiện ra trên tổng quan.
  const persona = await prisma.persona.create({
    data: { name: `${PREFIX}persona`, voice: "test", contentAngle: "test" },
  });
  const proxy = await prisma.proxy.create({
    data: {
      label: `${PREFIX}proxy`,
      host: "203.0.113.77", // dải TEST-NET-3, không đụng IP thật
      port: 8080,
      username: `${PREFIX}user`,
      passwordEnc: "x",
      country: "VN",
    },
  });
  const account = await prisma.account.create({
    data: {
      platform: "FACEBOOK",
      username: `${PREFIX}nick-fb`,
      passwordEnc: "x",
      emailAddress: "smoke@example.com",
      emailPasswordEnc: "x",
      antidetectProfileId: `${PREFIX}profile`,
      personaId: persona.id,
      proxyId: proxy.id,
      status: "ALIVE",
    },
  });
  const groupTarget = await prisma.platformTarget.create({
    data: {
      platform: "FACEBOOK_GROUP",
      name: `${PREFIX}Group tu lam`,
      url: "https://www.facebook.com/groups/smoke",
    },
  });
  const content = await prisma.contentItem.create({
    data: {
      title: "Tiêu đề bài group",
      body: "Thân bài group.",
      links: JSON.stringify(["https://example.com"]),
      type: "VALUE",
      authorName: `${PREFIX}tester`,
    },
  });
  await prisma.postJob.create({
    data: {
      contentItemId: content.id,
      accountId: account.id,
      targetId: groupTarget.id,
      scheduledAt: new Date(Date.now() + 3600_000),
      status: "PENDING",
    },
  });

  const reminders = await loadDueManualPostReminders();
  const mine = reminders.find((reminder) => reminder.accountUsername === `${PREFIX}nick-fb`);
  check("job group đến giờ hiện ở nhắc việc", Boolean(mine));
  check(
    "nội dung copy có đủ tiêu đề, thân bài và link",
    Boolean(
      mine?.messageToCopy.includes("Tiêu đề bài group") &&
        mine.messageToCopy.includes("Thân bài group.") &&
        mine.messageToCopy.includes("https://example.com"),
    ),
    mine?.messageToCopy.replace(/\n/g, " | ") ?? "",
  );
}

async function main() {
  console.log("\nSmoke test — Phase 04 Facebook Pages (không cần Meta App)\n");
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
