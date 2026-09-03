/**
 * Khai báo và đọc cấu hình Cloudflare R2 — kho đối tượng tương thích S3.
 *
 * ## Vì sao có HAI bộ biến chứ không phải một
 *
 * Máy chủ dùng R2 cho hai việc **không cùng độ nhạy cảm**, nên chúng dùng hai bucket và hai token
 * khác nhau (QĐ 12):
 *
 * | Ngăn | Chứa gì | Token cần quyền | Mất token thì sao |
 * |---|---|---|---|
 * | Sao lưu (`R2_*`) | `pg_dump` — ciphertext của cả kho | **ghi** | Kẻ đọc được cầm cả kho đã mã hóa |
 * | Gói cầu nối (`RELAY_RELEASE_R2_*`) | `.zip` phát cho team | **đọc** | Không mất gì — file này công khai được |
 *
 * Gộp hai ngăn vào một token là lấy tiện nghi đổi lấy việc **mở rộng** thiệt hại của một lần chiếm
 * máy chủ: token đó nằm cùng chỗ với `VAULT_KEY_SERVER`, nên một chìa mở được mọi ngăn nghĩa là
 * chiếm được máy chủ thì lấy luôn được mọi bản sao lưu. Ngăn gói cài chứa thứ công khai được; ngăn
 * sao lưu thì không. Hai ngăn, hai chìa.
 *
 * Token của ngăn phát hành còn nên là **chỉ đọc**: máy chủ không có việc gì phải ghi vào đó — file
 * đi lên từ máy Windows đã build, bằng `npm run relay:publish`.
 */

/** Tên biến môi trường của một ngăn R2. Bốn ô, luôn đủ bốn hoặc trống cả bốn. */
export interface R2EnvNames {
  accountId: string;
  bucket: string;
  accessKeyId: string;
  secretAccessKey: string;
}

/** Ngăn sao lưu hằng đêm — token cần quyền **ghi**. */
export const R2_ENV: R2EnvNames = {
  accountId: "R2_ACCOUNT_ID",
  bucket: "R2_BUCKET",
  accessKeyId: "R2_ACCESS_KEY_ID",
  secretAccessKey: "R2_SECRET_ACCESS_KEY",
};

/** Ngăn chứa gói cài cầu nối — token chỉ cần quyền **đọc**. */
export const RELAY_RELEASE_R2_ENV: R2EnvNames = {
  accountId: "RELAY_RELEASE_R2_ACCOUNT_ID",
  bucket: "RELAY_RELEASE_R2_BUCKET",
  accessKeyId: "RELAY_RELEASE_R2_ACCESS_KEY_ID",
  secretAccessKey: "RELAY_RELEASE_R2_SECRET_ACCESS_KEY",
};

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

/**
 * Đọc cấu hình một ngăn R2 từ biến môi trường.
 *
 * Ba trạng thái, và trạng thái giữa là trạng thái đáng nói:
 *  - **Không khai biến nào** → `null`, nghĩa là tắt tính năng dùng ngăn đó. Mặc định.
 *  - **Khai thiếu một vài biến** → **ném lỗi**. Đây là người đang cố bật tính năng mà gõ sót, và
 *    lặng lẽ coi như tắt đúng là cách để họ tin rằng nó đang chạy.
 *  - Khai đủ → cấu hình.
 */
export function readR2Config(
  env: Partial<Record<string, string>> = process.env,
  names: R2EnvNames = R2_ENV,
): R2Config | null {
  // Liệt kê thẳng bốn ô thay vì dựng bằng `Object.fromEntries`: bộ dựng động trả về một
  // `Record<string, string>` mà trình biên dịch không tin là `R2Config`, và ép kiểu ở đó là bỏ đi
  // đúng phép kiểm sẽ bắt được người sau thêm ô thứ năm mà quên đọc nó.
  const values: R2Config = {
    accountId: env[names.accountId]?.trim() ?? "",
    bucket: env[names.bucket]?.trim() ?? "",
    accessKeyId: env[names.accessKeyId]?.trim() ?? "",
    secretAccessKey: env[names.secretAccessKey]?.trim() ?? "",
  };

  const fields = Object.keys(names) as (keyof R2EnvNames)[];
  const missing = fields.filter((field) => values[field] === "").map((field) => names[field]);

  if (missing.length === fields.length) return null;

  if (missing.length > 0) {
    throw new R2ConfigError(
      `The R2 configuration is missing ${missing.join(", ")}. Set all four variables, or leave all ` +
        `four empty to disable the feature; a partial configuration cannot run safely.`,
    );
  }

  return values;
}

/** `https://<account>.r2.cloudflarestorage.com` — endpoint kiểu path của R2. */
export function r2Host(accountId: string): string {
  return `${accountId}.r2.cloudflarestorage.com`;
}
