/**
 * Kiểm chứng các tiêu chí nghiệm thu của Phase 01 trên database thật.
 * Idempotent: dọn rác của lần chạy trước khi bắt đầu, và luôn dọn khi kết thúc.
 *
 * Chạy: npx tsx scripts/smoke-test-identity-vault.ts
 */
import { readFileSync } from "node:fs";
import path from "node:path";
import { PrismaBetterSqlite3 } from "@prisma/adapter-better-sqlite3";
import { PrismaClient } from "@prisma/client";
import { decryptCredential, encryptCredential } from "../src/lib/crypto/credential-encryption";
import { generateTotpCode } from "../src/lib/totp/totp-code-generator";

process.loadEnvFile(path.join(process.cwd(), ".env"));

const PREFIX = "smoke-test-";
const PLAINTEXT_PASSWORD = "SmokeTest-Plaintext-Canary-9931";
const TOTP_SECRET = "JBSWY3DPEHPK3PXP";
// Prisma 7 + driver adapter giải "file:./dev.db" theo CWD, không theo thư mục prisma/.
const DB_PATH = path.join(process.cwd(), "dev.db");

const prisma = new PrismaClient({
  adapter: new PrismaBetterSqlite3({ url: process.env.DATABASE_URL as string }),
});

let failures = 0;

function check(name: string, passed: boolean, detail = "") {
  console.log(`  ${passed ? "PASS" : "FAIL"}  ${name}${detail ? ` — ${detail}` : ""}`);
  if (!passed) failures++;
}

/** Xóa mọi dữ liệu do smoke test tạo ra, kể cả từ lần chạy hỏng trước đó. */
async function cleanup() {
  await prisma.auditLog.deleteMany({ where: { detail: { startsWith: PREFIX } } });
  await prisma.account.deleteMany({ where: { username: { startsWith: PREFIX } } });
  await prisma.proxy.deleteMany({ where: { label: { startsWith: PREFIX } } });
  await prisma.persona.deleteMany({ where: { name: { startsWith: PREFIX } } });
}

async function run() {
  const persona = await prisma.persona.create({
    data: { name: `${PREFIX}persona`, voice: "test", contentAngle: "test" },
  });

  const [proxyA, proxyB] = await Promise.all(
    [1, 2].map((n) =>
      prisma.proxy.create({
        data: {
          label: `${PREFIX}proxy-${n}`,
          host: `203.0.113.${n}`, // dải TEST-NET-3, không đụng IP thật
          port: 8080,
          username: `${PREFIX}user`,
          passwordEnc: encryptCredential("proxy-pass"),
          country: "US",
        },
      }),
    ),
  );

  const account = await prisma.account.create({
    data: {
      platform: "REDDIT",
      username: `${PREFIX}account`,
      passwordEnc: encryptCredential(PLAINTEXT_PASSWORD),
      emailAddress: "smoke@example.com",
      emailPasswordEnc: encryptCredential("email-pass"),
      totpSecretEnc: encryptCredential(TOTP_SECRET),
      antidetectProfileId: `${PREFIX}profile`,
      personaId: persona.id,
      proxyId: proxyA.id,
      status: "ALIVE",
    },
  });

  // 1. Round-trip giải mã
  const stored = await prisma.account.findUniqueOrThrow({ where: { id: account.id } });
  check(
    "giải mã mật khẩu trả về đúng chuỗi gốc",
    decryptCredential(stored.passwordEnc) === PLAINTEXT_PASSWORD,
  );

  // 2. File DB không chứa plaintext — tiêu chí nghiệm thu chính của Phase 01
  const dbBytes = readFileSync(DB_PATH);
  check("file dev.db KHÔNG chứa mật khẩu dạng trần", !dbBytes.includes(Buffer.from(PLAINTEXT_PASSWORD)));
  check("file dev.db KHÔNG chứa TOTP secret dạng trần", !dbBytes.includes(Buffer.from(TOTP_SECRET)));

  // 3. Sinh OTP từ secret đã lưu
  const otp = await generateTotpCode(decryptCredential(stored.totpSecretEnc as string));
  check("sinh được mã OTP 6 số từ secret đã lưu", /^\d{6}$/.test(otp.code), `mã ${otp.code}`);

  // 4. DB ép 1 proxy chỉ gắn 1 nick
  check("DB chặn 2 nick dùng chung 1 proxy", await createFails({
    username: `${PREFIX}dup-proxy`,
    antidetectProfileId: `${PREFIX}profile-other`,
    personaId: persona.id,
    proxyId: proxyA.id, // đã gắn nick khác
  }));

  // 5. DB ép 1 profile antidetect chỉ gắn 1 nick
  check("DB chặn 2 nick dùng chung 1 profile antidetect", await createFails({
    username: `${PREFIX}dup-profile`,
    antidetectProfileId: stored.antidetectProfileId, // trùng profile
    personaId: persona.id,
    proxyId: proxyB.id,
  }));
}

/** Thử tạo nick, trả về true nếu database từ chối. */
async function createFails(data: {
  username: string;
  antidetectProfileId: string;
  personaId: string;
  proxyId: string;
}): Promise<boolean> {
  try {
    await prisma.account.create({
      data: {
        ...data,
        platform: "REDDIT",
        passwordEnc: encryptCredential("x"),
        emailAddress: "dup@example.com",
        emailPasswordEnc: encryptCredential("x"),
        status: "ALIVE",
      },
    });
    return false;
  } catch {
    return true;
  }
}

async function main() {
  console.log("\nSmoke test — Phase 01 Kho danh tính\n");
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
