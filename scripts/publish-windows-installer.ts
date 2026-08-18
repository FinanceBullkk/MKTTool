/**
 * Đẩy gói cài MKT Browser lên ngăn phát hành trên R2.
 *
 * Chạy: `npm run browser:publish -- --file=<đường dẫn .exe> --version=<số hiệu>`
 *
 * ## Vì sao là lệnh riêng, không nối vào bộ build của MKTBrowser
 *
 * Cùng lý lẽ với `relay:publish`: build là việc làm nhiều lần kể cả để thử, còn phát hành là việc
 * **cả team nhìn thấy** — nó đổi thứ mọi người tải về. Hai việc có hậu quả khác nhau tới thế thì
 * không nên chung một nút. Thêm một lý do riêng ở đây: `.exe` dựng trong repo MKTBrowser còn ngăn
 * phát hành là của MKTTool, nên nối tự động sẽ bắt repo kia cầm chìa ghi.
 *
 * ## Chìa ghi nằm ở máy phát hành, không lên máy chủ
 *
 * Máy chủ chỉ **đọc** ngăn này. Chìa ghi ở `.env` của máy quản trị viên và không đi đâu khác.
 *
 * ## Ghi đè có chủ ý
 *
 * Khoá cố định (xem `windows-installer-release.ts`), nên publish là ghi đè. Đó là đánh đổi đã
 * chọn: không ai ghim URL này, và người dùng chỉ muốn bản đang dùng. Script vẫn in bản đang nằm
 * trên ngăn trước khi ghi, để người bấm nút biết mình vừa thay cái gì.
 */
import { createHash } from "node:crypto";
import { readFileSync, statSync } from "node:fs";
import path from "node:path";
import { headObject, putObject } from "../src/lib/r2/r2-client";
import { readR2Config, RELAY_RELEASE_R2_ENV } from "../src/lib/r2/r2-config";
import { CHECKSUM_METADATA_KEY } from "../src/lib/relay/relay-release-r2";
import { formatFileSize } from "../src/lib/relay/relay-release-file";
import {
  WINDOWS_INSTALLER_R2_KEY,
  WINDOWS_INSTALLER_VERSION_METADATA_KEY,
} from "../src/lib/setup/windows-installer-release";

function flag(name: string): string | undefined {
  return process.argv.find((arg) => arg.startsWith(`--${name}=`))?.slice(name.length + 3);
}

async function main(): Promise<void> {
  const filePath = flag("file")?.trim();
  const version = flag("version")?.trim();

  if (!filePath || !version) {
    console.error(
      "\nThiếu tham số.\n\n" +
        "  npm run browser:publish -- --file=<đường dẫn .exe> --version=<số hiệu>\n\n" +
        "Số hiệu là thứ hiện trên trang chuẩn bị để người cài biết mình đang tải bản nào —\n" +
        "lấy đúng version của bản vừa dựng bên MKTBrowser, đừng tự đặt.\n",
    );
    process.exit(1);
  }

  const resolved = path.resolve(filePath);
  let sizeBytes: number;
  try {
    sizeBytes = statSync(resolved).size;
  } catch {
    console.error(`\nKhông đọc được file: ${resolved}\n`);
    process.exit(1);
  }

  const config = readR2Config(process.env, RELAY_RELEASE_R2_ENV);
  if (!config) {
    console.error(
      "\nChưa khai ngăn phát hành. Cần đủ bốn biến RELAY_RELEASE_R2_* trong .env của máy này.\n",
    );
    process.exit(1);
  }

  // In cái đang có TRƯỚC khi ghi đè. Khoá cố định nên không có đường lùi, và người bấm nút xứng
  // đáng biết mình vừa thay cái gì.
  const existing = await headObject({ config, key: WINDOWS_INSTALLER_R2_KEY });
  if (existing) {
    const cu = existing.metadata[WINDOWS_INSTALLER_VERSION_METADATA_KEY] ?? "không rõ số hiệu";
    console.log(
      `Trên ngăn đang là bản ${cu} — ${formatFileSize(existing.sizeBytes)}, ` +
        `phát hành ${existing.lastModified.toISOString()}.`,
    );
    console.log("Lệnh này sẽ GHI ĐÈ lên nó.\n");
  } else {
    console.log("Ngăn chưa có gói cài MKT Browser nào. Đây là bản đầu tiên.\n");
  }

  const body = readFileSync(resolved);
  const sha256 = createHash("sha256").update(body).digest("hex");

  console.log(`Đang đẩy ${path.basename(resolved)} — ${formatFileSize(sizeBytes)}`);
  console.log(`  bản     ${version}`);
  console.log(`  SHA-256 ${sha256}`);

  await putObject({
    config,
    key: WINDOWS_INSTALLER_R2_KEY,
    body,
    contentType: "application/vnd.microsoft.portable-executable",
    metadata: {
      [CHECKSUM_METADATA_KEY]: sha256,
      [WINDOWS_INSTALLER_VERSION_METADATA_KEY]: version,
    },
  });

  // Đọc lại từ ngăn thay vì tin lệnh ghi đã xong: cùng lý lẽ với mọi phép kiểm khác trong kho này
  // — thứ chứng minh là cái đọc được ở đầu kia, không phải cái mình vừa gửi đi.
  const written = await headObject({ config, key: WINDOWS_INSTALLER_R2_KEY });
  if (!written || written.metadata[CHECKSUM_METADATA_KEY] !== sha256) {
    console.error("\nĐẩy xong nhưng đọc lại không khớp mã băm. KHÔNG coi là đã phát hành.\n");
    process.exit(1);
  }

  console.log(`\n✅ Đã phát hành. Trang /setup sẽ hiện bản ${version} ngay lần tải lại.`);
}

void main();
