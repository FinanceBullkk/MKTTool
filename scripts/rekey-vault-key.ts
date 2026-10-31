/**
 * Xoay khóa kho danh tính: giải mã toàn bộ credential của MỘT VÙNG bằng khóa cũ, mã hóa lại
 * bằng khóa mới.
 *
 * Chạy khi khóa bị lộ (lỡ commit, lỡ gửi qua chat, máy bị xâm nhập). Không có công cụ này
 * thì khóa lộ đồng nghĩa phải nhập tay lại toàn bộ kho danh tính.
 *
 *   npm run vault:keygen                                            # sinh khóa mới
 *   npm run vault:rekey -- --domain=server   --new-key=<hex>        # THỬ: giải mã hết, không ghi
 *   npm run vault:rekey -- --domain=operator --new-key=<hex> --apply
 *
 * Từ GĐ3 kho có hai vùng khóa (xem encrypted-field-registry.ts) nên PHẢI nói rõ xoay vùng nào:
 *   --domain=server    mật khẩu proxy + khóa finalization của Relay, khóa ở VAULT_KEY_SERVER
 *   --domain=operator  mật khẩu / email / TOTP của nick, khóa ở VAULT_KEY_OPERATOR
 *
 * Cũng chính lệnh này là đường TÁCH hai vùng lần đầu: đặt cả hai biến bằng khóa cũ cho app chạy
 * lại được, rồi xoay riêng vùng operator sang khóa mới. Xoay xong thì khóa operator rời khỏi
 * máy chủ, và chỉ máy operator giữ.
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
import {
  type VaultDomain,
  countEncryptedFields,
} from "../src/lib/crypto/encrypted-field-registry";
import { VAULT_KEY_ENV, parseVaultKey } from "../src/lib/crypto/encryption-key-loader";
import { backupDatabase } from "../src/lib/db/database-backup";
import { prisma } from "../src/lib/db/prisma-client";

/** Một lệnh ghi đã biết trước nội dung, chỉ còn chờ khóa mới. */
type WriteFactory = (newKey: Buffer) => Prisma.PrismaPromise<unknown>;

class RekeyError extends Error {}

function readArg(name: string): string | undefined {
  const prefix = `--${name}=`;
  return process.argv.find((arg) => arg.startsWith(prefix))?.slice(prefix.length);
}

/** Vùng đang xoay — chỉ để dựng câu báo lỗi cho đúng tên biến môi trường. */
let currentDomain: VaultDomain = "server";

/** Giải mã kèm ngữ cảnh: hỏng thì phải biết ngay bản ghi nào, không mò trong hàng trăm dòng. */
function decryptOrExplain(encoded: string, key: Buffer, where: string): string {
  try {
    return decryptCredential(encoded, key);
  } catch {
    throw new RekeyError(
      `Không giải mã được ${where} bằng ${VAULT_KEY_ENV[currentDomain]} hiện tại. ` +
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
    // Mật khẩu nick là cột NULLABLE từ 07/08/2026 — nick Reddit đăng nhập bằng Google nên không
    // có mật khẩu riêng. Dùng nhánh "optional" như TOTP, đừng coi cột rỗng là dữ liệu hỏng.
    const password = decryptOptionalOrExplain(row.passwordEnc, oldKey, `mật khẩu ${where}`);
    const emailPassword = decryptOrExplain(row.emailPasswordEnc, oldKey, `mật khẩu email ${where}`);
    const totpSecret = decryptOptionalOrExplain(row.totpSecretEnc, oldKey, `TOTP secret ${where}`);

    return (newKey) =>
      prisma.account.update({
        where: { id: row.id },
        data: {
          passwordEnc: encryptOptionalCredential(password, newKey),
          emailPasswordEnc: encryptCredential(emailPassword, newKey),
          totpSecretEnc: encryptOptionalCredential(totpSecret, newKey),
        },
      });
  });
}

async function collectRelayDevices(oldKey: Buffer): Promise<WriteFactory[]> {
  const rows = await prisma.relayDevice.findMany({
    where: { retirementFinalizationKeyEnc: { not: null } },
    select: { id: true, retirementFinalizationKeyEnc: true },
  });
  return rows.map((row) => {
    const seed = decryptOrExplain(
      row.retirementFinalizationKeyEnc!,
      oldKey,
      `retirement finalization key for Relay device ${row.id}`,
    );
    return (newKey) =>
      prisma.relayDevice.update({
        where: { id: row.id },
        data: { retirementFinalizationKeyEnc: encryptCredential(seed, newKey) },
      });
  });
}

/** Bảng phân công: vùng nào thì gom những bảng nào. Chia sai ở đây là xoay nhầm khóa cho cột. */
const COLLECTORS: Record<VaultDomain, ((oldKey: Buffer) => Promise<WriteFactory[]>)[]> = {
  server: [collectProxies, collectRelayDevices],
  operator: [collectAccounts],
};

function readDomainArg(): VaultDomain {
  const raw = readArg("domain");

  if (raw !== "server" && raw !== "operator") {
    throw new RekeyError(
      `Thiếu hoặc sai --domain (nhận được ${raw ? `"${raw}"` : "không có gì"}). ` +
        "Kho có hai vùng khóa, phải nói rõ xoay vùng nào:\n" +
        "  --domain=server    mật khẩu proxy + khóa finalization của Relay\n" +
        "  --domain=operator  mật khẩu / email / TOTP của nick",
    );
  }

  return raw;
}

