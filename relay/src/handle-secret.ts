/**
 * Mở một tấm vé bí mật. **Đây là chỗ duy nhất trong cả hệ mở được mật khẩu nick.**
 *
 * Máy chủ giữ ciphertext nhưng không có khóa vùng operator; khóa đó nằm trong
 * `relay-config.json` cạnh `.exe` này. Nên hàm dưới đây là điểm cuối của toàn bộ chuỗi GĐ3:
 * chiếm được máy chủ không đi tới được đây.
 *
 * ## Vì sao vé bí mật đi qua tab của cầu nối, không đi qua fetch như vé mở profile
 *
 * Hai lý do, cả hai đều là quyết định đã chốt (QĐ 3):
 *
 * 1. **Mật khẩu không bao giờ vào trang web hosted.** Trang trên Railway không nhìn thấy chuỗi
 *    này ở bất cứ khoảnh khắc nào — nó chỉ mở một tab sang `127.0.0.1` rồi hết việc.
 * 2. **Tab đó cùng nguồn với cầu nối**, nên nó không dính luật Local Network Access. Lấy được
 *    mật khẩu kể cả trên chiếc máy chưa từng bấm "Cho phép".
 *
 * ## Vé nằm ở fragment, nên phải có một lượt POST ngược lại
 *
 * Fragment (`#...`) **không được gửi lên máy chủ nào** — kể cả máy chủ này. Đó là điểm mạnh
 * (vé không nằm trong dòng log nào, không vào `Referer`), và cái giá là trang phải đọc fragment
 * bằng JavaScript rồi POST vé về `/secret/reveal`. Lượt POST đó **cùng nguồn**, nên nó không
 * phải là một đường mới ra ngoài.
 */
import { decryptCredential } from "../../src/lib/crypto/credential-encryption";
import { generateTotpCode } from "../../src/lib/totp/totp-code-generator";
import { TICKET_KINDS } from "../../src/lib/tickets/ticket-types";
import { TicketRejected, verifyTicket } from "../../src/lib/tickets/ticket-verifier";
import type { RelayIdentity } from "../../src/lib/tickets/ticket-verifier";
import type { RelayResponseBody } from "./relay-http-server";
import { TicketPayloadError, reviewTicketPayload } from "./ticket-payload-schema";

/** Nhãn hiện trên tab, theo đúng thứ vé hỏi. */
const FIELD_LABEL: Record<string, string> = {
  password: "Mật khẩu nick",
  emailPassword: "Mật khẩu email",
};

export interface SecretHandlerDeps {
  identity: RelayIdentity | null;
  /** Khóa vùng operator, 32 byte. `null` khi cấu hình chưa đủ. */
  vaultKeyOperator: Buffer | null;
  notConfiguredMessage: string;
}

/** Thân phản hồi của `/secret/reveal` — thứ trang nhỏ vẽ ra. */
export interface RevealedSecret extends RelayResponseBody {
  /** Nhãn để người xem biết mình đang nhìn cái gì. */
  label?: string;
  /** Chuỗi bí mật. Chỉ tồn tại trong tab này, không ghi ra đâu cả. */
  secret?: string;
  /** Chỉ có với OTP: mã còn sống bao lâu nữa. */
  secondsRemaining?: number;
}

function readTicketField(body: string): string {
  let parsed: unknown;
  try {
    parsed = JSON.parse(body);
  } catch {
    throw new TicketPayloadError("Thân request không phải JSON.");
  }

  const ticket = (parsed as { ticket?: unknown })?.ticket;
  if (typeof ticket !== "string" || ticket === "") {
    throw new TicketPayloadError('Thân request thiếu trường "ticket".');
  }

  return ticket;
}

/**
 * Xác minh vé rồi giải mã.
 *
 * Không bao giờ ném, và **không bao giờ đưa ciphertext hay khóa vào câu lỗi** — trang nhỏ hiện
 * thẳng `message` ra màn hình, nên mọi thứ lọt vào đó là thứ người đứng sau lưng đọc được.
 */
