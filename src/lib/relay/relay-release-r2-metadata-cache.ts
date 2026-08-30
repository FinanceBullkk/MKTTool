/**
 * Nhớ tạm metadata bản phát hành đã đọc từ R2.
 *
 * ## Vì sao được phép nhớ
 *
 * Một object phát hành là **bất biến**: `MKTTool-Relay-v16.zip` đã ghi rồi thì giữ nguyên byte
 * vĩnh viễn, và bản mới luôn là một key mới. Nên kết quả `HEAD` của một version là một sự thật
 * không đổi — hỏi lại R2 mỗi lần chỉ tốn một vòng mạng để nhận đúng câu trả lời cũ.
 *
 * ## Vì sao chuyện này quan trọng chứ không phải tối ưu vặt
 *
 * `readRelayRelease` bị gọi từ probe readiness, từ lúc render trang cài đặt, và từ mỗi lượt tải.
 * Không có ngăn nhớ này thì mỗi lần đều là một request ra mạng. Sự cố 30/08/2026 bắt đầu đúng từ
 * đó: R2 chậm lên một nhịp, probe vượt ngân sách, `/api/healthz` trả 503 dù cơ sở dữ liệu vẫn
 * khỏe — mà `/api/healthz` lại chính là `healthcheckPath` Railway dùng để quyết định promote một
 * bản triển khai.
 *
 * ## Chỉ nhớ câu trả lời khẳng định
 *
 * "Chưa có gói" **không** được nhớ. Đó là trạng thái sẽ đổi ngay khi ai đó phát hành, và nhớ nó
 * lại khiến bản vừa đẩy lên có vẻ như chưa tồn tại. Lỗi cũng không được nhớ — lỗi mạng là chuyện
 * nhất thời, biến nó thành trạng thái dán cứng là làm hỏng đúng thứ ngăn này định cứu.
 *
 * ## Vì sao vẫn có hạn dùng, dù dữ liệu bất biến
 *
 * Nhớ vĩnh viễn thì một tiến trình chạy lâu sẽ không bao giờ chứng minh lại rằng nó còn với tới
 * được R2, và readiness mất hết ý nghĩa. Hạn 5 phút là điểm cân bằng có chủ ý: đủ dài để probe
 * mỗi 10–30 giây không còn chạm mạng, đủ ngắn để mỗi tiến trình vẫn kiểm chứng lại đều đặn. Đây
 * là lựa chọn thiết kế, không phải con số đo được — sửa nó thì sửa kèm lý do.
 *
 * Tiến trình vừa khởi động có ngăn nhớ rỗng, nên một bản triển khai mới **vẫn** phải chạm được R2
 * thật một lần trước khi được coi là sẵn sàng. Đó đúng là điều cổng promote cần bảo đảm.
 */
import type { R2Config } from "@/lib/r2/r2-config";
import type { RelayRelease } from "./relay-release-file";

const CACHE_TTL_MS = 5 * 60_000;

interface CacheEntry {
  release: RelayRelease;
  expiresAt: number;
}

const entries = new Map<string, CacheEntry>();

/** Khoá gồm cả ngăn chứa: đổi cấu hình R2 là đổi nguồn sự thật, không được dùng lại câu trả lời cũ. */
function cacheKey(config: R2Config, version: number): string {
  return `${config.accountId}/${config.bucket}/v${version}`;
}

export function readCachedRelayRelease(
  config: R2Config,
  version: number,
  now: number = Date.now(),
): RelayRelease | null {
  const entry = entries.get(cacheKey(config, version));
  if (!entry) return null;
  if (entry.expiresAt <= now) {
    entries.delete(cacheKey(config, version));
    return null;
  }
  return entry.release;
}

export function writeCachedRelayRelease(
  config: R2Config,
  version: number,
  release: RelayRelease,
  now: number = Date.now(),
): void {
  if (!release.available) return;
  entries.set(cacheKey(config, version), { release, expiresAt: now + CACHE_TTL_MS });
}

/** Dọn ngăn nhớ. Dành cho test và cho lệnh phát hành, không dùng trong đường phục vụ. */
export function clearRelayReleaseR2MetadataCache(): void {
  entries.clear();
}
