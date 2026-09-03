/**
 * Kết luận "proxy này còn dùng được không" — hàm thuần, không chạm mạng lẫn database.
 *
 * Tách khỏi phần đi hỏi mạng (`proxy-exit-ip-probe.ts`) vì đây là chỗ chứa QUYẾT ĐỊNH:
 * có chặn mở profile hay không. Chỗ đó phải test được mà không cần một proxy thật.
 *
 * Nguyên tắc giống hệt bộ dò shadowban: **không đo được thì không được báo khỏe**. Bộ kiểm
 * hỏng, mạng hỏng, ipinfo đổi định dạng — tất cả đều ra KHÔNG KIỂM ĐƯỢC, tuyệt đối không ra OK.
 */
import type { ProbeOutcome } from "./proxy-exit-ip-probe";

export const PROXY_CHECK_VERDICTS = [
  "OK",
  "DEAD",
  "LEAKING",
  "COUNTRY_MISMATCH",
  "UNKNOWN",
] as const;
export type ProxyCheckVerdict = (typeof PROXY_CHECK_VERDICTS)[number];

export interface ProxyLiveness {
  verdict: ProxyCheckVerdict;
  /** Câu tiếng Việt hiện thẳng cho người dùng: đã đo được gì và nên làm gì. */
  message: string;
  /** IP người ngoài nhìn thấy, null khi không đo được. */
  exitIp: string | null;
  /**
   * Có chặn mở profile không.
   *
   * Chỉ chặn khi CHẮC CHẮN hỏng (CHẾT / RÒ). Lệch nước và không kiểm được đều là
   * "đáng ngờ nhưng chưa đủ căn cứ" — chặn ở đó là biến công cụ thành thứ không mở nổi
   * profile mỗi khi mạng chập chờn, và người dùng sẽ tìm cách tắt nó đi.
   */
  blocksLaunch: boolean;
}

export interface ProxyLivenessInput {
  /** Kết quả hỏi IP khi đi QUA proxy. */
  throughProxy: ProbeOutcome;
  /** Kết quả hỏi IP khi KHÔNG qua proxy — mốc so để phát hiện rò. */
  direct: ProbeOutcome;
  /** Quốc gia khai trong kho proxy (ô nhập tự do, thường là mã 2 ký tự). */
  declaredCountry: string;
}

/**
 * Ô "Quốc gia" là ô nhập tự do — có người gõ `US`, có người gõ `Mỹ`.
 * Chỉ so khi cả hai bên đều là mã 2 chữ cái, còn lại thì im lặng bỏ qua:
 * cảnh báo sai vì người ta gõ tiếng Việt là loại cảnh báo bị tắt sau ba lần.
 */
function comparableCountryCode(raw: string | null | undefined): string | null {
  const trimmed = raw?.trim().toUpperCase();
  return trimmed && /^[A-Z]{2}$/.test(trimmed) ? trimmed : null;
}

export function evaluateProxyLiveness(input: ProxyLivenessInput): ProxyLiveness {
  const { throughProxy, direct, declaredCountry } = input;

  if (throughProxy.kind === "unreachable") {
    return {
      verdict: "DEAD",
      message: `The proxy did not respond: ${throughProxy.detail}. Fix or replace this proxy before opening the browser profile.`,
      exitIp: null,
      blocksLaunch: true,
    };
  }

  if (throughProxy.kind === "probe-failed") {
    return {
      verdict: "UNKNOWN",
      message:
        `The proxy could not be checked: ${throughProxy.detail}. ` +
        `This is not a healthy result; open ipinfo.io in the browser profile and verify the exit IP manually.`,
      exitIp: null,
      blocksLaunch: false,
    };
  }

  // Tới đây proxy đã trả lời. Câu hỏi tiếp theo mới là câu đáng tiền: nó có thật sự đổi IP không?
  if (direct.kind === "ok" && direct.ip === throughProxy.ip) {
    return {
      verdict: "LEAKING",
      message:
        `The proxy responded, but its exit IP ${throughProxy.ip} exactly matches this PC's direct IP. ` +
        `The proxy is not changing the IP, so opening the browser profile would expose the home IP.`,
      exitIp: throughProxy.ip,
      blocksLaunch: true,
    };
  }

  const declared = comparableCountryCode(declaredCountry);
  const actual = comparableCountryCode(throughProxy.country);

  if (declared && actual && declared !== actual) {
    return {
      verdict: "COUNTRY_MISMATCH",
      message:
        `The proxy is reachable at ${throughProxy.ip}, but the exit country is ${actual} while the vault says ${declared}. ` +
        `Signing in a nick previously used in ${declared} from ${actual} is an abnormal signal; verify the proxy before continuing.`,
      exitIp: throughProxy.ip,
      blocksLaunch: false,
    };
  }

  // Không lấy được IP nhà thì phép so rò không chạy. Vẫn là OK — proxy đã chứng minh nó
  // nối được và trả về một IP — nhưng phải nói rõ phần nào chưa kiểm.
  if (direct.kind !== "ok") {
    return {
      verdict: "OK",
      message:
        `The proxy is reachable at ${throughProxy.ip}${actual ? ` (${actual})` : ""}. ` +
        `This PC's direct IP could not be checked, so the possibility that the proxy did not change the IP remains. Verify it manually in the browser profile.`,
      exitIp: throughProxy.ip,
      blocksLaunch: false,
    };
  }

  return {
    verdict: "OK",
    message: `The proxy is reachable at ${throughProxy.ip}${actual ? ` (${actual})` : ""}, which differs from this PC's direct IP.`,
    exitIp: throughProxy.ip,
    blocksLaunch: false,
  };
}

export const PROXY_CHECK_LABEL: Record<ProxyCheckVerdict, string> = {
  OK: "Healthy",
  DEAD: "Dead",
  LEAKING: "IP unchanged",
  COUNTRY_MISMATCH: "Country mismatch",
  UNKNOWN: "Not checked",
};

export const PROXY_CHECK_CLASS: Record<ProxyCheckVerdict, string> = {
  OK: "bg-emerald-100 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-300",
  DEAD: "bg-red-100 text-red-800 dark:bg-red-950 dark:text-red-300",
  LEAKING: "bg-red-100 text-red-800 dark:bg-red-950 dark:text-red-300",
  COUNTRY_MISMATCH: "bg-amber-100 text-amber-800 dark:bg-amber-950 dark:text-amber-300",
  UNKNOWN: "bg-neutral-200 text-neutral-700 dark:bg-neutral-800 dark:text-neutral-400",
};

/**
 * Kết luận nào là "đang có vấn đề" — dùng cho dải cảnh báo ở trang Hôm nay.
 *
 * KHÔNG KIỂM ĐƯỢC nằm ngoài danh sách này, có chủ ý: nó là "chưa biết", mà dựng một dải đỏ
 * cho mọi lần rớt mạng là cách nhanh nhất khiến người ta thôi đọc dải đó. Chỗ nói về "chưa
 * biết" là cột trạng thái trong bảng `/proxies`, không phải dải cảnh báo.
 */
export const PROBLEM_VERDICTS: ProxyCheckVerdict[] = ["DEAD", "LEAKING", "COUNTRY_MISMATCH"];

export function isProblemVerdict(verdict: string | null): boolean {
  return PROBLEM_VERDICTS.includes(verdict as ProxyCheckVerdict);
}
