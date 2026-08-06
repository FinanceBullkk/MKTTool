/**
 * Tải một object lên Cloudflare R2 — kho đối tượng tương thích S3.
 *
 * ## Vì sao bản sao lưu phải rời khỏi Railway
 *
 * Sao lưu tự động của Railway đòi gói Pro, nhưng đó không phải lý do chính. Lý do chính là bản
 * sao của Railway **nằm cùng tài khoản với bản gốc**, nên nó không chống được ca tệ nhất: mất cả
 * dự án, hoặc mất tài khoản. Bản sao ở cùng nhà với bản gốc thì không phải bản sao.
 *
 * R2 đã là lựa chọn của kế hoạch cho kho file video (QĐ 7), nên đây không phải một nhà cung cấp
 * thứ ba mọc thêm.
 *
 * ## Cái gì được gửi đi, và vì sao chấp nhận được
 *
 * File gửi lên là bản `pg_dump` — **toàn bộ credential trong đó đã mã hóa**, và hai khóa mở chúng
 * không có mặt ở R2: `VAULT_KEY_SERVER` nằm ở biến môi trường Railway, `VAULT_KEY_OPERATOR` chỉ
 * nằm trên máy operator. Người đọc được bucket này cầm một đống ciphertext.
 *
 * Vẫn phải giữ hai điều kiện, và chúng thuộc về cách khai chứ không thuộc về code:
 *  - **Bucket để riêng tư.** R2 không mở công khai trừ khi tự bật.
 *  - **Token R2 chỉ có quyền ghi vào đúng bucket này.** Token đọc-mọi-thứ để trong biến môi
 *    trường của app là mở rộng thiệt hại của một lần chiếm máy chủ, không thu hẹp nó.
 */
import { createHash } from "node:crypto";
import { encodeObjectKey, signRequest } from "./s3-signature-v4";

export const R2_ENV = {
  accountId: "R2_ACCOUNT_ID",
  bucket: "R2_BUCKET",
  accessKeyId: "R2_ACCESS_KEY_ID",
  secretAccessKey: "R2_SECRET_ACCESS_KEY",
} as const;

export interface R2Config {
  accountId: string;
  bucket: string;
  accessKeyId: string;
  secretAccessKey: string;
}

export class R2ConfigError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "R2ConfigError";
  }
}

export class R2UploadError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "R2UploadError";
  }
}

/**
 * Đọc cấu hình R2 từ biến môi trường.
 *
 * Ba trạng thái, và trạng thái giữa là trạng thái đáng nói:
 *  - **Không khai biến nào** → `null`, nghĩa là tắt sao lưu lên R2. Mặc định.
 *  - **Khai thiếu một vài biến** → **ném lỗi**. Đây là người đang cố bật tính năng mà gõ sót, và
 *    lặng lẽ coi như tắt đúng là cách để họ tin rằng bản sao lưu đang chạy.
 *  - Khai đủ → cấu hình.
 */
export function readR2Config(env: Partial<Record<string, string>> = process.env): R2Config | null {
  const values = Object.fromEntries(
    Object.entries(R2_ENV).map(([field, name]) => [field, env[name]?.trim() ?? ""]),
  ) as Record<keyof typeof R2_ENV, string>;

  const missing = Object.entries(R2_ENV)
    .filter(([field]) => values[field as keyof typeof R2_ENV] === "")
    .map(([, name]) => name);

  if (missing.length === Object.keys(R2_ENV).length) return null;

  if (missing.length > 0) {
    throw new R2ConfigError(
      `Sao lưu lên R2 khai thiếu ${missing.join(", ")}. Khai đủ cả bốn biến, hoặc bỏ trống cả bốn ` +
        `để tắt hẳn — khai một nửa thì tính năng không chạy mà nhìn như đang chạy.`,
    );
  }

  return values;
}

/** `https://<account>.r2.cloudflarestorage.com` — endpoint kiểu path của R2. */
export function r2Host(accountId: string): string {
  return `${accountId}.r2.cloudflarestorage.com`;
}

/**
 * Ghi một object. Ném `R2UploadError` khi R2 từ chối.
 *
 * `region: "auto"` là quy ước của R2 — nó không có vùng theo nghĩa của AWS, nhưng chuỗi ký vẫn
 * phải mang một vùng nào đó và R2 đòi đúng chữ này.
 */
export async function putObject(options: {
  config: R2Config;
  key: string;
  body: Buffer;
  contentType: string;
  now?: Date;
  timeoutMs?: number;
  fetchImpl?: typeof fetch;
}): Promise<void> {
  const {
    config,
    key,
    body,
    contentType,
    now = new Date(),
    timeoutMs = 60_000,
    fetchImpl = fetch,
  } = options;

  const host = r2Host(config.accountId);
  const path = `/${encodeObjectKey(config.bucket)}/${encodeObjectKey(key)}`;

  // Băm nội dung phải nằm trong header ĐƯỢC KÝ: đó là thứ chứng minh gói tin không bị sửa trên
  // đường đi. `UNSIGNED-PAYLOAD` cũng hợp lệ với S3 nhưng bỏ đúng tính chất đó, và ở đây nội dung
  // chỉ vài chục KB nên không có lý do gì để tiết kiệm một lượt băm.
  const headers = signRequest(
    {
      method: "PUT",
      path,
      host,
      payload: body,
      headers: {
        "content-type": contentType,
        "x-amz-content-sha256": sha256Hex(body),
      },
      now,
    },
    {
      accessKeyId: config.accessKeyId,
      secretAccessKey: config.secretAccessKey,
      region: "auto",
      service: "s3",
    },
  );

  let response: Response;
  try {
    response = await fetchImpl(`https://${host}${path}`, {
      method: "PUT",
      headers,
      body: new Uint8Array(body),
      signal: AbortSignal.timeout(timeoutMs),
    });
  } catch (cause) {
    throw new R2UploadError(
      `Không gọi được R2: ${cause instanceof Error ? cause.message : String(cause)}`,
    );
  }

  if (!response.ok) {
    // Đọc thân phản hồi: R2 trả XML nêu đích danh mã lỗi (`SignatureDoesNotMatch`,
    // `AccessDenied`, `NoSuchBucket`), và ba mã đó dẫn tới ba việc phải làm khác hẳn nhau. Nuốt
    // nó đi thì chỉ còn "HTTP 403", câu không nói được phải đi sửa gì.
    const detail = (await response.text().catch(() => "")).slice(0, 400);
    throw new R2UploadError(
      `R2 từ chối (HTTP ${response.status})${detail ? `: ${detail}` : ""}`,
    );
  }
}

function sha256Hex(body: Buffer): string {
  return createHash("sha256").update(body).digest("hex");
}
