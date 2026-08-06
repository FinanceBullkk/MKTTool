/**
 * Ký một request theo AWS Signature Version 4 — hàm thuần, không chạm mạng.
 *
 * ## Vì sao tự ký thay vì dùng `@aws-sdk/client-s3`
 *
 * Việc cần làm là **một lượt `PUT` vài chục KB** lên một bucket đã biết tên. SDK giải quyết đúng
 * việc đó, nhưng kéo theo khoảng bốn chục gói phụ thuộc vào **đúng tiến trình đang giữ
 * `VAULT_KEY_SERVER` và `DATABASE_URL`**. Với một dự án mà cả kiến trúc dựng ra để thu hẹp chỗ
 * chạm được vào kho mật khẩu, đó là diện tích tấn công thật — đổi lấy những tiện nghi không dùng
 * tới ở đây: retry, multipart, streaming, phân giải credential từ mười nguồn.
 *
 * ## Chỗ này KHÔNG có phép kiểm bằng vector chuẩn, và phải nói thẳng
 *
 * Cách kiểm đúng nhất cho một bộ ký là đối chiếu với vector do chính AWS công bố. Bộ
 * `aws-sig-v4-test-suite` có tồn tại nhưng tài liệu AWS hiện hành chỉ in
 * `Signature={{calculated-signature}}` — không có chữ ký mẫu nào để so. Viết một con số nhớ mang
 * máng vào test thì tệ hơn không có test: nó biến một cài đặt sai thành một cài đặt "đã kiểm".
 *
 * Nên phép kiểm ở đây chia hai tầng, và tầng thứ hai mới là tầng quyết định:
 *
 * 1. **Tĩnh** (`s3-signature-v4.test.ts`): hình dạng chuỗi ký — thứ tự và cách viết thường của
 *    header, dạng `credential scope`, dạng mốc thời gian, cách mã hóa tên object. Đây là chỗ các
 *    lỗi thật hay nằm, nhưng nó *không* chứng minh chữ ký đúng.
 * 2. **Động**: lượt tải lên đầu tiên. Ký sai thì R2 trả **HTTP 403 `SignatureDoesNotMatch`** ngay
 *    lượt đầu — không có đường "chạy được một nửa". Bộ lịch ghi thất bại đó vào `ScheduledJobRun`
 *    và trang Hôm nay kêu, nên nó không thể trôi qua im lặng.
 *
 * Nói cách khác: chỗ này không hỏng ngầm được. Đó là lý do chấp nhận được khi thiếu vector chuẩn —
 * chứ không phải vì "chắc là đúng".
 *
 * ## Phạm vi cố ý hẹp
 *
 * Chỉ ký được request **không có query string** và có sẵn payload dạng buffer. Đủ cho `PUT` một
 * object. Mở rộng ra ký query, ký streaming hay presigned URL thì nên xem lại quyết định trên —
 * lúc đó SDK có thể đáng giá hơn.
 */
import { createHash, createHmac } from "node:crypto";

const ALGORITHM = "AWS4-HMAC-SHA256";

export interface SigV4Credentials {
  accessKeyId: string;
  secretAccessKey: string;
  region: string;
  service: string;
}

export interface SigV4Request {
  method: string;
  /** Đường dẫn đã mã hóa URI, luôn bắt đầu bằng `/`. Ví dụ `/bucket/mkttool-2026-08-06.sql`. */
  path: string;
  host: string;
  payload: Buffer;
  /** Header bổ sung ngoài `host` và `x-amz-*` do hàm này tự thêm. */
  headers?: Record<string, string>;
  now: Date;
}

function sha256Hex(data: Buffer | string): string {
  return createHash("sha256").update(data).digest("hex");
}

function hmac(key: Buffer | string, data: string): Buffer {
  return createHmac("sha256", key).update(data, "utf8").digest();
}

/** `20260806T031500Z` — mốc thời gian dạng AWS đòi, luôn UTC. */
export function amzDate(now: Date): string {
  return now.toISOString().replace(/[-:]/g, "").replace(/\.\d{3}/, "");
}

