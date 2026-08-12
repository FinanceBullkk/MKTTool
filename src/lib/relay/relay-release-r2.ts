/**
 * Ngăn R2 chứa gói cài cầu nối: khai ở đâu, tên object là gì, mã băm cất chỗ nào.
 *
 * ## Vì sao gói không nằm trong ảnh Docker
 *
 * `.exe` là một bản `node.exe` đã nhét mã nguồn vào (SEA), nên **nó gói runtime của chính máy
 * build** — phải build trên Windows. Ảnh Docker của web app thì dựng trên Linux. Hai hệ điều hành
 * khác nhau nghĩa là không có lượt build nào sinh ra được cả hai, và `relay/dist/` lại bị gitignore
 * (87 MB, dựng lại được từ mã nguồn) nên gói cũng không đi theo repo.
 *
 * Nên phải có một chỗ thứ ba để đặt file, và đó là ngăn này (QĐ 12). Đường đi trọn vẹn:
 *
 *   máy Windows: `npm run relay:build` → `npm run relay:publish` → **R2**
 *   ← máy chủ lấy hộ ← người trong team bấm nút trên web (sau lớp đăng nhập)
 *
 * Người tải không thấy địa chỉ ngăn, không có chìa, và không có URL công khai nào — giữ trọn QĐ 11
 * (chỉ tải được sau khi đăng nhập).
 *
 * ## Mã băm đi cùng object, không tính lại ở máy chủ
 *
 * Băm 32 MB ở mỗi lượt mở trang là kéo cả file từ R2 về chỉ để in ra một dòng chữ. Thay vào đó
 * `relay:publish` băm **một lần lúc phát hành** rồi đính vào metadata của object; máy chủ đọc nó
 * bằng một request `HEAD`.
 *
 * Điều này **không** đổi mức tin cậy của con số đó: nó vẫn là thứ đi cùng file chứ không phải chữ
 * ký độc lập, đúng như khi nó nằm trên đĩa máy chủ. Nó bắt được file tải dở dang và file không
 * phải bản này; nó không chứng minh được nguồn gốc.
 */
import { getObject, headObject, type R2ObjectInfo } from "../r2/r2-client";
import { readR2Config, RELAY_RELEASE_R2_ENV, type R2Config } from "../r2/r2-config";

/**
 * Tên object, **cố định** — không đổi theo phiên bản.
 *
 * Cùng lý lẽ với tên trên đĩa: đường dẫn cố định thì máy chủ và bộ phát hành không phải hẹn nhau
 * theo phiên bản. Số phiên bản chỉ xuất hiện ở tên file lúc tải xuống, nơi người dùng cần phân
 * biệt các bản nằm cạnh nhau trong thư mục Downloads.
 */
export function relayReleaseR2Key(version: number): string {
  if (!Number.isSafeInteger(version) || version <= 0) {
    throw new Error(`Relay release version must be a positive integer, received ${version}.`);
  }
  return `MKTTool-Relay-v${version}.zip`;
}

/** Tên metadata chứa mã băm SHA-256 của gói. */
export const CHECKSUM_METADATA_KEY = "sha256";
export const VERSION_METADATA_KEY = "relay-version";

/**
 * Cấu hình ngăn phát hành, hoặc `null` khi không khai — nghĩa là máy chủ này đọc gói từ đĩa.
 *
 * Khai thiếu một nửa thì `readR2Config` ném lỗi. Đúng như ngăn sao lưu: một tính năng không chạy
 * mà nhìn như đang chạy là thứ tệ hơn một tính năng tắt hẳn.
 */
export function readRelayReleaseR2Config(
  env: Partial<Record<string, string>> = process.env,
): R2Config | null {
  return readR2Config(env, RELAY_RELEASE_R2_ENV);
}

/** Mã băm đính kèm object, hoặc `null` nếu gói được đưa lên bằng đường không đính metadata. */
export function checksumOf(info: R2ObjectInfo): string | null {
  const value = info.metadata[CHECKSUM_METADATA_KEY]?.trim().toLowerCase();
  // Chỉ nhận đúng hình dạng SHA-256. Một chuỗi rác đi tiếp tới trang tải sẽ được người cài đem đi
  // đối chiếu, thấy lệch, rồi kết luận file hỏng — trong khi file hoàn toàn đúng.
  return value && /^[0-9a-f]{64}$/.test(value) ? value : null;
}

export function versionOf(info: R2ObjectInfo): number | null {
  const value = info.metadata[VERSION_METADATA_KEY]?.trim();
  if (!value || !/^\d+$/.test(value)) return null;
  const version = Number(value);
  return Number.isSafeInteger(version) && version > 0 ? version : null;
}

/** Xem ngăn đã có gói chưa. `null` khi chưa phát hành bản nào — trạng thái bình thường. */
export function headRelayRelease(
  config: R2Config,
  version: number,
  fetchImpl?: typeof fetch,
): Promise<R2ObjectInfo | null> {
  return headObject({ config, key: relayReleaseR2Key(version), fetchImpl });
}

/** Mở luồng đọc gói từ R2. */
export async function openRelayReleaseStream(
  config: R2Config,
  version: number,
  startByte = 0,
  fetchImpl?: typeof fetch,
): Promise<ReadableStream<Uint8Array>> {
  const { body } = await getObject({
    config,
    key: relayReleaseR2Key(version),
    range: startByte > 0 ? `bytes=${startByte}-` : undefined,
    fetchImpl,
  });
  return body;
}

/** Chỗ đã tìm, in ra khi chưa có gói. Không lộ chìa, chỉ lộ tên ngăn. */
export function describeR2Location(config: R2Config, version: number): string {
  return `ngăn R2 "${config.bucket}", object "${relayReleaseR2Key(version)}"`;
}
