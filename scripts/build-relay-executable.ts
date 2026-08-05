/**
 * Đóng gói cầu nối thành một file `.exe` chạy được trên máy Windows **không cài Node**.
 *
 * Chạy: `npm run relay:build`
 *
 * ## Vì sao Node SEA, không phải `bun build --compile`
 *
 * Kế hoạch GĐ4 ghi bun trước, SEA là đường lùi. Đảo lại sau khi nhìn kỹ thứ đang được đóng gói:
 * phần khó của cầu nối là mật mã lạ — X25519 sealed box, Ed25519, dựng `KeyObject` từ khóa thô —
 * và bộ test chứng minh nó đúng **trên Node 24**. Chạy đúng phần đó trên runtime của bun là đem
 * thứ không được phép sai sang một chỗ chưa ai đo, đổi lấy vài chục MB dung lượng.
 *
 * SEA thì `.exe` **chính là `node.exe`** đã chạy bộ test, cộng thêm mã nguồn nhét vào trong. Cùng
 * một máy ảo JavaScript, cùng một thư viện mật mã.
 *
 * ## Năm bước, và bước nào hỏng thì hỏng ra sao
 *
 * 1. **esbuild gom cả cây import thành một file CJS.** SEA chỉ nhận đúng một file, không đi theo
 *    `import` lúc chạy. Bước này cũng là chỗ `relay/` kéo nhầm `prisma` hay `next` sẽ lộ ra —
 *    dung lượng nhảy từ ~110 KB lên vài chục MB. Có `relay-import-boundary.test.ts` canh trước.
 * 2. **`node --experimental-sea-config` biến file đó thành blob.**
 * 3. **Chép `node.exe` ra làm phôi.** Không sửa `node.exe` gốc — sửa vào đó là hỏng bản Node của
 *    cả máy.
 * 4. **postject nhét blob vào phôi.**
 * 5. **Nén `.exe` + bộ cài thành một `.zip`** — thứ người dùng thật sự tải về.
 *
 * ## Chỉ build được trên Windows
 *
 * SEA gói runtime của **chính máy đang build**. Build trên Linux (Docker, CI) ra một file tên
 * `.exe` nhưng là ELF — nó sẽ đi hết đường tới máy operator rồi mới hỏng, dưới dạng "không phải
 * ứng dụng Win32 hợp lệ". Nên chặn thẳng ở đây, kèm câu nói rõ vì sao.
 */
import { execFileSync } from "node:child_process";
import { copyFileSync, mkdirSync, readFileSync, rmSync, statSync, writeFileSync } from "node:fs";
import { createRequire } from "node:module";
import path from "node:path";
import { RELAY_VERSION } from "../src/lib/relay/relay-endpoints";

/**
 * Gọi esbuild và postject qua **file JS của chúng**, chạy bằng chính `node` đang chạy script này.
 *
 * Không qua `npx`: trên Windows `npx` là một file `.cmd`, mà từ bản vá CVE-2024-27980 thì Node
 * bắt buộc phải bật `shell: true` mới chạy được `.cmd` — và `shell: true` lại tự tay cắt mọi
 * đường dẫn ở dấu cách đầu tiên. Bản đầu của script này chết đúng ở đó: `C:\Program Files\...`
 * thành lệnh `C:\Program`. Bỏ hẳn cả hai thứ là bỏ hẳn cả lớp lỗi.
 */
const resolveFrom = createRequire(path.join(process.cwd(), "package.json"));

/** Nơi để mọi thứ sinh ra. Đã nằm trong `.gitignore` — dựng lại được từ mã nguồn. */
const DIST_DIR = path.join(process.cwd(), "relay", "dist");
const BUNDLE_FILE = path.join(DIST_DIR, "relay-bundle.cjs");
const BLOB_FILE = path.join(DIST_DIR, "relay-sea.blob");
const SEA_CONFIG_FILE = path.join(DIST_DIR, "sea-config.json");
const EXECUTABLE_FILE = path.join(DIST_DIR, "MKTTool-Relay.exe");

/**
 * Gói tải về là **`.zip` ba file**, không phải `.exe` trần.
 *
 * `setup.bat` tìm `.exe` và `install-relay.ps1` **cạnh chính nó**. Đưa người ta tải mỗi `.exe`
 * là đưa một bộ cài chắc chắn hỏng: họ có chương trình nhưng không có thứ cài nó, và triệu
 * chứng đầu tiên là "không thấy MKTTool-Relay.exe cạnh file setup.bat này" — câu đúng nhưng
 * người đọc chẳng làm gì được vì họ đâu có file kia.
 */
const ARCHIVE_FILE = path.join(DIST_DIR, "MKTTool-Relay.zip");

/**
 * Chuỗi mà postject tìm trong phôi để biết chỗ nhét blob. Node công bố đúng chuỗi này và nó
 * không đổi theo phiên bản — gõ sai một ký tự thì postject báo "không tìm thấy fuse".
 */
const SEA_FUSE = "NODE_SEA_FUSE_fce680ab2cc467b6e072b8b5df1996b2";

function step(index: number, what: string): void {
  console.log(`\n[${index}/5] ${what}`);
}

/** Dung lượng cho người đọc. Con số này là phép kiểm nhanh nhất xem có gì lọt vào bundle không. */
function sizeOf(file: string): string {
  const bytes = statSync(file).size;
  return bytes < 1024 * 1024
    ? `${(bytes / 1024).toFixed(1)} KB`
    : `${(bytes / 1024 / 1024).toFixed(1)} MB`;
}

function run(command: string, args: string[]): void {
  execFileSync(command, args, { stdio: "inherit" });
}

