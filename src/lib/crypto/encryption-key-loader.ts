/**
 * Nạp và kiểm tra khóa mã hóa kho danh tính.
 *
 * Từ GĐ3 có HAI khóa, không phải một — xem vùng khóa của từng cột trong
 * `encrypted-field-registry.ts`:
 *
 *   VAULT_KEY_SERVER    mật khẩu proxy, token Facebook. Máy chủ dùng hằng ngày.
 *   VAULT_KEY_OPERATOR  mật khẩu / email / TOTP của nick. Đích đến là CHỈ máy operator giữ;
 *                       máy chủ không có khóa này thì chiếm được máy chủ cũng không mở nổi
 *                       một mật khẩu nick nào.
 *
 * Khóa nằm ở biến môi trường, KHÔNG BAO GIỜ nằm trong database. Mất khóa = mất vĩnh viễn
 * phần dữ liệu thuộc vùng đó. Sinh khóa mới bằng: npm run vault:keygen
 *
 * Module này là bộ nạp khóa của TIẾN TRÌNH MÁY CHỦ. Cầu nối ở Phase 04 không dùng nó — nó
 * đọc khóa operator từ file cấu hình của riêng máy đó rồi truyền thẳng vào
 * `encryptCredential` / `decryptCredential`.
 */
import type { VaultDomain } from "./encrypted-field-registry";
import { describePlaceholderSecret } from "./placeholder-secret-detection";

/** Độ dài khóa AES-256 tính theo byte. */
export const VAULT_KEY_BYTES = 32;

/** Độ dài chuỗi hex tương ứng (mỗi byte = 2 ký tự hex). */
export const VAULT_KEY_HEX_LENGTH = VAULT_KEY_BYTES * 2;

/** Biến môi trường giữ khóa của từng vùng. */
export const VAULT_KEY_ENV: Record<VaultDomain, string> = {
  server: "VAULT_KEY_SERVER",
  operator: "VAULT_KEY_OPERATOR",
};

/** Tên biến cũ thời một khóa duy nhất. Chỉ còn dùng để nhận ra cấu hình chưa đổi và nói rõ. */
const LEGACY_ENV = "VAULT_KEY";

export class VaultKeyError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "VaultKeyError";
  }
}

/** Cache khóa theo vùng sau lần đọc đầu để không parse lại mỗi lần mã hóa. */
const cachedKeys = new Map<VaultDomain, Buffer>();

/** Cảnh báo "hai vùng đang dùng chung một khóa" chỉ nói một lần mỗi tiến trình. */
let warnedAboutIdenticalKeys = false;

/**
 * Nới phép kiểm khuôn mẫu cho **khóa sắp bị bỏ đi**, không bao giờ cho khóa sắp dùng.
 *
 * Ai lỡ chạy thật với `00…00` trước khi có chốt C33 thì lối ra duy nhất là `vault:rekey` — và
 * script đó phải đọc được đúng khóa hỏng ấy mới mở nổi dữ liệu để mã hóa lại. Chặn luôn cả chỗ
 * đó là nhốt người ta lại với chính lỗi mình vừa phát hiện: khóa xấu không dùng được, mà dữ liệu
 * cũng không cứu ra được.
 */
export interface ParseVaultKeyOptions {
  /** Chỉ đặt `true` ở đường ĐỌC khóa cũ để xoay/di trú. Không bao giờ ở đường nạp khóa để dùng. */
  allowPlaceholder?: boolean;
}

/**
 * Phân tích một chuỗi hex thành khóa 32 byte.
 * Tách riêng khỏi loadVaultKey để test được mà không cần đụng vào process.env.
 *
 * `source` là tên biến môi trường hoặc tên tham số dòng lệnh — nó đi thẳng vào thông báo lỗi,
 * vì "khóa sai độ dài" mà không nói khóa nào thì có hai chỗ để mò thay vì một.
 */
