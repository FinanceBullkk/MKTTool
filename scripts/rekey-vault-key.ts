/**
 * Xoay VAULT_KEY: giải mã toàn bộ credential bằng khóa cũ, mã hóa lại bằng khóa mới.
 *
 * Chạy khi khóa bị lộ (lỡ commit, lỡ gửi qua chat, máy bị xâm nhập). Không có công cụ này
 * thì khóa lộ đồng nghĩa phải nhập tay lại toàn bộ kho danh tính.
 *
 *   npm run vault:keygen                            # sinh khóa mới
 *   npm run vault:rekey -- --new-key=<hex>          # THỬ: giải mã hết, không ghi gì
 *   npm run vault:rekey -- --new-key=<hex> --apply  # sao lưu rồi ghi đè
 *
 * Hai điều kiện an toàn được ép cứng:
 *  1. Giải mã THÀNH CÔNG toàn bộ trước khi ghi bất cứ thứ gì. Một bản ghi hỏng là dừng cả mẻ —
 *     database xoay khóa được một nửa thì không khóa nào mở nổi nữa.
 *  2. Tự sao lưu ngay trước khi ghi, và ghi trong một transaction duy nhất.
 */
import type { Buffer } from "node:buffer";
import { Prisma } from "@prisma/client";
import {
  decryptCredential,
  encryptCredential,
  encryptOptionalCredential,
} from "../src/lib/crypto/credential-encryption";
import { countEncryptedFields } from "../src/lib/crypto/encrypted-field-registry";
import { parseVaultKey } from "../src/lib/crypto/encryption-key-loader";
import { backupDatabase } from "../src/lib/db/database-backup";
import { prisma } from "../src/lib/db/prisma-client";

/** Một lệnh ghi đã biết trước nội dung, chỉ còn chờ khóa mới. */
type WriteFactory = (newKey: Buffer) => Prisma.PrismaPromise<unknown>;

class RekeyError extends Error {}

function readArg(name: string): string | undefined {
  const prefix = `--${name}=`;
  return process.argv.find((arg) => arg.startsWith(prefix))?.slice(prefix.length);
}

/** Giải mã kèm ngữ cảnh: hỏng thì phải biết ngay bản ghi nào, không mò trong hàng trăm dòng. */
function decryptOrExplain(encoded: string, key: Buffer, where: string): string {
  try {
    return decryptCredential(encoded, key);
  } catch {
    throw new RekeyError(
      `Không giải mã được ${where} bằng VAULT_KEY hiện tại. ` +
        `Kiểm tra .env có đúng khóa đang dùng cho database này không — chưa ghi gì cả.`,
    );
  }
}

function decryptOptionalOrExplain(
  encoded: string | null,
  key: Buffer,
  where: string,
): string | null {
  if (!encoded) return null;
  return decryptOrExplain(encoded, key, where);
}

async function collectProxies(oldKey: Buffer): Promise<WriteFactory[]> {
  const rows = await prisma.proxy.findMany({ select: { id: true, label: true, passwordEnc: true } });
  return rows.map((row) => {
    const password = decryptOrExplain(row.passwordEnc, oldKey, `mật khẩu proxy "${row.label}"`);
    return (newKey) =>
      prisma.proxy.update({
        where: { id: row.id },
        data: { passwordEnc: encryptCredential(password, newKey) },
      });
  });
}

async function collectObserverProxies(oldKey: Buffer): Promise<WriteFactory[]> {
  const rows = await prisma.observerProxy.findMany({
    select: { id: true, label: true, passwordEnc: true },
  });
  return rows.map((row) => {
    const password = decryptOrExplain(
      row.passwordEnc,
      oldKey,
      `mật khẩu proxy quan sát viên "${row.label}"`,
    );
    return (newKey) =>
      prisma.observerProxy.update({
        where: { id: row.id },
        data: { passwordEnc: encryptCredential(password, newKey) },
      });
  });
}

async function collectAccounts(oldKey: Buffer): Promise<WriteFactory[]> {
  const rows = await prisma.account.findMany({
    select: {
      id: true,
      username: true,
      passwordEnc: true,
      emailPasswordEnc: true,
      totpSecretEnc: true,
    },
  });

  return rows.map((row) => {
    const where = `nick "${row.username}"`;
    const password = decryptOrExplain(row.passwordEnc, oldKey, `mật khẩu ${where}`);
    const emailPassword = decryptOrExplain(row.emailPasswordEnc, oldKey, `mật khẩu email ${where}`);
    const totpSecret = decryptOptionalOrExplain(row.totpSecretEnc, oldKey, `TOTP secret ${where}`);

    return (newKey) =>
      prisma.account.update({
        where: { id: row.id },
        data: {
          passwordEnc: encryptCredential(password, newKey),
          emailPasswordEnc: encryptCredential(emailPassword, newKey),
          totpSecretEnc: encryptOptionalCredential(totpSecret, newKey),
        },
      });
  });
}

