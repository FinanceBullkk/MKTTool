/**
 * Đọc và ghi object trên Cloudflare R2. Cấu hình ở [r2-config.ts](r2-config.ts).
 *
 * ## Vì sao bản sao lưu phải rời khỏi Railway
 *
 * Sao lưu tự động của Railway đòi gói Pro, nhưng đó không phải lý do chính. Lý do chính là bản
 * sao của Railway **nằm cùng tài khoản với bản gốc**, nên nó không chống được ca tệ nhất: mất cả
 * dự án, hoặc mất tài khoản. Bản sao ở cùng nhà với bản gốc thì không phải bản sao.
 *
 * ## Cái gì được gửi đi, và vì sao chấp nhận được
 *
 * File gửi lên là bản `pg_dump` — **toàn bộ credential trong đó đã mã hóa**, và hai khóa mở chúng
 * không có mặt ở R2: `VAULT_KEY_SERVER` nằm ở biến môi trường Railway, `VAULT_KEY_OPERATOR` chỉ
 * nằm trên máy operator. Người đọc được bucket này cầm một đống ciphertext.
 *
 * Vẫn phải giữ hai điều kiện, và chúng thuộc về cách khai chứ không thuộc về code:
 *  - **Bucket để riêng tư.** R2 không mở công khai trừ khi tự bật.
 *  - **Token R2 chỉ có quyền cần thiết trên đúng bucket của nó.** Xem bảng hai ngăn ở
 *    `r2-config.ts`.
 */
import { createHash } from "node:crypto";
import { r2Host, type R2Config } from "./r2-config";
import { encodeObjectKey, signRequest } from "./s3-signature-v4";

export class R2UploadError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "R2UploadError";
  }
}

export class R2DownloadError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "R2DownloadError";
  }
}

/** SHA-256 của chuỗi rỗng — payload của mọi request `HEAD`/`GET`. Hằng số công khai của S3. */
const EMPTY_PAYLOAD_SHA256 = "e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855";

/** Tiền tố mà S3 dùng cho metadata do người ghi tự đặt. */
const METADATA_PREFIX = "x-amz-meta-";

export interface R2ObjectInfo {
  sizeBytes: number;
  /** Mốc R2 ghi object — thứ gần nhất với "phát hành lúc nào". */
  lastModified: Date;
  /** Metadata tự đặt, đã bỏ tiền tố `x-amz-meta-` và viết thường. */
  metadata: Record<string, string>;
}

function sha256Hex(body: Buffer): string {
  return createHash("sha256").update(body).digest("hex");
}

/**
 * Ký một request tới R2.
 *
 * `region: "auto"` là quy ước của R2 — nó không có vùng theo nghĩa của AWS, nhưng chuỗi ký vẫn
 * phải mang một vùng nào đó và R2 đòi đúng chữ này.
 */
function signR2Request(options: {
  config: R2Config;
  method: string;
  path: string;
  host: string;
  payload: Buffer;
  payloadSha256: string;
  headers?: Record<string, string>;
  now: Date;
}): Record<string, string> {
  return signRequest(
    {
      method: options.method,
      path: options.path,
      host: options.host,
      payload: options.payload,
      headers: {
        ...(options.headers ?? {}),
        // Băm nội dung phải nằm trong header ĐƯỢC KÝ: đó là thứ chứng minh gói tin không bị sửa
        // trên đường đi. `UNSIGNED-PAYLOAD` cũng hợp lệ với S3 nhưng bỏ đúng tính chất đó.
        "x-amz-content-sha256": options.payloadSha256,
      },
      now: options.now,
    },
    {
      accessKeyId: options.config.accessKeyId,
      secretAccessKey: options.config.secretAccessKey,
      region: "auto",
      service: "s3",
    },
  );
}

function objectPath(config: R2Config, key: string): string {
  return `/${encodeObjectKey(config.bucket)}/${encodeObjectKey(key)}`;
}

/**
 * Đọc thân phản hồi lỗi.
 *
 * R2 trả XML nêu đích danh mã lỗi (`SignatureDoesNotMatch`, `AccessDenied`, `NoSuchBucket`), và ba
 * mã đó dẫn tới ba việc phải làm khác hẳn nhau. Nuốt nó đi thì chỉ còn "HTTP 403", câu không nói
 * được phải đi sửa gì.
 */
async function describeFailure(response: Response): Promise<string> {
  const detail = (await response.text().catch(() => "")).slice(0, 400);
  return `HTTP ${response.status}${detail ? `: ${detail}` : ""}`;
}

/** Ghi một object. Ném `R2UploadError` khi R2 từ chối. */
export async function putObject(options: {
  config: R2Config;
  key: string;
  body: Buffer;
  contentType: string;
  /** Metadata tự đặt. Tên được thêm tiền tố `x-amz-meta-` trước khi ký. */
  metadata?: Record<string, string>;
  now?: Date;
  timeoutMs?: number;
  fetchImpl?: typeof fetch;
}): Promise<void> {
  const {
    config,
    key,
    body,
    contentType,
    metadata = {},
    now = new Date(),
    timeoutMs = 60_000,
    fetchImpl = fetch,
  } = options;

  const host = r2Host(config.accountId);
  const path = objectPath(config, key);

  const headers = signR2Request({
    config,
    method: "PUT",
    path,
    host,
    payload: body,
    payloadSha256: sha256Hex(body),
    headers: {
      "content-type": contentType,
      ...Object.fromEntries(
        Object.entries(metadata).map(([name, value]) => [
          `${METADATA_PREFIX}${name.toLowerCase()}`,
          value,
        ]),
      ),
    },
    now,
  });

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

  if (!response.ok) throw new R2UploadError(`R2 từ chối (${await describeFailure(response)})`);
}

