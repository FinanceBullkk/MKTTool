/**
 * Nhập proxy hàng loạt từ file danh sách của nhà cung cấp (Webshare, IPRoyal, Proxy-Cheap…).
 *
 * Định dạng mỗi dòng: host:port:username:password — đây là dạng xuất mặc định của hầu hết
 * nhà bán. Nhập tay 11 proxy qua form là vừa chán vừa dễ gõ nhầm một chữ số cổng, mà gõ nhầm
 * thì profile lặng lẽ chạy bằng IP nhà.
 *
 * Mật khẩu được mã hóa AES-256-GCM trước khi chạm database, y như đường đi của form.
 * Chạy lại nhiều lần không sao: proxy đã có (trùng host/port/username) thì bỏ qua.
 *
 * Chạy: npx tsx --env-file=.env scripts/import-proxies-from-provider-list.ts <file> [--country GB] [--protocol http] [--type STATIC_ISP] [--prefix webshare]
 */
import { readFileSync } from "node:fs";
import path from "node:path";
import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "@prisma/client";
import { encryptCredential } from "../src/lib/crypto/credential-encryption";

const prisma = new PrismaClient({
  adapter: new PrismaPg({ connectionString: process.env.DATABASE_URL as string }),
});

interface Options {
  file: string;
  country: string;
  protocol: string;
  type: string;
  prefix: string;
}

function parseArgs(argv: string[]): Options {
  const file = argv.find((arg) => !arg.startsWith("--"));
  if (!file) {
    console.error("Thiếu đường dẫn file. Xem chú thích đầu script để biết cú pháp.");
    process.exit(1);
  }

  const flag = (name: string, fallback: string) => {
    const index = argv.indexOf(`--${name}`);
    return index >= 0 && argv[index + 1] ? argv[index + 1] : fallback;
  };

  return {
    file,
    country: flag("country", "US").toUpperCase(),
    protocol: flag("protocol", "http").toLowerCase(),
    type: flag("type", "STATIC_ISP").toUpperCase(),
    prefix: flag("prefix", path.basename(file).split(/[\s.]/)[0].toLowerCase()),
  };
}

interface ParsedProxy {
  host: string;
  port: number;
  username: string;
  password: string;
}

/** Tách file thành danh sách proxy. Bỏ dòng trống và \r của file tải từ Windows/web. */
function parseProxyList(raw: string): ParsedProxy[] {
  return raw
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter((line) => line !== "" && !line.startsWith("#"))
    .map((line, index) => {
      const [host, port, username, password] = line.split(":");
      if (!host || !port || !Number.isInteger(Number(port))) {
        throw new Error(`Dòng ${index + 1} sai định dạng, cần host:port:username:password.`);
      }
      return { host, port: Number(port), username: username ?? "", password: password ?? "" };
    });
}

async function main() {
  const options = parseArgs(process.argv.slice(2));

  if (options.protocol !== "http" && options.protocol !== "socks5") {
    console.error(`--protocol chỉ nhận "http" hoặc "socks5", đang là "${options.protocol}".`);
    process.exit(1);
  }

  const proxies = parseProxyList(readFileSync(options.file, "utf8"));
  console.log(`Đọc được ${proxies.length} proxy từ ${path.basename(options.file)}.`);

  let created = 0;
  let skipped = 0;

  for (const [index, proxy] of proxies.entries()) {
    const existing = await prisma.proxy.findFirst({
      where: { host: proxy.host, port: proxy.port, username: proxy.username },
    });

    if (existing) {
      console.log(`  bỏ qua  ${proxy.host}:${proxy.port} — đã có nhãn "${existing.label}"`);
      skipped++;
      continue;
    }

    const label = `${options.prefix}-${String(index + 1).padStart(2, "0")}-${options.country.toLowerCase()}`;

    await prisma.proxy.create({
      data: {
        label,
        host: proxy.host,
        port: proxy.port,
        username: proxy.username,
        passwordEnc: encryptCredential(proxy.password),
        country: options.country,
        type: options.type,
        protocol: options.protocol,
        notes: `Nhập từ ${path.basename(options.file)}`,
      },
    });

    console.log(`  thêm    ${label}  ${proxy.host}:${proxy.port}  (${options.protocol})`);
    created++;
  }

  console.log(`\nXong: thêm ${created}, bỏ qua ${skipped}.`);
}

main()
  .catch((error) => {
    console.error(error instanceof Error ? error.message : error);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
