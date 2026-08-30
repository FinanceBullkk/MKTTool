/**
 * Chọn các trường cấu hình profile cho một profile sắp tạo: **quốc gia proxy quyết định locale**.
 *
 * ## This is the MKT Browser "Match proxy" action expressed in code
 *
 * Quy trình đúng trong README là `gắn proxy → bấm Match proxy → rồi mới đăng nhập lần đầu`, và
 * bước giữa là bước hay bị quên. Đo 02/08/2026: một profile chạy `sv-SE` trên IP Anh. Tới
 * 07/08/2026 vẫn còn `Reddit - Account 01` để `Africa/Johannesburg` trên proxy US.
 *
 * "Match proxy" simply chooses `localeId` and `timezone` from the proxy country, which the vault
 * already knows (`Proxy.country`), while MKT Browser exposes the locale catalog through
 * `list_fingerprint_options`. This no longer needs to be a button that operators must remember;
 * it becomes a function.
 *
 * ## Hàm thuần, danh mục truyền từ ngoài vào
 *
 * The catalog comes from MKT Browser itself, **not** from a hard-coded table, which would become
 * stale as soon as a locale is added. Passing the catalog in instead of fetching it here keeps tests
 * deterministic, and this mapping is the most important behavior in the feature to test.
 */
import type { AntidetectFingerprintSpec, FingerprintOptions } from "./antidetect-browser-adapter";

/** Họ thiết bị ưu tiên: khớp hệ điều hành của máy thật để cấu hình nhất quán hơn; không phải bằng chứng cô lập. */
const WINDOWS_FAMILY_PREFIX = "windows-";

export type FingerprintPlanFailure =
  | { reason: "KHONG_CO_QUOC_GIA"; message: string }
  | { reason: "DANH_MUC_RONG"; message: string };

export type FingerprintPlanResult =
  | { ok: true; plan: AntidetectFingerprintSpec; seed: string }
  | { ok: false; failure: FingerprintPlanFailure };

/**
 * Băm ổn định một chuỗi thành số nguyên không âm — FNV-1a 32-bit.
 *
 * Cần **ổn định qua các lượt chạy và giữa các máy**, nên không dùng `Math.random()` và cũng
 * không dùng thứ gì phụ thuộc thứ tự khóa của object: xem trước hiện cho người dùng "sẽ dựng
 * America/Denver" thì lúc bấm tạo phải ra đúng America/Denver.
 */
export function stableHash(input: string): number {
  let hash = 0x811c9dc5;
  for (let index = 0; index < input.length; index += 1) {
    hash ^= input.charCodeAt(index);
    hash = Math.imul(hash, 0x01000193) >>> 0;
  }
  return hash >>> 0;
}

/** Chọn một phần tử theo hạt giống. Mảng rỗng thì `undefined` — chỗ gọi tự xử. */
function pickBySeed<T>(items: readonly T[], seedKey: string): T | undefined {
  if (items.length === 0) return undefined;
  return items[stableHash(seedKey) % items.length];
}

export interface FingerprintPlanInput {
  /** `Proxy.country` trong kho — thường viết hoa (`"US"`). */
  proxyCountry: string;
  /** Khóa gieo, nên là username của nick: ổn định và khác nhau giữa các nick. */
  seedKey: string;
  options: FingerprintOptions;
  /** Người dùng chọn tay họ thiết bị. Bỏ trống thì chọn theo hạt giống. */
  preferredDevice?: string;
}

/**
 * Dựng các trường locale/timezone/thiết bị khớp quốc gia proxy từ danh mục của nhà cung cấp.
 * Đây là tiện ích căn cấu hình profile, không phải cam kết vân tay duy nhất hay identity isolation.
 *
 * Không tra được quốc gia thì **trả lỗi chứ không đoán**. Đoán sai locale là dựng ra đúng thứ
 * hàm này sinh ra để tránh, và nó sai âm thầm — người dùng không có cách nào biết cho tới khi
 * nick chết vì một lý do không ai truy ra.
 */
export function planProfileFingerprint(input: FingerprintPlanInput): FingerprintPlanResult {
  const { proxyCountry, seedKey, options, preferredDevice } = input;

  if (options.locales.length === 0 || options.devices.length === 0) {
    return {
      ok: false,
      failure: {
        reason: "DANH_MUC_RONG",
        message:
          "MKT Browser returned no fingerprint options, so a locale cannot be selected. " +
          "Make sure MKT Browser is still running, then try again.",
      },
    };
  }

  const country = proxyCountry.trim().toLowerCase();
  const locale = options.locales.find((entry) => entry.country.toLowerCase() === country);

  if (!locale) {
    return {
      ok: false,
      failure: {
        reason: "KHONG_CO_QUOC_GIA",
        message:
          `MKT Browser has no locale group for country "${proxyCountry}". Select a locale manually, ` +
          `or create the profile in MKT Browser and paste its ID into the "Antidetect profile ID" field.`,
      },
    };
  }

  // Ưu tiên họ Windows; hết thì lấy cả danh mục — thà một cấu hình khác hệ điều hành còn hơn
  // không tạo được gì, và người dùng vẫn đổi được. Lựa chọn này không chứng minh isolation.
  const windowsFamilies = options.devices.filter((entry) =>
    entry.family.startsWith(WINDOWS_FAMILY_PREFIX),
  );
  const pool = windowsFamilies.length > 0 ? windowsFamilies : options.devices;

  const device =
    (preferredDevice && options.devices.find((entry) => entry.family === preferredDevice)) ||
    pickBySeed(pool, `${seedKey}:device`) ||
    options.devices[0];

  // Gieo bằng khóa KHÁC cho từng chiều: cùng một khóa thì nick nào rơi vào timezone thứ hai cũng
  // rơi vào thiết bị thứ hai, và hai chiều lẽ ra độc lập lại đi thành cặp.
  const timezone = pickBySeed(locale.timezones, `${seedKey}:tz`) ?? locale.timezones[0];
  const screen = pickBySeed(device.screens, `${seedKey}:screen`) ?? device.screens[0];

  return {
    ok: true,
    plan: {
      device: device.family,
      localeId: locale.id,
      timezone,
      screen: { width: screen.width, height: screen.height },
    },
    seed: `mkttool-${stableHash(seedKey).toString(16)}`,
  };
}

/** MKT Browser profile name. Predictable and easy to find visually in its profile list. */
export function profileNameForNick(platform: string, username: string): string {
  return `${platform} — ${username}`;
}