export async function handleSecretReveal(
  body: string,
  deps: SecretHandlerDeps,
  now: number = Date.now(),
): Promise<RevealedSecret> {
  if (!deps.identity || !deps.vaultKeyOperator) {
    return { ok: false, message: deps.notConfiguredMessage };
  }

  let ticket: string;
  try {
    ticket = readTicketField(body);
  } catch (error) {
    return { ok: false, message: (error as Error).message };
  }

  let verified;
  try {
    verified = verifyTicket(ticket, deps.identity, now);
  } catch (error) {
    if (error instanceof TicketRejected) {
      return { ok: false, message: error.message, rejectionCode: error.code };
    }
    throw error;
  }

  const kind = verified.envelope.kind;
  if (kind !== TICKET_KINDS.CREDENTIAL && kind !== TICKET_KINDS.OTP) {
    return {
      ok: false,
      message: `Vé loại "${kind}" không hiện được ở đây — tab này chỉ hiện mật khẩu và mã OTP.`,
    };
  }

  let payload;
  try {
    payload = reviewTicketPayload(kind, verified.payload);
  } catch (error) {
    return { ok: false, message: (error as Error).message };
  }

  if (payload.kind === TICKET_KINDS.CREDENTIAL) {
    return revealCredential(payload.credentialCiphertext, payload.field, deps.vaultKeyOperator);
  }

  if (payload.kind === TICKET_KINDS.OTP) {
    return revealOtp(payload.totpSecretCiphertext, deps.vaultKeyOperator, now);
  }

  // Không tới được — `reviewTicketPayload` soi theo đúng `kind` đã lọc ở trên.
  return { ok: false, message: "Ruột vé không khớp loại vé." };
}

/**
 * Câu báo khi giải mã hỏng.
 *
 * Một câu duy nhất cho mọi nguyên nhân, và **không kèm lỗi gốc**: mọi đường hỏng ở đây đều dẫn
 * về cùng một việc phải làm — kiểm lại khóa vùng operator trên máy này. Còn lỗi gốc của AES-GCM
 * thì không phân biệt nổi "sai khóa" với "dữ liệu hỏng", nên chép nó ra chỉ thêm một dòng khó
 * hiểu vào đúng lúc người ta đang cần mật khẩu gấp.
 */
const DECRYPT_FAILED =
  "Không mở được bí mật này. Nhiều khả năng khóa vùng operator trong relay-config.json không " +
  "phải khóa mà kho đang dùng — hỏi quản trị viên đối chiếu lại. (Cũng có thể dữ liệu trong kho " +
  "đã hỏng, nhưng khả năng đó thấp hơn nhiều.)";

function revealCredential(ciphertext: string, field: string, key: Buffer): RevealedSecret {
  let secret: string;
  try {
    secret = decryptCredential(ciphertext, key);
  } catch {
    return { ok: false, message: DECRYPT_FAILED };
  }

  return {
    ok: true,
    message: "Chép xong thì đóng tab này.",
    label: FIELD_LABEL[field] ?? "Bí mật của nick",
    secret,
  };
}

async function revealOtp(
  ciphertext: string,
  key: Buffer,
  now: number,
): Promise<RevealedSecret> {
  let totpSecret: string;
  try {
    totpSecret = decryptCredential(ciphertext, key);
  } catch {
    return { ok: false, message: DECRYPT_FAILED };
  }

  try {
    const { code, secondsRemaining } = await generateTotpCode(totpSecret, now);
    return {
      ok: true,
      message: "Mã đổi mỗi 30 giây.",
      label: "Mã OTP",
      secret: code,
      secondsRemaining,
    };
  } catch {
    // Giải mã ra được nhưng không sinh nổi mã: secret trong kho không phải base32 hợp lệ.
    // Từ GĐ3 máy chủ không kiểm được việc này nữa (nó không đọc nổi chuỗi đã bọc), nên phép
    // kiểm nằm ở `/encrypt-for-vault` — và câu dưới đây là lưới cuối khi có hàng đã lỡ ghi sai.
    return {
      ok: false,
      message:
        "Mở được TOTP secret của nick này nhưng nó không phải chuỗi base32 hợp lệ, nên không " +
        "sinh được mã. Sửa lại TOTP secret của nick trên web app.",
    };
  }
}
