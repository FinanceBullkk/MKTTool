/**
 * Đẩy gói cài cầu nối lên ngăn phát hành trên R2.
 *
 * Chạy: `npm run relay:publish` — trên **máy vừa build**, ngay sau `npm run relay:build`.
 *
 * ## Vì sao là một lệnh riêng chứ không nối vào cuối bộ build
 *
 * Build là việc làm nhiều lần, kể cả để thử. Phát hành là việc **cả team nhìn thấy**: nó đổi thứ
 * mà mọi người tải về, và dải cảnh báo *"cầu nối bản cũ"* bắt đầu bật lên trên máy người khác. Hai
 * việc có hậu quả khác nhau tới thế thì không nên chung một nút — nhất là khi nút đó chạy tự động
 * ở cuối một lệnh mà người ta gõ vì lý do khác.
 *
 * ## Token ở đây là token GHI, và nó KHÔNG được đặt lên máy chủ
 *
 * Máy chủ chỉ đọc ngăn này (QĐ 12). Chìa ghi nằm ở `.env` của máy build — tức máy của quản trị
 * viên — và không đi đâu khác. Máy chủ bị chiếm thì kẻ chiếm đọc được gói cài, thứ vốn công khai
 * được; nó không ghi đè được gói cài mà cả team sắp tải về.
 *
 * ## Mã băm đi cùng object
 *
 * Băm một lần ở đây rồi đính vào metadata, thay vì để máy chủ băm lại 32 MB ở mỗi lượt mở trang.
 * Dùng lại đúng hàm mà trang tải dùng, không băm bằng một lệnh khác: hai đường tính ra hai con số
 * là kiểu hỏng tệ nhất ở đây — người cài đối chiếu thấy lệch rồi kết luận file hỏng.
 */
import { readFileSync } from "node:fs";
import { RELAY_VERSION } from "../src/lib/relay/relay-endpoints";
import {
  formatFileSize,
  readRelayReleaseFromDisk,
  relayArchiveChecksum,
  relayArchivePath,
} from "../src/lib/relay/relay-release-file";
import {
  CHECKSUM_METADATA_KEY,
  RELAY_RELEASE_R2_KEY,
  checksumOf,
  headRelayRelease,
} from "../src/lib/relay/relay-release-r2";
import { putObject } from "../src/lib/r2/r2-client";
import { readR2Config, RELAY_RELEASE_R2_ENV } from "../src/lib/r2/r2-config";

async function main(): Promise<void> {
  const config = readR2Config(process.env, RELAY_RELEASE_R2_ENV);
  if (!config) {
    console.error(
      `\nChưa khai ngăn phát hành. Bốn biến cần có trong .env của máy này:\n` +
        Object.values(RELAY_RELEASE_R2_ENV)
          .map((name) => `  ${name}`)
          .join("\n") +
        `\n\nToken của ngăn này cần quyền GHI, và chỉ nằm ở đây — máy chủ dùng một token chỉ đọc.\n`,
    );
    process.exit(1);
  }

  // Đọc thẳng từ đĩa: thứ sắp đẩy đi là gói **vừa build**, không phải gói đang nằm trên R2.
  const local = readRelayReleaseFromDisk();

  if (!local.available) {
    console.error(
      `\nKhông thấy gói ở ${local.expectedPath}.\n` +
        `Chạy "npm run relay:build" trước — trên chính máy Windows này.\n`,
    );
    process.exit(1);
  }

  const checksum = await relayArchiveChecksum(local);
  if (!checksum) {
    console.error("\nKhông băm được gói. Kiểm tra lại file rồi chạy lại.\n");
    process.exit(1);
  }

  console.log(`\nPhát hành cầu nối bản ${RELAY_VERSION}`);
  console.log(`  Nguồn:   ${relayArchivePath()} — ${formatFileSize(local.sizeBytes)}`);
  console.log(`  Đích:    ngăn "${config.bucket}", object "${RELAY_RELEASE_R2_KEY}"`);
  console.log(`  SHA-256: ${checksum}`);

  console.log("\nĐang tải lên…");
  await putObject({
    config,
    key: RELAY_RELEASE_R2_KEY,
    body: readFileSync(relayArchivePath()),
    contentType: "application/zip",
    metadata: { [CHECKSUM_METADATA_KEY]: checksum },
    // 32 MB qua một đường lên nhà dân có thể lâu hơn một phút. Mặc định 60 giây của `putObject`
    // hợp với bản sao lưu vài chục KB, không hợp với đây.
    timeoutMs: 10 * 60_000,
  });

  // Đọc lại từ chính R2. Một lượt `PUT` trả 200 chứng minh R2 nhận request, không chứng minh thứ
  // nằm trên đó là thứ mình định gửi — và ca hỏng đáng sợ là metadata mã băm không bám vào object,
  // vì lúc đó trang tải im lặng bỏ cột SHA-256 mà không ai để ý.
  console.log("Đang đối chiếu lại từ R2…");
  const remote = await headRelayRelease(config);
  if (!remote) {
    console.error("\nĐẩy xong nhưng đọc lại không thấy object. Kiểm tra quyền của token.\n");
    process.exit(1);
  }

  const problems: string[] = [];
  if (remote.sizeBytes !== local.sizeBytes) {
    problems.push(`dung lượng lệch (gửi ${local.sizeBytes}, nhận ${remote.sizeBytes})`);
  }
  if (checksumOf(remote) !== checksum) {
    problems.push(`metadata "${CHECKSUM_METADATA_KEY}" không khớp — trang tải sẽ không hiện mã băm`);
  }

  if (problems.length > 0) {
    console.error(`\nĐẩy lên xong nhưng đối chiếu không khớp:\n${problems.map((p) => `  - ${p}`).join("\n")}\n`);
    process.exit(1);
  }

  console.log(`\n✅ Đã phát hành. Cả team tải được ở /relay-download.`);
  console.log(`   Người đang chạy bản cũ sẽ thấy dải nhắc tải lại.\n`);
}

main().catch((error: unknown) => {
  console.error(`\nPhát hành hỏng: ${error instanceof Error ? error.message : String(error)}\n`);
  process.exit(1);
});
