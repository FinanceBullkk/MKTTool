/**
 * Nhập proxy từ file SQLite của bản cũ (`dev.db`) sang Postgres.
 *
 * Chạy xem trước:  npm run proxies:import-sqlite
 * Ghi thật:        npm run proxies:import-sqlite -- --apply
 *
 * ## Vì sao có script này, khi plan đã chốt "không viết script chuyển dữ liệu"
 *
 * Chốt đó đúng cho **nick**: 3 nick trong bản cũ đều là nick thử, nhập lại chỉ tổ mang rác sang
 * kho mới. Proxy thì ngược lại — 10 IP Webshare đã trả tiền và đã kiểm 10/10, và **mật khẩu của
 * chúng không nằm ở đâu khác ngoài file này**. Gõ tay lại 10 mật khẩu là mời lỗi chính tả vào
 * đúng chỗ mà lỗi chính tả trông y hệt "proxy chết".
 *
 * ## Vì sao mặc định là xem trước
 *
 * Đích đến là database vận hành. Một lệnh vừa gõ vừa ghi thì lần chạy đầu tiên đã là lần thật,
 * và nếu khóa giải mã sai thì thứ được ghi vào là rác đã mã hóa — trông y hệt dữ liệu đúng cho
 * tới ngày ai đó cần mở proxy ra dùng.
 *
 * ## Khóa nào giải mã
 *
 * File cũ mã hóa bằng `VAULT_KEY` một-khóa của bản trước. Nay mật khẩu proxy thuộc **vùng
 * server**, nên script giải mã bằng khóa cũ rồi **mã hóa lại** bằng `VAULT_KEY_SERVER`. Nếu hai
 * khóa vốn bằng nhau thì vòng này vô hại; nếu khác nhau thì đây là đường duy nhất đi đúng.
 * Khai khóa cũ qua `VAULT_KEY_LEGACY`; không khai thì thử `VAULT_KEY_SERVER`.
 */
import { DatabaseSync } from "node:sqlite";
import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "@prisma/client";
import { decryptCredential, encryptCredential } from "../src/lib/crypto/credential-encryption";
import { loadVaultKey } from "../src/lib/crypto/encryption-key-loader";

const SOURCE_FILE = "dev.db";
const apply = process.argv.includes("--apply");

interface LegacyProxy {
  label: string;
  host: string;
  port: number;
  username: string | null;
  passwordEnc: string;
  country: string;
  protocol: string;
  type: string;
}

/** Khóa giải mã file cũ. Tách ra để câu báo lỗi nói được đang thử khóa nào. */
function readLegacyKey(): { key: Buffer; source: string } {
  const raw = process.env.VAULT_KEY_LEGACY?.trim();

  if (raw) {
    if (!/^[0-9a-fA-F]{64}$/.test(raw)) {
      throw new Error("VAULT_KEY_LEGACY phải là 64 ký tự hex.");
    }
    return { key: Buffer.from(raw, "hex"), source: "VAULT_KEY_LEGACY" };
  }

  return { key: loadVaultKey("server"), source: "VAULT_KEY_SERVER" };
}

function readLegacyProxies(): LegacyProxy[] {
  const db = new DatabaseSync(SOURCE_FILE, { readOnly: true });

  try {
    const exists = db
      .prepare("SELECT name FROM sqlite_master WHERE type='table' AND name='Proxy'")
      .get();
    if (!exists) throw new Error(`${SOURCE_FILE} không có bảng Proxy.`);

    return db
      .prepare(
        "SELECT label, host, port, username, passwordEnc, country, protocol, type FROM Proxy ORDER BY label",
      )
      .all() as unknown as LegacyProxy[];
  } finally {
    db.close();
  }
}

async function main(): Promise<void> {
  const legacy = readLegacyProxies();
  console.log(`\nĐọc ${SOURCE_FILE}: ${legacy.length} proxy\n`);

  if (legacy.length === 0) {
    console.log("Không có gì để nhập.");
    return;
  }

  const { key: legacyKey, source } = readLegacyKey();
  console.log(`Giải mã bằng ${source}\n`);

  const prisma = new PrismaClient({
    adapter: new PrismaPg({ connectionString: process.env.DATABASE_URL }),
  });

  try {
    const serverKey = loadVaultKey("server");
    let willInsert = 0;
    let willSkip = 0;

    for (const row of legacy) {
      // Giải mã TRƯỚC khi hỏi database: khóa sai thì dừng ngay ở proxy đầu tiên, chứ không ghi
      // được nửa danh sách rồi mới chết.
      let password: string;
      try {
        password = decryptCredential(row.passwordEnc, legacyKey);
      } catch {
        throw new Error(
          `Không giải mã được mật khẩu của "${row.label}" bằng ${source}.\n` +
            `File cũ mã hóa bằng VAULT_KEY của bản một-khóa. Đặt biến VAULT_KEY_LEGACY bằng đúng\n` +
            `giá trị đó rồi chạy lại. KHÔNG có gì được ghi vào Postgres.`,
        );
      }

      // Trùng theo nhãn HOẶC theo địa chỉ — schema ép cả hai, và bỏ qua ở đây thì thông báo nói
      // được lý do, còn để database ném P2002 thì chỉ có mã lỗi.
      const clash = await prisma.proxy.findFirst({
        where: {
          OR: [
            { label: row.label },
            { host: row.host, port: row.port, username: row.username ?? "" },
          ],
        },
        select: { label: true },
      });

      if (clash) {
        console.log(`  bỏ qua  ${row.label} — Postgres đã có "${clash.label}"`);
        willSkip += 1;
        continue;
      }

      console.log(
        `  nhập    ${row.label} — ${row.protocol}://${row.host}:${row.port} (${row.country}, ${row.type})`,
      );
      willInsert += 1;

      if (!apply) continue;

      await prisma.proxy.create({
        data: {
          label: row.label,
          host: row.host,
          port: row.port,
          username: row.username ?? "",
          // Mã hóa lại bằng khóa vùng server — xem chú thích đầu file.
          passwordEnc: encryptCredential(password, serverKey),
          country: row.country,
          protocol: row.protocol,
          type: row.type,
        },
      });
    }

    console.log(
      `\n${apply ? "Đã nhập" : "Sẽ nhập"} ${willInsert} proxy, bỏ qua ${willSkip}.` +
        (apply ? "" : "\n\nĐây mới là bản xem trước. Thêm --apply để ghi thật."),
    );

    if (apply && willInsert > 0) {
      console.log(
        `\nGiữ nguyên ${SOURCE_FILE} cho tới khi bạn tự mở thử một proxy trong app và thấy nó ` +
          `chạy — đó là bản sao duy nhất của mật khẩu này.`,
      );
    }
  } finally {
    await prisma.$disconnect();
  }
}

main().catch((error) => {
  console.error(`\n${error instanceof Error ? error.message : error}\n`);
  process.exit(1);
});
