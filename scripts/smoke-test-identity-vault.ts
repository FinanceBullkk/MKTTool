/**
 * Kiểm chứng các tiêu chí nghiệm thu của Phase 01 trên database thật.
 * Idempotent: dọn rác của lần chạy trước khi bắt đầu, và luôn dọn khi kết thúc.
 *
 * Chạy: npx tsx scripts/smoke-test-identity-vault.ts
 */
import { readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "@prisma/client";
import { decryptCredential, encryptCredential } from "../src/lib/crypto/credential-encryption";
import { loadVaultKey } from "../src/lib/crypto/encryption-key-loader";
import { dumpDatabaseTo } from "../src/lib/db/database-backup";
import { generateTotpCode } from "../src/lib/totp/totp-code-generator";

process.loadEnvFile(path.join(process.cwd(), ".env"));

const PREFIX = "smoke-test-";
const PLAINTEXT_PASSWORD = "SmokeTest-Plaintext-Canary-9931";
const TOTP_SECRET = "JBSWY3DPEHPK3PXP";

/**
 * Bí mật của nick thuộc vùng operator, mật khẩu proxy thuộc vùng server — xem
 * encrypted-field-registry.ts. Nạp cả hai ngay từ đầu để thiếu khóa thì hỏng ở đây, kèm câu
 * của bộ nạp khóa, chứ không hỏng giữa chừng với một lỗi giải mã khó hiểu.
 */
const operatorKey = loadVaultKey("operator");
const serverKey = loadVaultKey("server");

const prisma = new PrismaClient({
  adapter: new PrismaPg({ connectionString: process.env.DATABASE_URL as string }),
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
}

async function run() {

  const [proxyA, proxyB] = await Promise.all(
    [1, 2].map((n) =>
      prisma.proxy.create({
        data: {
          label: `${PREFIX}proxy-${n}`,
          host: `203.0.113.${n}`, // dải TEST-NET-3, không đụng IP thật
          port: 8080,
          username: `${PREFIX}user`,
          passwordEnc: encryptCredential("proxy-pass", serverKey),
          country: "US",
        },
      }),
    ),
  );

  const account = await prisma.account.create({
    data: {
      platform: "REDDIT",
      username: `${PREFIX}account`,
      // Vùng operator — xem encrypted-field-registry.ts.
      passwordEnc: encryptCredential(PLAINTEXT_PASSWORD, operatorKey),
      emailAddress: "smoke@example.com",
      emailPasswordEnc: encryptCredential("email-pass", operatorKey),
      totpSecretEnc: encryptCredential(TOTP_SECRET, operatorKey),
      antidetectProfileId: `${PREFIX}profile`,
      proxyId: proxyA.id,
      status: "ALIVE",
    },
  });

  // 1. Round-trip giải mã
  const stored = await prisma.account.findUniqueOrThrow({ where: { id: account.id } });
  // Cột nullable từ 07/08/2026 (nick Reddit đăng nhập bằng Google nên không có mật khẩu riêng).
  // Nick của bài smoke này vừa được ghi kèm mật khẩu ở ngay trên, nên rỗng ở đây là hỏng thật —
  // để chuỗi rỗng đi tiếp thì hai phép kiểm dưới tự đỏ, đúng như mong muốn.
  const storedPassword = stored.passwordEnc ?? "";
  check(
    "giải mã mật khẩu trả về đúng chuỗi gốc",
    decryptCredential(storedPassword, operatorKey) === PLAINTEXT_PASSWORD,
  );

  // 1b. Hai vùng khóa thật sự tách (GĐ3).
  //
  // Đây là phép thử chính của việc chia vùng, và nó chỉ có nghĩa khi hai khóa KHÁC nhau —
  // nên phải nói rõ khi chúng còn trùng, chứ không được báo PASS cho một thứ chưa được kiểm.
  if (serverKey.equals(operatorKey)) {
    check(
      "khóa server và operator là hai khóa khác nhau",
      false,
      "đang là CÙNG một khóa — chạy `npm run vault:rekey -- --domain=operator` để tách thật",
    );
  } else {
    let serverKeyOpenedIt = true;
    try {
      decryptCredential(storedPassword, serverKey);
    } catch {
      serverKeyOpenedIt = false;
    }
    check("khóa vùng server KHÔNG mở được mật khẩu nick", !serverKeyOpenedIt);
    check(
      "mật khẩu proxy vẫn mở được bằng khóa vùng server",
      decryptCredential(
        (await prisma.proxy.findUniqueOrThrow({ where: { id: proxyA.id } })).passwordEnc,
        serverKey,
      ) === "proxy-pass",
    );
  }

  // 2. Dữ liệu nằm trên đĩa không chứa plaintext — tiêu chí nghiệm thu chính của Phase 01.
  //
  // Postgres không phải một file đọc được như SQLite trước đây, nên soi qua `pg_dump`: đúng
  // thứ mà `npm run db:backup` sinh ra, tức đúng thứ dễ rò rỉ nhất (bản sao lưu hay bị chép
  // sang chỗ khác, gửi qua chat, để quên trên ổ ngoài). Kiểm được nó là kiểm được đường rò
  // thật, không phải một đường xuất dựng riêng cho test.
  const dumpPath = path.join(tmpdir(), `mkttool-vault-smoke-${process.pid}-${Date.now()}.sql`);
  try {
    await dumpDatabaseTo(dumpPath);
    const dumpBytes = readFileSync(dumpPath);
    check(
      "bản pg_dump KHÔNG chứa mật khẩu dạng trần",
      !dumpBytes.includes(Buffer.from(PLAINTEXT_PASSWORD)),
    );
    check(
      "bản pg_dump KHÔNG chứa TOTP secret dạng trần",
      !dumpBytes.includes(Buffer.from(TOTP_SECRET)),
    );
  } finally {
    // Bản dump chứa ciphertext của toàn bộ kho — không để lại trong thư mục tạm dù test hỏng.
    rmSync(dumpPath, { force: true });
  }

  // 3. Sinh OTP từ secret đã lưu
  const otp = await generateTotpCode(
    decryptCredential(stored.totpSecretEnc as string, operatorKey),
  );
  check("sinh được mã OTP 6 số từ secret đã lưu", /^\d{6}$/.test(otp.code), `mã ${otp.code}`);

  // 4. DB ép 1 proxy chỉ gắn 1 nick
  check("DB chặn 2 nick dùng chung 1 proxy", await createFails({
    username: `${PREFIX}dup-proxy`,
    antidetectProfileId: `${PREFIX}profile-other`,
    proxyId: proxyA.id, // đã gắn nick khác
  }));

  // 5. DB ép 1 profile antidetect chỉ gắn 1 nick
  check("nick Reddit có id profile antidetect", stored.antidetectProfileId !== null);
  check("DB chặn 2 nick dùng chung 1 profile antidetect", await createFails({
    username: `${PREFIX}dup-profile`,
    antidetectProfileId: stored.antidetectProfileId ?? `${PREFIX}profile`, // trùng profile
    proxyId: proxyB.id,
  }));

  // ── 6. Nick Facebook: bỏ trống proxy + profile antidetect ──────────────────
  //
  // Fanpage đăng bằng Graph API nên không cần cả hai. Nhưng nới ràng buộc kiểu này rất dễ
  // nới quá tay: `@unique` trên cột nullable phải cho NHIỀU nick cùng để trống, mà vẫn chặn
  // hai nick cùng trỏ vào MỘT proxy thật. Ba kiểm tra dưới đây canh đúng ranh giới đó.

  const fb = await prisma.account.create({
    data: {
      platform: "FACEBOOK",
      username: `${PREFIX}fb-1`,
      passwordEnc: encryptCredential("x", operatorKey),
      emailAddress: "fb1@example.com",
      emailPasswordEnc: encryptCredential("x", operatorKey),
      status: "ALIVE",
      // KHÔNG khai antidetectProfileId lẫn proxyId — đó chính là điều đang nghiệm thu.
    },
  });
  check(
    "nick Facebook tạo được mà không cần proxy lẫn profile antidetect",
    fb.proxyId === null && fb.antidetectProfileId === null,
  );

  const fb2 = await prisma.account.create({
    data: {
      platform: "FACEBOOK",
      username: `${PREFIX}fb-2`,
      passwordEnc: encryptCredential("x", operatorKey),
      emailAddress: "fb2@example.com",
      emailPasswordEnc: encryptCredential("x", operatorKey),
      status: "ALIVE",
    },
  }).catch(() => null);
  check("hai nick cùng bỏ trống KHÔNG bị coi là trùng ràng buộc", fb2 !== null);

  check("nhưng vẫn chặn 2 nick dùng chung 1 proxy thật", await createFails({
    username: `${PREFIX}fb-dup-proxy`,
    antidetectProfileId: null,
    proxyId: proxyA.id, // đã gắn nick khác
  }));
}

/** Thử tạo nick, trả về true nếu database từ chối. */
async function createFails(data: {
  username: string;
  antidetectProfileId: string | null;
  proxyId: string | null;
}): Promise<boolean> {
  try {
    await prisma.account.create({
      data: {
        ...data,
        platform: "REDDIT",
        passwordEnc: encryptCredential("x", operatorKey),
        emailAddress: "dup@example.com",
        emailPasswordEnc: encryptCredential("x", operatorKey),
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