async function collectFacebookConnections(oldKey: Buffer): Promise<WriteFactory[]> {
  const rows = await prisma.facebookConnection.findMany({
    select: { id: true, name: true, accessTokenEnc: true },
  });
  return rows.map((row) => {
    const token = decryptOrExplain(row.accessTokenEnc, oldKey, `token nick FB "${row.name}"`);
    return (newKey) =>
      prisma.facebookConnection.update({
        where: { id: row.id },
        data: { accessTokenEnc: encryptCredential(token, newKey) },
      });
  });
}

async function collectFacebookPages(oldKey: Buffer): Promise<WriteFactory[]> {
  const rows = await prisma.facebookPage.findMany({
    select: { id: true, name: true, accessTokenEnc: true },
  });
  return rows.map((row) => {
    const token = decryptOrExplain(row.accessTokenEnc, oldKey, `Page token "${row.name}"`);
    return (newKey) =>
      prisma.facebookPage.update({
        where: { id: row.id },
        data: { accessTokenEnc: encryptCredential(token, newKey) },
      });
  });
}

async function main() {
  const newKeyHex = readArg("new-key");
  const apply = process.argv.includes("--apply");

  if (!newKeyHex) {
    throw new RekeyError(
      "Thiếu --new-key. Sinh khóa mới bằng `npm run vault:keygen` rồi chạy lại:\n" +
        "  npm run vault:rekey -- --new-key=<hex>",
    );
  }

  const oldKey = parseVaultKey(process.env.VAULT_KEY);
  const newKey = parseVaultKey(newKeyHex);

  if (oldKey.equals(newKey)) {
    throw new RekeyError("Khóa mới trùng khóa đang dùng — không có gì để xoay.");
  }

  // Giai đoạn 1: giải mã sạch toàn bộ. Chưa ghi một chữ nào.
  console.log("");
  console.log(`Đang giải mã bằng khóa hiện tại (${countEncryptedFields()} cột cần xử lý)...`);

  const factories = [
    ...(await collectProxies(oldKey)),
    ...(await collectObserverProxies(oldKey)),
    ...(await collectAccounts(oldKey)),
    ...(await collectFacebookConnections(oldKey)),
    ...(await collectFacebookPages(oldKey)),
  ];

  console.log(`✅ Giải mã được toàn bộ ${factories.length} bản ghi.`);

  if (!apply) {
    console.log("");
    console.log("Đây mới là lượt THỬ — chưa ghi gì vào database.");
    console.log("Chạy lại kèm --apply để xoay thật:");
    console.log(`  npm run vault:rekey -- --new-key=${newKeyHex} --apply`);
    console.log("");
    return;
  }

  // Giai đoạn 2: sao lưu rồi ghi. Một transaction — hoặc xong hết, hoặc không đổi gì.
  const { filePath } = await backupDatabase();
  console.log(`✅ Đã sao lưu trước khi ghi: ${filePath}`);

  await prisma.$transaction(factories.map((factory) => factory(newKey)));

  console.log(`✅ Đã mã hóa lại ${factories.length} bản ghi bằng khóa mới.`);
  console.log("");
  console.log("⚠️  CHƯA XONG. Việc còn lại phải làm tay ngay bây giờ:");
  console.log("   1. Sửa VAULT_KEY trong .env thành khóa mới:");
  console.log(`      VAULT_KEY="${newKeyHex}"`);
  console.log("   2. Khởi động lại app (khóa được cache trong tiến trình đang chạy).");
  console.log("   3. Cập nhật khóa mới vào password manager.");
  console.log("   4. Mở một nick bất kỳ, bấm copy mật khẩu — ra đúng thì mới xong.");
  console.log("");
  console.log("Bản sao lưu vừa tạo vẫn mã hóa bằng khóa CŨ. Giữ khóa cũ tới khi đã kiểm xong,");
  console.log("nếu không thì chính bản sao lưu đó cũng thành rác.");
  console.log("");
}

main()
  .catch((error) => {
    console.error("");
    console.error(
      error instanceof RekeyError || error instanceof Error
        ? `❌ ${error.message}`
        : `❌ ${String(error)}`,
    );
    console.error("");
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
