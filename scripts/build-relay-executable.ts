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
import { createHash } from "node:crypto";
import {
  copyFileSync,
  createReadStream,
  mkdirSync,
  readFileSync,
  rmSync,
  statSync,
  utimesSync,
  writeFileSync,
} from "node:fs";
import { createRequire } from "node:module";
import path from "node:path";
import { RELAY_VERSION } from "../src/lib/relay/relay-endpoints";
import { writeRelayArtifactMetadata } from "../src/lib/relay/relay-release-metadata";

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

/**
 * Nguồn web nung vào bản build này.
 *
 * Bắt buộc phải khai, và **không có mặc định** — một `.exe` lặng lẽ trỏ về `localhost:3000` đi
 * tới máy operator là một chiếc cầu nối không bao giờ nói chuyện được với web app thật, mà triệu
 * chứng của nó (mọi nút im lặng) chẳng chỉ về phía này chút nào.
 */
const originFlag = process.argv
  .find((argument) => argument.startsWith("--web-origin="))
  ?.slice("--web-origin=".length);
const compatibilityFloorFlag = process.argv
  .find((argument) => argument.startsWith("--compatibility-floor="))
  ?.slice("--compatibility-floor=".length);

// Cờ dòng lệnh đứng trước biến môi trường: máy dev khai `BETTER_AUTH_URL=http://localhost:3000`
// cho việc phát triển, mà bản phát cho team thì phải trỏ về Railway. Bắt sửa `.env` qua lại giữa
// hai lần build là cách chắc chắn để có ngày phát nhầm một bản trỏ về localhost.
const webOrigin = (
  originFlag ||
  process.env.RELAY_WEB_ORIGIN ||
  process.env.BETTER_AUTH_URL ||
  ""
).trim();
if (!webOrigin) {
  console.error(
    `\nChưa biết nung nguồn web nào vào bản này.\n\n` +
      `Khai bằng cờ — đúng địa chỉ web app mà những chiếc máy chạy bản này sẽ nói chuyện cùng:\n\n` +
      `  npm run relay:build -- --web-origin=https://mkttool-web-production.up.railway.app\n\n` +
      `Hoặc đặt RELAY_WEB_ORIGIN trong .env.\n`,
  );
  process.exit(1);
}

const compatibilityFloorRaw = (
  compatibilityFloorFlag || process.env.RELAY_COMPATIBILITY_INSTALLER_FLOOR_SEQUENCE || ""
).trim();
if (!/^\d+$/.test(compatibilityFloorRaw) || Number(compatibilityFloorRaw) <= 0) {
  console.error(
    "\nThe Relay build needs the signed compatibility sequence embedded as its installer floor.\n\n" +
      "Pass it explicitly, for example:\n\n" +
      "  npm run relay:build -- --web-origin=https://mkttool.example.com --compatibility-floor=1\n",
  );
  process.exit(1);
}
const compatibilityFloor = Number(compatibilityFloorRaw);
if (!Number.isSafeInteger(compatibilityFloor)) {
  console.error("\nThe compatibility installer floor is outside the safe integer range.\n");
  process.exit(1);
}

let normalizedOrigin: string;
try {
  const url = new URL(webOrigin);
  if (url.pathname !== "/" || url.search !== "" || url.hash !== "") {
    throw new Error(`chỉ được là phần nguồn, không kèm đường dẫn — đang có "${webOrigin}"`);
  }
  normalizedOrigin = url.origin;
} catch (error) {
  console.error(`\nRELAY_WEB_ORIGIN không dùng được: ${(error as Error).message}\n`);
  process.exit(1);
}

console.log(`\nĐóng gói cầu nối bản ${RELAY_VERSION} — Node ${process.version} (${process.arch})`);
console.log(`Nguồn web nung vào bản này: ${normalizedOrigin}`);
console.log(`Compatibility installer floor: ${compatibilityFloor}`);
if (new URL(normalizedOrigin).hostname === "localhost") {
  console.log("  ⚠️  Đây là địa chỉ máy dev. Bản này KHÔNG dùng được trên máy operator.");
}

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
  // Nung nguồn web vào bundle. Không có nó thì cầu nối khởi động ở trạng thái "không tin ai",
  // và web app không tự cấu hình hộ được — xem `BUILT_IN_WEB_ORIGIN`.
  // Đúng MỘT lượt `JSON.stringify`: esbuild cần vế phải là một biểu thức JS, tức chuỗi có kèm
  // dấu nháy. Bọc hai lượt thì dấu nháy lọt vào trong chính giá trị, và cầu nối đi tin một nguồn
  // tên là `"https://…"` — kể cả dấu ngoặc. Đã vấp thật: mọi lời gọi hỏng theo kiểu CORS.
  // Không cần lớp thoát cho shell vì `execFileSync` truyền argv thẳng, không qua `cmd`.
  `--define:process.env.RELAY_WEB_ORIGIN=${JSON.stringify(normalizedOrigin)}`,
  `--define:process.env.RELAY_COMPATIBILITY_INSTALLER_FLOOR_SEQUENCE=${JSON.stringify(String(compatibilityFloor))}`,
  `--outfile=${BUNDLE_FILE}`,
]);
console.log(`      ${path.relative(process.cwd(), BUNDLE_FILE)} — ${sizeOf(BUNDLE_FILE)}`);