export function parseVaultKey(
  raw: string | undefined,
  source: string,
  options: ParseVaultKeyOptions = {},
): Buffer {
  if (!raw || raw.trim() === "") {
    throw new VaultKeyError(
      `Thiếu ${source}. Chạy \`npm run vault:keygen\` rồi dán giá trị vào file .env.`,
    );
  }

  const hex = raw.trim();

  if (hex.length !== VAULT_KEY_HEX_LENGTH) {
    throw new VaultKeyError(
      `${source} phải dài đúng ${VAULT_KEY_HEX_LENGTH} ký tự hex (${VAULT_KEY_BYTES} byte), ` +
        `đang có ${hex.length} ký tự.`,
    );
  }

  if (!/^[0-9a-fA-F]+$/.test(hex)) {
    throw new VaultKeyError(`${source} chỉ được chứa ký tự hex (0-9, a-f).`);
  }

  const key = Buffer.from(hex, "hex");

  /**
   * Chặn khóa điền tạm — FINDING C33. Cùng một lỗ mà C2 đã bịt cho hạt giống khóa ký, cùng một
   * bộ luật (xem `placeholder-secret-detection.ts`), chỉ khác chỗ nó nằm.
   *
   * Nặng hơn C2 chứ không nhẹ hơn: đoán được hạt giống ký thì giả được quyền, còn đoán được
   * `VAULT_KEY_OPERATOR` thì **mở thẳng ra chữ** mọi mật khẩu nick, mật khẩu email và mã TOTP
   * trong mọi bản sao lưu từng rời khỏi máy. Một bản dump database lộ ra ngày nào đó cộng với
   * một khóa `00…00` là bằng đúng chuyện lộ toàn bộ kho ở dạng chữ thường.
   */
  const placeholder = options.allowPlaceholder ? null : describePlaceholderSecret(key);
  if (placeholder) {
    throw new VaultKeyError(
      `${source} trông như một khóa điền tạm (${placeholder}). Khóa này mở ra bí mật của nick — ` +
        "đoán được nó thì mọi bản sao lưu lấy được đều đọc ra chữ.\n" +
        "Máy chưa có dữ liệu thật: sinh khóa mới bằng `npm run vault:keygen` rồi dán vào .env.\n" +
        "Đã lỡ chạy thật với khóa này: ĐỪNG đổi .env tay — dữ liệu đang mã hóa bằng đúng nó. " +
        `Xoay sang khóa mới bằng \`npm run vault:rekey -- --domain=<vùng> --new-key=<hex>\`, ` +
        "script đó vẫn đọc được khóa cũ.",
    );
  }

  return key;
}

/**
 * Câu báo khi thiếu khóa của một vùng.
 *
 * Nếu môi trường vẫn còn `VAULT_KEY` của thời một khóa thì nói thẳng phải làm gì: đặt CẢ HAI
 * biến mới bằng đúng giá trị cũ. Dữ liệu đang nằm trong database mã hóa bằng khóa đó, nên đặt
 * hai giá trị khác nhau ngay lúc này là tự khóa mình ra ngoài — tách khóa thật sự là việc của
 * `vault:rekey`, sau khi cấu hình đã chạy được.
 */
function explainMissingKey(envName: string): string {
  if (process.env[LEGACY_ENV]?.trim()) {
    return (
      `Thiếu ${envName}. Kho đã tách làm hai vùng khóa nên ${LEGACY_ENV} không còn được đọc nữa.\n` +
      `Trước mắt đặt CẢ HAI biến bằng đúng giá trị ${LEGACY_ENV} đang có — dữ liệu trong database ` +
      `đang mã hóa bằng khóa đó:\n` +
      `  ${VAULT_KEY_ENV.server}="<giá trị ${LEGACY_ENV} hiện tại>"\n` +
      `  ${VAULT_KEY_ENV.operator}="<giá trị ${LEGACY_ENV} hiện tại>"\n` +
      `Tách thành hai khóa khác nhau là việc của \`npm run vault:rekey -- --domain=operator\`, ` +
      `làm sau khi app chạy lại được.`
    );
  }

  return `Thiếu ${envName}. Chạy \`npm run vault:keygen\` rồi dán giá trị vào file .env.`;
}