/**
 * Chuỗi tên miền của khóa ký: ngày / vùng / dịch vụ.
 *
 * Ngày ở đây là ngày **UTC**, cố ý không đi qua `TEAM_TIMEZONE`: đây là giao thức của AWS chứ
 * không phải "hôm nay" của nghiệp vụ. Trộn hai khái niệm đó là cách chữ ký hỏng vào đúng lúc nửa
 * đêm giờ team.
 */
function credentialScope(stamp: string, region: string, service: string): string {
  return `${stamp.slice(0, 8)}/${region}/${service}/aws4_request`;
}

/**
 * Trả về bộ header đã đủ để gửi đi, gồm cả `Authorization`.
 *
 * Header được **sắp xếp và viết thường** trước khi ghép — AWS đòi đúng thứ tự đó, và sai thứ tự
 * thì chữ ký lệch mà thông báo lỗi chỉ nói "signature does not match".
 */
export function signRequest(
  request: SigV4Request,
  credentials: SigV4Credentials,
): Record<string, string> {
  const { method, path, host, payload, now } = request;
  const { accessKeyId, secretAccessKey, region, service } = credentials;

  const stamp = amzDate(now);
  const payloadHash = sha256Hex(payload);

  // Chỉ thêm hai header của CHÍNH giao thức ký. `x-amz-content-sha256` là header riêng của S3 và
  // do người gọi truyền vào — nhét nó vào đây thì hàm này không còn khớp được với bộ test vector
  // của AWS nữa, tức mất đúng cách kiểm đáng tin nhất mà cả file này dựa vào.
  const headers: Record<string, string> = {
    ...(request.headers ?? {}),
    host,
    "x-amz-date": stamp,
  };

  const canonicalHeaderEntries = Object.entries(headers)
    .map(([name, value]) => [name.toLowerCase().trim(), value.trim().replace(/\s+/g, " ")])
    .sort(([left], [right]) => (left < right ? -1 : left > right ? 1 : 0));

  const canonicalHeaders = canonicalHeaderEntries
    .map(([name, value]) => `${name}:${value}\n`)
    .join("");
  const signedHeaders = canonicalHeaderEntries.map(([name]) => name).join(";");

  // Query string luôn rỗng — xem phần "Phạm vi cố ý hẹp" ở đầu file.
  const canonicalRequest = [
    method.toUpperCase(),
    path,
    "",
    canonicalHeaders,
    signedHeaders,
    payloadHash,
  ].join("\n");

  const scope = credentialScope(stamp, region, service);
  const stringToSign = [ALGORITHM, stamp, scope, sha256Hex(canonicalRequest)].join("\n");

  const signingKey = hmac(
    hmac(hmac(hmac(`AWS4${secretAccessKey}`, stamp.slice(0, 8)), region), service),
    "aws4_request",
  );
  const signature = createHmac("sha256", signingKey).update(stringToSign, "utf8").digest("hex");

  return {
    ...headers,
    Authorization:
      `${ALGORITHM} Credential=${accessKeyId}/${scope}, ` +
      `SignedHeaders=${signedHeaders}, Signature=${signature}`,
  };
}

/**
 * Mã hóa một tên object thành phần đường dẫn URI.
 *
 * `encodeURIComponent` bỏ sót `!'()*` — AWS đòi mã hóa cả chúng, và chữ ký tính trên đường dẫn
 * ĐÃ mã hóa nên lệch một ký tự là hỏng cả chữ ký. Tên file sao lưu hiện chỉ có chữ, số và dấu
 * gạch nên chưa chạm tới, nhưng để đúng ngay từ đầu thì rẻ hơn là sửa vào ngày đổi cách đặt tên.
 */
export function encodeObjectKey(key: string): string {
  return key
    .split("/")
    .map((segment) =>
      encodeURIComponent(segment).replace(
        /[!'()*]/g,
        (character) => `%${character.charCodeAt(0).toString(16).toUpperCase()}`,
      ),
    )
    .join("/");
}