step(2, "Dựng blob SEA");
writeFileSync(
  SEA_CONFIG_FILE,
  `${JSON.stringify(
    {
      // Node embeds this name in the SEA blob; an absolute path leaks the checkout and
      // changes the delivered executable between otherwise identical clean builds.
      main: path.relative(process.cwd(), BUNDLE_FILE).split(path.sep).join("/"),
      output: path.relative(process.cwd(), BLOB_FILE).split(path.sep).join("/"),
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
for (const fileName of ["setup.bat", "install-relay.ps1", "start-mkttool-relay.cmd"]) {
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
/**
 * Nung số bản vào bộ cài, để nó từ chối đè lên một cầu nối MỚI HƠN.
 *
 * Script nguồn giữ `$incomingVersion = 0` — chạy thẳng từ `relay/` thì chốt tự bỏ qua, đúng thứ
 * người sửa mã muốn. Chỉ bản đã đóng gói mới biết mình là bản mấy.
 *
 * Thay trên **chuỗi**, rồi ghi lại kèm BOM bằng tay: `readFileSync(…, "utf8")` nuốt BOM vào thành
 * ký tự U+FEFF đầu chuỗi, và ghi thẳng chuỗi đó ra sẽ giữ nó — nhưng chỉ khi không ai `trim()` ở
 * giữa. Kiểm BOM ngay dưới đây là chốt chặn cho đúng chuyện đó.
 */
const INSTALLER_PATH = path.join(DIST_DIR, "install-relay.ps1");
const installerSource = readFileSync(INSTALLER_PATH, "utf8");
const VERSION_PLACEHOLDER = "$incomingVersion = 0";
if (!installerSource.includes(VERSION_PLACEHOLDER)) {
  console.error(
    `\nrelay/install-relay.ps1 không còn dòng "${VERSION_PLACEHOLDER}".\n\n` +
      "Đó là chỗ bộ build nung số bản vào, và thiếu nó thì bộ cài không biết mình là bản mấy —\n" +
      "chốt chặn hạ cấp im lặng, và lỗi 18/08/2026 quay lại nguyên vẹn.\n",
  );
  process.exit(1);
}
writeFileSync(
  INSTALLER_PATH,
  installerSource.replace(VERSION_PLACEHOLDER, `$incomingVersion = ${RELAY_VERSION}`),
);

const installerBytes = readFileSync(INSTALLER_PATH);
if (installerBytes[0] !== 0xef || installerBytes[1] !== 0xbb || installerBytes[2] !== 0xbf) {
  console.error(
    "\nrelay/install-relay.ps1 mất BOM UTF-8. PowerShell 5.1 sẽ đọc nó theo bảng mã ANSI và\n" +
      "mọi chữ tiếng Việt trong bộ cài thành ký tự lạ. Lưu lại file đó dạng UTF-8 **có BOM**.\n",
  );
  process.exit(1);
}

step(5, "Nén ba file thành gói tải về");

/**
 * Ghim mốc sửa của cả ba file trước khi nén — nếu không thì hai lượt build cùng nội dung ra hai
 * chuỗi byte khác nhau.
 *
 * `Compress-Archive` cất mốc sửa của **từng mục** vào zip, mà `.exe` thì vừa dựng xong ở bước 4
 * nên mang mốc mới ở mọi lượt. (`setup.bat` và `install-relay.ps1` thì không sao: trên Windows
 * `copyFileSync` gọi `CopyFileW`, hàm đó giữ nguyên mốc của file nguồn.) Đo thực tế: giữ nguyên
 * đầu vào rồi nén hai lần cho ra cùng một mã băm, chỉ dời mốc của `.exe` một giờ là mã băm đổi
 * hoàn toàn — tức luồng deflate vốn đã tất định, chỉ mỗi mốc thời gian là biến.
 *
 * Cái này mua được gì: dựng lại từ mã nguồn rồi đối chiếu mã băm là **chứng minh được** gói đang
 * phát hành đúng là thứ cây mã này sinh ra. Thiếu nó thì mỗi lượt build ra một mã băm mới, và
 * "khác mã băm" không còn phân biệt được *đổi nội dung* với *chỉ là build lại* — đúng cái đã làm
 * lệch pin ngày 12/08.
 *
 * Giới hạn: zip cất mốc theo **giờ địa phương**, nên tính tái lập này đúng trong phạm vi cùng một
 * máy/múi giờ. Muốn tái lập xuyên múi giờ thì phải ghim cả `TZ`, mà bản này chỉ build trên đúng
 * một máy Windows nên chưa cần trả giá đó.
 */
const REPRODUCIBLE_MTIME = new Date("2020-01-01T00:00:00Z");
for (const file of [
  EXECUTABLE_FILE,
  path.join(DIST_DIR, "setup.bat"),
  path.join(DIST_DIR, "install-relay.ps1"),
  path.join(DIST_DIR, "start-mkttool-relay.cmd"),
]) {
  utimesSync(file, REPRODUCIBLE_MTIME, REPRODUCIBLE_MTIME);
}

// `Compress-Archive` có sẵn từ PowerShell 5 — không thêm phụ thuộc npm nào cho một việc mà
// Windows đã làm được. `powershell.exe` là `.exe` thật nên gọi thẳng, không vướng bẫy `.cmd`.
run("powershell", [
  "-NoProfile",
  "-Command",
  `Compress-Archive -Path '${EXECUTABLE_FILE}','${path.join(DIST_DIR, "setup.bat")}','${path.join(
    DIST_DIR,
    "install-relay.ps1",
  )}','${path.join(DIST_DIR, "start-mkttool-relay.cmd")}' -DestinationPath '${ARCHIVE_FILE}' -Force`,
]);

