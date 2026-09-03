/**
 * Cặp khóa ký vé của máy chủ (Ed25519).
 *
 * Máy chủ không còn giữ khóa mở bí mật nick, nên nó không tự đưa mật khẩu cho ai được nữa.
 * Thứ nó còn làm được — và là thứ duy nhất cầu nối cần ở nó — là **bảo chứng**: "vé này do
 * máy chủ phát, sau khi đã kiểm phiên đăng nhập và kiểm chủ nick". Chữ ký Ed25519 chính là
 * lời bảo chứng đó.
 *
 * Chỉ có MỘT biến môi trường: hạt giống 32 byte của khóa riêng. Khóa công khai **suy ra** từ
 * nó chứ không khai riêng — hai biến rời nhau là mở đường cho một cặp lệch nhau, mà cặp lệch
 * thì mọi vé đều bị từ chối và không nhìn vào đâu để biết vì sao.
 *
 * Khóa riêng KHÔNG BAO GIỜ rời máy chủ. Khóa công khai thì ngược lại: in ra, chép tay, dán
 * vào cấu hình từng cầu nối — nó công khai đúng nghĩa, lộ cũng không mất gì.
 *
 * Sinh khóa: npm run keys:server-keygen
 */
import { type KeyObject, createPrivateKey, createPublicKey } from "node:crypto";
import { ed25519PublicKeyRejection } from "../crypto/ed25519-point-validation.mjs";
import { describePlaceholderSecret } from "../crypto/placeholder-secret-detection";

/** Biến môi trường giữ hạt giống khóa riêng. */
export const SERVER_SIGNING_KEY_ENV = "TICKET_SIGNING_KEY";

/** Hạt giống Ed25519 luôn là 32 byte. */
export const SIGNING_SEED_BYTES = 32;

/** Độ dài chuỗi hex tương ứng. */
export const SIGNING_SEED_HEX_LENGTH = SIGNING_SEED_BYTES * 2;

/**
 * Vỏ DER cố định của khóa riêng Ed25519 dạng PKCS#8.
 *
 * Node không nhận thẳng 32 byte hạt giống, chỉ nhận khóa đã đóng gói DER. Với Ed25519 phần
 * vỏ này là hằng số — thuật toán không có tham số nào để thay đổi — nên ghép chuỗi là đủ và
 * đúng, không cần kéo thêm thư viện ASN.1 vào chỉ để dựng 16 byte không bao giờ đổi.
 */
const PKCS8_ED25519_PREFIX = Buffer.from("302e020100300506032b657004220420", "hex");

export class ServerSigningKeyError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "ServerSigningKeyError";
  }
}

/** Cặp khóa đã dựng sẵn, dùng lại cho mọi lần ký trong cùng tiến trình. */
export interface ServerSigningKeys {
  /** Ký vé. Không bao giờ xuất ra ngoài tiến trình này. */
  privateKey: KeyObject;
  /** Đối chiếu chữ ký. Đem phân phát cho cầu nối. */
  publicKey: KeyObject;
  /** Chính khóa công khai đó dạng 64 ký tự hex — dạng để người chép tay. */
  publicKeyHex: string;
}

let cachedKeys: ServerSigningKeys | null = null;

/**
 * Phân tích hạt giống hex thành 32 byte. Tách riêng khỏi phần đọc env để test được mà không
 * đụng vào process.env — cùng lý do với bộ nạp khóa kho.
 */
export function parseSigningSeed(raw: string | undefined, source: string): Buffer {
  if (!raw || raw.trim() === "") {
    throw new ServerSigningKeyError(
      `${source} is missing. Run \`npm run keys:server-keygen\`, then add the generated value to the .env file.`,
    );
  }

  const hex = raw.trim();

  if (hex.length !== SIGNING_SEED_HEX_LENGTH) {
    throw new ServerSigningKeyError(
      `${source} must contain exactly ${SIGNING_SEED_HEX_LENGTH} hexadecimal characters ` +
        `(${SIGNING_SEED_BYTES} bytes); it currently contains ${hex.length}.`,
    );
  }

  if (!/^[0-9a-fA-F]+$/.test(hex)) {
    throw new ServerSigningKeyError(`${source} may contain only hexadecimal characters (0-9, a-f).`);
  }

  const seed = Buffer.from(hex, "hex");
  const placeholder = describePlaceholderSecret(seed);
  if (placeholder) {
    throw new ServerSigningKeyError(
      `${source} looks like a placeholder seed (${placeholder}). This seed derives the server's ` +
        "signing key; anyone who guesses it can sign tickets, updates, and rollbacks. " +
        "Generate a secure seed with `npm run keys:server-keygen`.",
    );
  }

  return seed;
}