/** Chạy một công cụ trong `node_modules` bằng chính runtime này. */
function runTool(moduleEntry: string, args: string[]): void {
  run(process.execPath, [resolveFrom.resolve(moduleEntry), ...args]);
}

if (process.platform !== "win32") {
  console.error(
    `\nMáy này chạy ${process.platform}, mà SEA gói runtime của chính máy đang build.\n` +
      `Build ở đây sẽ ra một file tên .exe nhưng không chạy được trên Windows, và nó chỉ lộ ra\n` +
      `ở tận máy operator. Build trên một máy Windows.\n`,
  );
  process.exit(1);
}

console.log(`\nĐóng gói cầu nối bản ${RELAY_VERSION} — Node ${process.version} (${process.arch})`);

// Xóa sạch trước mỗi lượt: một file cũ sót lại từ lượt build hỏng sẽ được đóng gói tiếp mà không
// ai biết, và thứ đi ra là một .exe mang mã nguồn của hôm qua.
rmSync(DIST_DIR, { recursive: true, force: true });
mkdirSync(DIST_DIR, { recursive: true });

step(1, "Gom cây import thành một file CJS (esbuild)");
runTool("esbuild/bin/esbuild", [
  path.join("relay", "src", "main.ts"),
  "--bundle",
  "--platform=node",
  `--target=node${process.versions.node.split(".")[0]}`,
  "--format=cjs",
  `--outfile=${BUNDLE_FILE}`,
]);
console.log(`      ${path.relative(process.cwd(), BUNDLE_FILE)} — ${sizeOf(BUNDLE_FILE)}`);

step(2, "Dựng blob SEA");
writeFileSync(
  SEA_CONFIG_FILE,
  `${JSON.stringify(
    {
      main: BUNDLE_FILE,
      output: BLOB_FILE,
      // Không có nó thì mỗi lần chạy .exe in một dòng cảnh báo "SEA là tính năng thử nghiệm" ra
      // stderr. Cầu nối chạy nền, nên dòng đó không tới ai — nhưng nó tới log của người đang đi
      // tìm lỗi, và một cảnh báo không liên quan ở đầu log là thứ kéo họ đi sai hướng.
      disableExperimentalSEAWarning: true,
    },
    null,
    2,
  )}\n`,
);
run(process.execPath, ["--experimental-sea-config", SEA_CONFIG_FILE]);

step(3, "Chép node.exe ra làm phôi");
copyFileSync(process.execPath, EXECUTABLE_FILE);

step(4, "Nhét blob vào phôi (postject)");
runTool("postject/dist/cli.js", [
  EXECUTABLE_FILE,
  "NODE_SEA_BLOB",
  BLOB_FILE,
  "--sentinel-fuse",
  SEA_FUSE,
]);

// Bộ cài đi cùng `.exe` chứ không tải riêng: `setup.bat` tìm hai file kia **cạnh chính nó**, nên
// để chúng rời nhau là một cách hỏng chờ sẵn ở máy người cài.
for (const fileName of ["setup.bat", "install-relay.ps1"]) {
  const target = path.join(DIST_DIR, fileName);
  copyFileSync(path.join(process.cwd(), "relay", fileName), target);
  console.log(`      kèm ${path.relative(process.cwd(), target)}`);
}

/**
 * `install-relay.ps1` **phải còn BOM**.
 *
 * Windows PowerShell 5.1 đọc `.ps1` không BOM theo bảng mã ANSI của máy: script vẫn chạy, vẫn
 * cài đúng, chỉ có mọi chữ tiếng Việt trong đó thành ký tự lạ — tức bộ cài vẫn "thành công"
 * trong khi màn hình duy nhất mà người cài đọc thì không đọc được. Một cú lưu file bằng biên
 * tập viên đặt sai mặc định là đủ để mất BOM, và không có gì kêu lên.
 */
const installerBytes = readFileSync(path.join(DIST_DIR, "install-relay.ps1"));
if (installerBytes[0] !== 0xef || installerBytes[1] !== 0xbb || installerBytes[2] !== 0xbf) {
  console.error(
    "\nrelay/install-relay.ps1 mất BOM UTF-8. PowerShell 5.1 sẽ đọc nó theo bảng mã ANSI và\n" +
      "mọi chữ tiếng Việt trong bộ cài thành ký tự lạ. Lưu lại file đó dạng UTF-8 **có BOM**.\n",
  );
  process.exit(1);
}

step(5, "Nén ba file thành gói tải về");
// `Compress-Archive` có sẵn từ PowerShell 5 — không thêm phụ thuộc npm nào cho một việc mà
// Windows đã làm được. `powershell.exe` là `.exe` thật nên gọi thẳng, không vướng bẫy `.cmd`.
run("powershell", [
  "-NoProfile",
  "-Command",
  `Compress-Archive -Path '${EXECUTABLE_FILE}','${path.join(DIST_DIR, "setup.bat")}','${path.join(
    DIST_DIR,
    "install-relay.ps1",
  )}' -DestinationPath '${ARCHIVE_FILE}' -Force`,
]);

console.log(`\n✅ ${path.relative(process.cwd(), ARCHIVE_FILE)} — ${sizeOf(ARCHIVE_FILE)}`);
console.log(`   (${path.relative(process.cwd(), EXECUTABLE_FILE)} — ${sizeOf(EXECUTABLE_FILE)})`);
console.log(`
Nghiệm thu ngay: npm run relay:verify

File này KHÔNG có chữ ký số. Windows SmartScreen sẽ hỏi lại ở lần chạy đầu trên mỗi máy —
đó là hành vi đúng của Windows với một file lạ tải từ mạng về, không phải dấu hiệu hỏng.
Người cài bấm "More info" → "Run anyway", hoặc chạy qua setup.bat.
`);