/**
 * Thế đứng hiện tại của hai vùng khóa **trên tiến trình máy chủ này**.
 *
 * Ba trạng thái, xếp theo thứ tự từ đích ngược về:
 *
 *   `separated`      máy chủ chỉ có khóa vùng server. ĐÍCH của GĐ3 — chiếm được máy chủ cũng
 *                    không mở nổi một mật khẩu nick nào.
 *   `operator-key-on-server`  hai khóa đã khác nhau, nhưng khóa vùng operator vẫn nằm trên máy
 *                    chủ. Việc tách đã làm; việc gỡ thì chưa.
 *   `shared-key`     hai biến cùng một giá trị. Cấu hình nhìn y hệt lúc đã tách xong, nhưng
 *                    **cả GĐ3 chưa có tác dụng gì**.
 *   `no-server-key`  chưa cấu hình nổi — app sẽ đổ ngay lần mã hóa đầu tiên.
 */
export type VaultKeyPosture =
  | "separated"
  | "operator-key-on-server"
  | "shared-key"
  | "no-server-key";

/**
 * Chỉ hai biến khóa là thứ phép đọc thế đứng cần.
 *
 * Không khai `NodeJS.ProcessEnv`: Next.js bồi thêm các trường bắt buộc (`NODE_ENV`) vào kiểu đó,
 * nên test muốn dựng một môi trường giả sẽ phải khai bừa những trường nó không quan tâm.
 */
export type VaultKeyEnv = Partial<Record<string, string>>;

/**
 * Đọc thế đứng từ môi trường. Hàm thuần theo `env` truyền vào nên test được mà không đụng
 * `process.env`, và **không bao giờ trả ra giá trị khóa** — chỉ trả ra kết luận.
 */
export function readVaultKeyPosture(env: VaultKeyEnv = process.env): VaultKeyPosture {
  const server = env[VAULT_KEY_ENV.server]?.trim().toLowerCase();
  const operator = env[VAULT_KEY_ENV.operator]?.trim().toLowerCase();

  if (!server) return "no-server-key";
  if (!operator) return "separated";
  return server === operator ? "shared-key" : "operator-key-on-server";
}

/**
 * Hai vùng dùng chung một khóa thì việc chia vùng chưa có tác dụng gì — chiếm được máy chủ vẫn
 * mở được mật khẩu nick. Đó là trạng thái ĐÚNG trong lúc chuyển đổi, nhưng phải nói ra, vì
 * cấu hình nhìn giống hệt lúc đã tách xong.
 *
 * Dòng `console.warn` này chỉ tới được người đang mở terminal — tức là chỉ lúc chạy máy mình.
 * Trên Railway nó in một lần lúc khởi động rồi trôi. Nên **đường tới người dùng thật là khay
 * cảnh báo vận hành** (`src/lib/ops-alerts/`), còn dòng này giữ lại cho lúc chạy dưới máy.
 */
function warnOnceIfKeysIdentical(): void {
  if (warnedAboutIdenticalKeys) return;
  if (readVaultKeyPosture() !== "shared-key") return;

  warnedAboutIdenticalKeys = true;
  console.warn(
    `⚠️  ${VAULT_KEY_ENV.server} và ${VAULT_KEY_ENV.operator} đang là CÙNG một khóa. ` +
      `Hai vùng chưa thật sự tách — chạy \`npm run vault:rekey -- --domain=operator --new-key=<hex>\` ` +
      `để tách, rồi gỡ ${VAULT_KEY_ENV.operator} khỏi máy chủ.`,
  );
}

/** Đọc khóa của một vùng từ process.env, có cache. */
export function loadVaultKey(domain: VaultDomain): Buffer {
  const cached = cachedKeys.get(domain);
  if (cached) return cached;

  const envName = VAULT_KEY_ENV[domain];
  const raw = process.env[envName];

  if (!raw || raw.trim() === "") {
    throw new VaultKeyError(explainMissingKey(envName));
  }

  warnOnceIfKeysIdentical();

  const key = parseVaultKey(raw, envName);
  cachedKeys.set(domain, key);
  return key;
}

/** Xóa cache — chỉ dùng trong test. */
export function resetVaultKeyCache(): void {
  cachedKeys.clear();
  warnedAboutIdenticalKeys = false;
}
