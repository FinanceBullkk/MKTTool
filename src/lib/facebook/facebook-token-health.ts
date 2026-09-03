/**
 * Tính sức khỏe token — hàm thuần, không chạm DB lẫn mạng.
 *
 * Tách riêng vì đây là thứ quyết định "có cho đăng không" và phải test được
 * mà không cần token thật lẫn database.
 */

/** Còn dưới ngần này ngày là phải kết nối lại trước khi nó chết giữa chừng. */
export const TOKEN_WARN_DAYS = 7;

export type TokenHealthLevel = "OK" | "WARN" | "EXPIRED" | "INVALID";

export interface TokenHealth {
  level: TokenHealthLevel;
  /** null khi token không có hạn (Page token sinh từ user token long-lived). */
  daysRemaining: number | null;
  message: string;
  /** Đăng được không. EXPIRED/INVALID thì gọi API chỉ tổ ăn lỗi. */
  usable: boolean;
}

export interface TokenHealthInput {
  expiresAt: Date | null;
  /** Lần gọi thật gần nhất có báo token hỏng không. */
  tokenValid: boolean;
  tokenNote?: string | null;
}

function daysUntil(date: Date, now: Date): number {
  return Math.floor((date.getTime() - now.getTime()) / 86_400_000);
}

export function evaluateTokenHealth(input: TokenHealthInput, now: Date = new Date()): TokenHealth {
  if (!input.tokenValid) {
    return {
      level: "INVALID",
      daysRemaining: null,
      message: input.tokenNote?.trim()
        ? `Facebook rejected the token: ${input.tokenNote}`
        : "Facebook rejected the token on the latest request. Reconnect it.",
      usable: false,
    };
  }

  if (!input.expiresAt) {
    return {
      level: "OK",
      daysRemaining: null,
      message: "The token does not expire because it was created from a long-lived user token.",
      usable: true,
    };
  }

  const remaining = daysUntil(input.expiresAt, now);

  if (remaining <= 0) {
    return {
      level: "EXPIRED",
      daysRemaining: remaining,
      message: "The token has expired. Reconnect it on /facebook.",
      usable: false,
    };
  }

  if (remaining <= TOKEN_WARN_DAYS) {
    return {
      level: "WARN",
      daysRemaining: remaining,
      message:
        `The token has ${remaining} days left. Reconnect it now; if it expires mid-operation, ` +
        `every Page under this nick will stop posting at once.`,
      usable: true,
    };
  }

  return {
    level: "OK",
    daysRemaining: remaining,
    message: `The token has ${remaining} days left.`,
    usable: true,
  };
}

export const TOKEN_HEALTH_CLASS: Record<TokenHealthLevel, string> = {
  OK: "bg-emerald-100 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-300",
  WARN: "bg-amber-100 text-amber-800 dark:bg-amber-950 dark:text-amber-300",
  EXPIRED: "bg-red-100 text-red-800 dark:bg-red-950 dark:text-red-300",
  INVALID: "bg-red-100 text-red-800 dark:bg-red-950 dark:text-red-300",
};

export const TOKEN_HEALTH_LABEL: Record<TokenHealthLevel, string> = {
  OK: "Token valid",
  WARN: "Expiring soon",
  EXPIRED: "Expired",
  INVALID: "Rejected",
};
