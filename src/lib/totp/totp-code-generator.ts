/**
 * Sinh mã OTP 6 số từ TOTP secret của nick, để đăng nhập lại khi bị logout.
 *
 * Dùng otplib v13 (API mới, hoàn toàn khác v12: class TOTP + plugin, generate là async,
 * epoch tính bằng GIÂY chứ không phải mili-giây).
 *
 * Guardrail MIN_SECRET_BYTES hạ xuống 10: mặc định otplib đòi >= 16 byte, nhưng
 * Reddit/Facebook và nhiều nền tảng phát secret 16 ký tự base32 = đúng 10 byte.
 * Không hạ thì secret thật ngoài đời bị từ chối.
 */
import {
  NobleCryptoPlugin,
  ScureBase32Plugin,
  TOTP,
  createGuardrails,
} from "otplib";

/** Chu kỳ chuẩn của TOTP, tính bằng giây. */
export const TOTP_PERIOD_SECONDS = 30;

const totp = new TOTP({
  crypto: new NobleCryptoPlugin(),
  base32: new ScureBase32Plugin(),
  guardrails: createGuardrails({ MIN_SECRET_BYTES: 10 }),
});

export class TotpGenerationError extends Error {
  constructor(message: string, options?: { cause?: unknown }) {
    super(message, options);
    this.name = "TotpGenerationError";
  }
}

export interface TotpCode {
  /** Mã 6 số. */
  code: string;
  /** Còn bao nhiêu giây nữa mã hết hạn — dùng cho đồng hồ đếm ngược trên UI. */
  secondsRemaining: number;
}

/** Chuẩn hóa secret người dùng dán vào: bỏ khoảng trắng, viết hoa. */
export function normalizeTotpSecret(secret: string): string {
  return secret.replace(/\s+/g, "").toUpperCase();
}

/**
 * Sinh mã OTP hiện tại kèm số giây còn lại.
 * @param nowMs thời điểm tính mã, mặc định là bây giờ (cho phép truyền vào để test)
 */
export async function generateTotpCode(secret: string, nowMs: number = Date.now()): Promise<TotpCode> {
  const normalized = normalizeTotpSecret(secret);
  const epochSeconds = Math.floor(nowMs / 1000);

  let code: string;
  try {
    code = await totp.generate({ secret: normalized, epoch: epochSeconds });
  } catch (cause) {
    throw new TotpGenerationError(
      "Could not generate an OTP. Check that the TOTP secret is valid base32, then try again.",
      { cause },
    );
  }

  return {
    code,
    secondsRemaining: TOTP_PERIOD_SECONDS - (epochSeconds % TOTP_PERIOD_SECONDS),
  };
}

/** Kiểm tra một secret có dùng được không, trước khi lưu vào kho danh tính. */
export async function isValidTotpSecret(secret: string): Promise<boolean> {
  try {
    await generateTotpCode(secret);
    return true;
  } catch {
    return false;
  }
}