async function main() {
  const domain = readDomainArg();
  currentDomain = domain;
  const envName = VAULT_KEY_ENV[domain];
  const newKeyHex = readArg("new-key");
  const apply = process.argv.includes("--apply");

  if (!newKeyHex) {
    throw new RekeyError(
      "Thiếu --new-key. Sinh khóa mới bằng `npm run vault:keygen` rồi chạy lại:\n" +
        `  npm run vault:rekey -- --domain=${domain} --new-key=<hex>`,
    );
  }

  // Khóa CŨ đọc với `allowPlaceholder`: chính script này là lối thoát cho ai lỡ chạy thật bằng
  // một khóa điền tạm, nên nó phải mở được thứ mà chốt C33 vừa cấm dùng tiếp. Khóa MỚI thì không
  // nới — điểm của cả lượt xoay là đi tới một khóa thật.
  const oldKey = parseVaultKey(process.env[envName], envName, { allowPlaceholder: true });
  const newKey = parseVaultKey(newKeyHex, "--new-key");

  // Chép nhầm khóa của vùng KIA. Hai biến nằm cạnh nhau trong .env, cùng 64 ký tự hex, và người
  // chạy lệnh này đang mở đúng file đó để chép — nên đây không phải nhầm lẫn xa vời.
  //
  // Phải chặn ở đây vì hậu quả không lùi được: chạy xong thì hai vùng nhập lại làm một, đúng thứ
  // vừa bỏ công tách ra, và dữ liệu đã mã hóa lại nên sửa .env không cứu được. Thứ duy nhất còn
  // bắt được là dòng cảnh báo lúc app khởi động — quá muộn và quá dễ trôi.
  const otherDomain: VaultDomain = domain === "server" ? "operator" : "server";
  const otherEnvName = VAULT_KEY_ENV[otherDomain];
  const otherRaw = process.env[otherEnvName]?.trim();

  // Cũng nới: đây chỉ là phép so sánh, không nạp khóa vùng kia để dùng. Vùng kia đang giữ khóa
  // xấu không phải lý do để chặn việc xoay vùng này — đó lại đúng là lúc cần xoay nhất.
  if (otherRaw && newKey.equals(parseVaultKey(otherRaw, otherEnvName, { allowPlaceholder: true }))) {
    throw new RekeyError(
      `Khóa mới đang trùng ${otherEnvName} — đó là khóa của vùng ${otherDomain}, không phải khóa mới.\n\n` +
        `Xoay như vậy là nhập hai vùng khóa làm một, tức bỏ đúng thứ việc chia vùng sinh ra để bảo vệ: ` +
        `chiếm được máy chủ sẽ mở lại được mật khẩu nick.\n` +
        `Sinh một khóa THẬT SỰ MỚI bằng \`npm run vault:keygen\` rồi chạy lại.\n` +
        `Chưa đọc, chưa ghi gì vào database cả.`,
    );
  }

  if (oldKey.equals(newKey)) {
    // Nguyên nhân thường gặp nhất không phải "gõ nhầm cùng một khóa" mà là sửa .env trước khi
    // xoay. Nói thẳng ra, vì người vừa dính lỗi này đang cầm khóa mới trong tay và rất dễ kết
    // luận là công cụ hỏng.
    throw new RekeyError(
      `Khóa mới trùng ${envName} đang dùng — không có gì để xoay.\n\n` +
        `Đã lỡ sửa .env trước? Thứ tự đúng là ngược lại: ${envName} phải còn giữ khóa CŨ để ` +
        `script mở được dữ liệu đang có.\n` +
        `  1. Trả ${envName} trong .env về khóa CŨ\n` +
        `  2. Chạy lại lệnh này với --new-key là khóa mới\n` +
        `  3. Xong --apply rồi mới sửa .env thành khóa mới\n` +
        `Chưa đọc, chưa ghi gì vào database cả.`,
    );
  }

  // Giai đoạn 1: giải mã sạch toàn bộ. Chưa ghi một chữ nào.
  console.log("");
  console.log(
    `Đang giải mã vùng ${domain} bằng ${envName} hiện tại ` +
      `(${countEncryptedFields(domain)} cột cần xử lý)...`,
  );

  const factories: WriteFactory[] = [];
  for (const collect of COLLECTORS[domain]) {
    factories.push(...(await collect(oldKey)));
  }

  console.log(`✅ Giải mã được toàn bộ ${factories.length} bản ghi.`);

  if (!apply) {
    console.log("");
    console.log("Đây mới là lượt THỬ — chưa ghi gì vào database.");
    console.log("Chạy lại kèm --apply để xoay thật:");
    console.log(`  npm run vault:rekey -- --domain=${domain} --new-key=${newKeyHex} --apply`);
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
  console.log(`   1. Sửa ${envName} trong .env thành khóa mới:`);
  console.log(`      ${envName}="${newKeyHex}"`);
  console.log("   2. Khởi động lại app (khóa được cache trong tiến trình đang chạy).");
  console.log("   3. Cập nhật khóa mới vào password manager.");
  console.log("   4. Mở một nick bất kỳ, bấm copy mật khẩu — ra đúng thì mới xong.");
  console.log("");

  if (domain === "operator") {
    console.log("Vùng operator: khóa này KHÔNG được ở lại máy chủ sau khi cầu nối (Phase 04) chạy.");
    console.log(`Lúc đó gỡ hẳn ${envName} khỏi môi trường máy chủ — đó mới là lúc chiếm được máy`);
    console.log("chủ không mở nổi mật khẩu nick nào.");
    console.log("");
  }
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