/**
 * Phần kết nằm trong một hàm async vì **`tsx` biên dịch script này sang CJS** (package.json
 * không khai `"type": "module"`), mà CJS thì không có `await` ở cấp cao nhất.
 */
async function printSummary(): Promise<void> {
  const checksumOfFile = async (file: string): Promise<string> => {
    const hash = createHash("sha256");
    for await (const chunk of createReadStream(file)) hash.update(chunk as Buffer);
    return hash.digest("hex");
  };
  const checksum = await checksumOfFile(ARCHIVE_FILE);
  const executableChecksum = await checksumOfFile(EXECUTABLE_FILE);
  const sizeBytes = statSync(ARCHIVE_FILE).size;
  const executableSizeBytes = statSync(EXECUTABLE_FILE).size;
  let sourceCommit: string | undefined;
  try {
    sourceCommit = execFileSync("git", ["rev-parse", "HEAD"], { encoding: "utf8" }).trim();
  } catch {
    // A source archive without .git still has useful artifact hashes; provenance remains explicit
    // as absent in the sidecar rather than guessed from a path.
  }
  writeRelayArtifactMetadata(DIST_DIR, {
    version: RELAY_VERSION,
    sizeBytes,
    sha256: checksum,
    executableSizeBytes,
    executableSha256: executableChecksum,
    ...(sourceCommit ? { sourceCommit } : {}),
    nodeVersion: process.version,
    platform: process.platform,
    arch: process.arch,
    webOrigin: normalizedOrigin,
    compatibilityFloor,
  });

  console.log(`\n✅ ${path.relative(process.cwd(), ARCHIVE_FILE)} — ${sizeOf(ARCHIVE_FILE)}`);
  console.log(`   (${path.relative(process.cwd(), EXECUTABLE_FILE)} — ${sizeOf(EXECUTABLE_FILE)})`);

  // Dùng lại đúng hàm mà trang tải dùng, không băm lại bằng một lệnh khác: hai đường tính ra hai
  // con số là kiểu hỏng tệ nhất ở đây — người cài đối chiếu thấy lệch rồi kết luận file hỏng.
  //
  // **Ép nhánh đĩa.** Máy build có khai ngăn R2 (nó cần token ghi để `relay:publish`), nên
  // `readRelayRelease()` không tham số sẽ đi hỏi R2 và in ra mã băm của gói ĐANG nằm trên đó —
  // tức mã của bản trước. Đã in nhầm thật một lượt: hai bản khác nhau ra cùng một chuỗi.
  console.log(`   SHA-256: ${checksum}`);
  console.log(`   EXE SHA-256: ${executableChecksum}`);
  console.log(`
Nghiệm thu ngay: npm run relay:verify

File này KHÔNG có chữ ký số. Windows SmartScreen sẽ hỏi lại ở lần chạy đầu trên mỗi máy —
đó là hành vi đúng của Windows với một file lạ tải từ mạng về, không phải dấu hiệu hỏng.
Người cài bấm "More info" → "Run anyway", hoặc chạy qua setup.bat.

Mã băm ở trên là thứ thay cho chữ ký: nó bắt được file tải dở dang hoặc file không phải bản
này, nhưng KHÔNG chứng minh được nguồn gốc — nó nằm cùng máy chủ với file.
`);
}

void printSummary();