/** Dựng cặp khóa từ hạt giống. Khóa công khai suy ra từ khóa riêng, không nhận từ ngoài. */
export function signingKeysFromSeed(seed: Buffer): ServerSigningKeys {
  if (seed.length !== SIGNING_SEED_BYTES) {
    throw new ServerSigningKeyError(
      `The signing seed must be ${SIGNING_SEED_BYTES} bytes; received ${seed.length}.`,
    );
  }

  const privateKey = createPrivateKey({
    key: Buffer.concat([PKCS8_ED25519_PREFIX, seed]),
    format: "der",
    type: "pkcs8",
  });
  const publicKey = createPublicKey(privateKey);

  return { privateKey, publicKey, publicKeyHex: publicKeyToHex(publicKey) };
}

/**
 * Khóa công khai dạng 64 ký tự hex.
 *
 * Lấy qua JWK chứ không cắt DER: 32 byte cuối của bản DER đúng là khóa, nhưng cắt theo vị trí
 * là loại mã chỉ đúng tới khi có người đổi định dạng xuất, và lúc đó nó sai âm thầm.
 */
export function publicKeyToHex(publicKey: KeyObject): string {
  const jwk = publicKey.export({ format: "jwk" }) as { x?: string };

  if (!jwk.x) {
    throw new ServerSigningKeyError(
      "The public key could not be read as Ed25519. Generate and copy it again.",
    );
  }

  return Buffer.from(jwk.x, "base64url").toString("hex");
}

/**
 * Dựng khóa công khai Ed25519 từ hex. Chạy trên **cầu nối** — đầu bên kia của `publicKeyToHex`.
 *
 * Ở cùng file với hàm xuất ra hex có chủ ý: hai nửa của một giao kèo mà nằm hai nơi thì sớm
 * muộn lệch nhau, và lệch ở đây nghĩa là **mọi tấm vé đều bị từ chối** với lý do "chữ ký sai" —
 * câu chỉ vào đúng chỗ nhưng chỉ nhầm nguyên nhân.
 *
 * Khác `relayPrivateKeyToKeyObject`, chỗ này đi được đường JWK: khóa **công khai** chỉ cần `x`.
 */
export function publicKeyFromHex(hexKey: string): KeyObject {
  const hex = hexKey.replace(/\s+/g, "").toLowerCase();

  if (hex.length !== SIGNING_SEED_HEX_LENGTH || !/^[0-9a-f]+$/.test(hex)) {
    throw new ServerSigningKeyError(
      `The server public key must contain ${SIGNING_SEED_HEX_LENGTH} hexadecimal characters. ` +
        `Run \`npm run keys:server-pubkey\` on the server and copy the complete line.`,
    );
  }

  /**
   * Đúng độ dài và đúng bảng chữ vẫn chưa đủ. Xem `ed25519-point-validation.mjs`: có 8 điểm mà
   * chữ ký `(R = identity, S = 0)` nghiệm đúng cho vô số thông điệp — ai dán được một trong số đó
   * vào đây thì **giả mọi tấm vé mà không cần khóa riêng nào**. Không khóa thật nào rơi vào đó,
   * nên từ chối chúng không làm hỏng đường nào đang chạy.
   */
  const rejection = ed25519PublicKeyRejection(hex);
  if (rejection === "small-order") {
    throw new ServerSigningKeyError(
      "This value is a small-order Ed25519 point, not a valid public key: forged signatures can " +
        "verify under it without the private key. Retrieve the key again with " +
        "`npm run keys:server-pubkey` on the server.",
    );
  }
  if (rejection === "non-canonical") {
    throw new ServerSigningKeyError(
      "This value uses a non-canonical encoding, which gives one key two representations. " +
        "Copy the complete line printed by `npm run keys:server-pubkey`.",
    );
  }

  try {
    return createPublicKey({
      key: { kty: "OKP", crv: "Ed25519", x: Buffer.from(hex, "hex").toString("base64url") },
      format: "jwk",
    });
  } catch (cause) {
    throw new ServerSigningKeyError(
      `This value has the correct length but is not a valid Ed25519 public key. ` +
        `Check whether a Relay PC key (X25519) was copied instead. (${(cause as Error).message})`,
    );
  }
}

/** Đọc hạt giống từ process.env rồi dựng cặp khóa, có cache. */
export function loadServerSigningKeys(): ServerSigningKeys {
  if (cachedKeys) return cachedKeys;

  const seed = parseSigningSeed(process.env[SERVER_SIGNING_KEY_ENV], SERVER_SIGNING_KEY_ENV);
  cachedKeys = signingKeysFromSeed(seed);
  return cachedKeys;
}

/** Xóa cache — chỉ dùng trong test. */
export function resetServerSigningKeysCache(): void {
  cachedKeys = null;
}