function readObjectInfo(response: Response): R2ObjectInfo {
  const metadata: Record<string, string> = {};
  response.headers.forEach((value, name) => {
    if (name.toLowerCase().startsWith(METADATA_PREFIX)) {
      metadata[name.toLowerCase().slice(METADATA_PREFIX.length)] = value;
    }
  });

  const lastModified = new Date(response.headers.get("last-modified") ?? "");

  return {
    sizeBytes: Number(response.headers.get("content-length") ?? 0),
    // Header thiếu hoặc hỏng thì `Date` thành `Invalid Date`, và một `Invalid Date` đi tiếp tới
    // giao diện sẽ hiện ra "NaN". Lùi về mốc hiện tại: nói sai vài giây thì vô hại, còn một màn
    // hình hiện NaN thì người đọc không biết phải tin gì nữa.
    lastModified: Number.isNaN(lastModified.getTime()) ? new Date() : lastModified,
    metadata,
  };
}

/**
 * Xem một object có tồn tại không, nặng bao nhiêu, mang metadata gì. `null` khi không có.
 *
 * Tách khỏi `getObject` vì trang tải cần **kích cỡ, mốc phát hành và mã băm** ở mỗi lượt xem
 * nhưng không cần nội dung. Kéo cả 32 MB về chỉ để vẽ một dòng "32.6 MB" là trả bằng băng thông
 * và bằng thời gian chờ của người đang mở trang.
 *
 * `404` ở đây là **dữ liệu, không phải lỗi**: chưa phát hành bản nào là trạng thái bình thường, và
 * trang tải phải nói được điều đó kèm việc phải làm.
 */
export async function headObject(options: {
  config: R2Config;
  key: string;
  now?: Date;
  timeoutMs?: number;
  fetchImpl?: typeof fetch;
}): Promise<R2ObjectInfo | null> {
  const { config, key, now = new Date(), timeoutMs = 15_000, fetchImpl = fetch } = options;

  const host = r2Host(config.accountId);
  const path = objectPath(config, key);

  const headers = signR2Request({
    config,
    method: "HEAD",
    path,
    host,
    payload: Buffer.alloc(0),
    payloadSha256: EMPTY_PAYLOAD_SHA256,
    now,
  });

  let response: Response;
  try {
    response = await fetchImpl(`https://${host}${path}`, {
      method: "HEAD",
      headers,
      signal: AbortSignal.timeout(timeoutMs),
    });
  } catch (cause) {
    throw new R2DownloadError(
      `Không gọi được R2: ${cause instanceof Error ? cause.message : String(cause)}`,
    );
  }

  if (response.status === 404) return null;
  if (!response.ok) throw new R2DownloadError(`R2 từ chối (${await describeFailure(response)})`);

  return readObjectInfo(response);
}

/**
 * Lấy một object về dưới dạng **luồng**, không phải buffer.
 *
 * Gói cầu nối nặng 32 MB. Đọc cả vào bộ nhớ là 32 MB trong heap của tiến trình web cho **mỗi**
 * lượt tải cùng lúc — trên gói Railway nhỏ thì vài người cùng bấm là đủ để tiến trình chết vì hết
 * bộ nhớ, và triệu chứng sẽ là "web tự khởi động lại" chứ không phải "tải hỏng".
 *
 * Object không tồn tại thì ném chứ không trả `null`: người gọi đã hỏi `headObject` trước rồi, nên
 * tới đây mà mất file nghĩa là có ai đó vừa xóa nó giữa hai lời gọi — lỗi thật, không phải trạng
 * thái bình thường.
 */
export async function getObject(options: {
  config: R2Config;
  key: string;
  now?: Date;
  timeoutMs?: number;
  fetchImpl?: typeof fetch;
}): Promise<{ info: R2ObjectInfo; body: ReadableStream<Uint8Array> }> {
  const { config, key, now = new Date(), timeoutMs = 120_000, fetchImpl = fetch } = options;

  const host = r2Host(config.accountId);
  const path = objectPath(config, key);

  const headers = signR2Request({
    config,
    method: "GET",
    path,
    host,
    payload: Buffer.alloc(0),
    payloadSha256: EMPTY_PAYLOAD_SHA256,
    now,
  });

  let response: Response;
  try {
    response = await fetchImpl(`https://${host}${path}`, {
      method: "GET",
      headers,
      signal: AbortSignal.timeout(timeoutMs),
    });
  } catch (cause) {
    throw new R2DownloadError(
      `Không gọi được R2: ${cause instanceof Error ? cause.message : String(cause)}`,
    );
  }

  if (!response.ok) throw new R2DownloadError(`R2 từ chối (${await describeFailure(response)})`);
  if (!response.body) throw new R2DownloadError("R2 trả phản hồi rỗng.");

  return { info: readObjectInfo(response), body: response.body };
}
