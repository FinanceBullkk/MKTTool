/**
 * Xác minh và mở vé. Chạy trên **cầu nối** — viết ở đây để GĐ4 dùng lại nguyên vẹn.
 *
 * ## Thứ tự kiểm không phải chuyện thẩm mỹ
 *
 * 1. **Chữ ký trước tiên.** Mọi trường trong bao ngoài đều do bên gửi khai; trước khi chữ ký
 *    được xác minh thì không trường nào đáng tin, kể cả `exp` và `deviceId`. Kiểm hạn trước
 *    chữ ký là để kẻ giả mạo tự chọn hạn cho vé của họ.
 * 2. **Phiên bản định dạng**, rồi **phiên bản cầu nối tối thiểu**. Đây là lý do QĐ 11 bắt vé
 *    phải mang hai số đó: cầu nối bản cũ cần nói được *"bản cầu nối quá cũ, tải lại"* thay vì
 *    chết ở bước giải mã kèm một câu vô nghĩa. Đặt hai phép kiểm này **sau** chữ ký nhưng
 *    **trước** mọi phép kiểm khác, để câu trả lời luôn là câu hữu ích nhất.
 * 3. **Loại vé phải là loại có thật** — phép tách miền của giao thức này; xem `isKnownTicketKind`.
 *    Nằm sau hai phép kiểm phiên bản vì loại vé mới bao giờ cũng đi kèm một sàn phiên bản cao
 *    hơn, và ở tình huống đó câu đúng phải là *"cầu nối quá cũ"*.
 * 4. Hạn, đúng máy, chưa tiêu.
 * 5. Cuối cùng mới giải mã.
 *
 * ## Vì sao trả lỗi có mã, không phải chuỗi
 *
 * Cầu nối phải hiện được câu khác nhau cho *"vé quá hạn, bấm lại"* và *"bản cầu nối quá cũ"* —
 * hai thứ dẫn tới hai hành động khác hẳn nhau. So chuỗi tiếng Việt để phân biệt là cách hỏng
 * ngay lần đầu ai đó sửa một dấu phẩy.
 */
import { verify } from "node:crypto";
import type { KeyObject } from "node:crypto";
import { openSealedPayload } from "./ticket-sealed-box";
import {
  ReplayJournalUnavailableError,
  type TicketReplayGuard,
} from "./ticket-replay-guard";
import { TICKET_FORMAT_VERSION, TICKET_KINDS, type TicketEnvelope, type TicketKind } from "./ticket-types";

export type TicketRejectionCode =
  | "MALFORMED"
  | "BAD_SIGNATURE"
  | "UNKNOWN_FORMAT"
  | "UNKNOWN_KIND"
  | "RELAY_TOO_OLD"
  | "EXPIRED"
  | "WRONG_DEVICE"
  | "ALREADY_USED"
  | "JOURNAL_UNAVAILABLE"
  | "UNSEALABLE";

export class TicketRejected extends Error {
  constructor(
    readonly code: TicketRejectionCode,
    message: string,
    options?: { cause?: unknown },
  ) {
    super(message, options);
    this.name = "TicketRejected";
  }
}

/** Những gì cầu nối phải biết về chính nó để xét một tấm vé. */
export interface RelayIdentity {
  deviceId: string;
  /** Phiên bản của bản cầu nối đang chạy. */
  version: number;
  /** Khóa riêng X25519 của máy này. */
  privateKey: KeyObject;
  /** Khóa công khai Ed25519 của máy chủ, chép tay lúc cài. */
  serverPublicKey: KeyObject;
  replayGuard: TicketReplayGuard;
}

/** Vé đã qua mọi phép kiểm, ruột đã mở. */
export interface VerifiedTicket {
  envelope: TicketEnvelope;
  /** Chưa soi schema — chỗ gọi phải tự kiểm hình dạng theo `kind`. */
  payload: unknown;
}

const KNOWN_TICKET_KINDS = new Set<string>(Object.values(TICKET_KINDS));

/**
 * `kind` có phải một loại vé thật không — FINDING C1, nửa với tới được mà không phá định dạng.
 *
 * ## Đây là phép tách miền của giao thức vé
 *
 * Khóa ký của máy chủ ký cho **sáu** giao thức. Hai giao thức phát hành (cập nhật, lùi bản) mở
 * đầu bằng một chuỗi miền có dấu cách và xuống dòng, nên byte của chúng không thể trùng byte của
 * một chuỗi base64url. Ba giao thức còn lại — vé, giấy ủy quyền cấp khóa (`delivery`,
 * `bootstrap`), và giấy ủy quyền thu hồi máy — **ký đúng cùng một dạng**:
 * `base64url(JSON(...))`, không tiền tố miền nào.
 *
 * Trong ba cái đó, hai cái kia đều kiểm `kind` bằng một phép so bằng tường minh
 * (`value.kind !== "device-retirement"` …). Vé thì trước đây chỉ đòi `typeof kind === "string"`,
 * nên thứ giữ vé tách khỏi hai giao thức kia **không phải một phép kiểm nào cả** — mà là sự
 * trùng hợp về tên trường: chúng đặt tên `completionEphemeralPublicKey` / `completionSealed`
 * trong khi vé đòi `epk` / `sealed`.
 *
 * Trùng hợp đó mỏng hơn nó trông. `sealForDevice` trả về `{ ephemeralPublicKey, sealed }`, nên
 * `epk` / `sealed` đúng là cách viết tắt tự nhiên nhất; một giao thức thứ tư nào đó bọc dữ liệu
 * cho máy rồi đặt tên trường theo lối ấy — kèm `jti`, `minRelayVersion`, `deviceId`, `exp` — sẽ
 * **thành một tấm vé hợp lệ**, bất kể `kind` của nó là gì, vì vé không thèm đọc `kind`.
 *
 * Phép so bằng dưới đây đóng đúng chỗ đó. Nó không đổi một byte nào trên dây: mọi tấm vé máy chủ
 * từng phát đều mang `kind` lấy từ `TICKET_KINDS`, nên chốt này không từ chối thứ gì hợp lệ —
 * nó chỉ biến một sự trùng hợp thành một phép kiểm. Phần còn lại của C1 (đặt tiền tố miền thật
 * cho cả sáu) vẫn là một lượt phá định dạng và vẫn hoãn; xem sổ ghi.
 */
function isKnownTicketKind(kind: string): kind is TicketKind {
  return KNOWN_TICKET_KINDS.has(kind);
}

/** Bao ngoài có đủ trường đúng kiểu không. Dữ liệu từ ngoài vào, không tin hình dạng nào. */
function isEnvelopeShaped(value: unknown): value is TicketEnvelope {
  if (typeof value !== "object" || value === null) return false;
  const e = value as Record<string, unknown>;

  return (
    typeof e.v === "number" &&
    typeof e.minRelayVersion === "number" &&
    typeof e.jti === "string" &&
    typeof e.deviceId === "string" &&
    typeof e.kind === "string" &&
    typeof e.exp === "number" &&
    typeof e.epk === "string" &&
    typeof e.sealed === "string"
  );
}

export function verifyTicket(
  ticket: string,
  relay: RelayIdentity,
  now: number = Date.now(),
): VerifiedTicket {
  const parts = ticket.split(".");
  if (parts.length !== 2) {
    throw new TicketRejected(
      "MALFORMED",
      "The ticket is malformed: it must contain exactly two parts. Request a new ticket.",
    );
  }

  const [encodedEnvelope, encodedSignature] = parts;

  // Xác minh trên ĐÚNG chuỗi nhận được, không dựng lại từ object đã parse. Xem `ticket-issuer.ts`.
  const signatureOk = verify(
    null,
    Buffer.from(encodedEnvelope, "utf8"),
    relay.serverPublicKey,
    Buffer.from(encodedSignature, "base64url"),
  );

  if (!signatureOk) {
    throw new TicketRejected(
      "BAD_SIGNATURE",
      "This ticket was not issued by this server or was modified in transit. Request a new ticket.",
    );
  }

  let envelope: unknown;
  try {
    envelope = JSON.parse(Buffer.from(encodedEnvelope, "base64url").toString("utf8"));
  } catch (cause) {
    throw new TicketRejected(
      "MALFORMED",
      "The ticket envelope is not valid JSON. Request a new ticket.",
      { cause },
    );
  }

  if (!isEnvelopeShaped(envelope)) {
    throw new TicketRejected(
      "MALFORMED",
      "The ticket envelope is missing required fields. Request a new ticket.",
    );
  }

  if (envelope.v !== TICKET_FORMAT_VERSION) {
    throw new TicketRejected(
      "UNKNOWN_FORMAT",
      `This ticket uses format version ${envelope.v}, but this Relay version can read only ${TICKET_FORMAT_VERSION}. Download and reinstall Relay from the web app.`,
    );
  }

  if (envelope.minRelayVersion > relay.version) {
    throw new TicketRejected(
      "RELAY_TOO_OLD",
      `This Relay version is too old (${relay.version}); current tickets require version ${envelope.minRelayVersion} or later. Download and reinstall Relay from the web app.`,
    );
  }

  /**
   * SAU `minRelayVersion`, có chủ ý — xem QĐ 11 ở đầu file.
   *
   * Loại vé mới luôn mang một `minRelayVersion` cao hơn, nên cầu nối bản cũ gặp nó phải nghe
   * *"bản cầu nối quá cũ, tải lại"*. Đặt phép kiểm này lên trước thì cùng tình huống ấy trả về
   * *"loại vé không nhận ra"* — một câu đúng chữ nhưng chỉ sai đường: người dùng đi tìm lỗi ở
   * tấm vé, trong khi việc cần làm là cập nhật cầu nối.
   */
  if (!isKnownTicketKind(envelope.kind)) {
    throw new TicketRejected(
      "UNKNOWN_KIND",
      `The ticket type "${envelope.kind}" is not recognized by this Relay version. ` +
        "Download and reinstall Relay from the web app. If the error remains, report it because the server should not issue an unknown ticket type.",
    );
  }

  if (envelope.exp <= now) {
    throw new TicketRejected(
      "EXPIRED",
      "The ticket has expired. Use the same action again to request a new one.",
    );
  }

  if (envelope.deviceId !== relay.deviceId) {
    throw new TicketRejected(
      "WRONG_DEVICE",
      "This ticket was issued to another Relay PC. Check that Relay on this PC is registered correctly, then try again.",
    );
  }

  // Tiêu vé SAU mọi phép kiểm khác: đánh dấu rồi mới phát hiện vé quá hạn thì một tấm vé hợp lệ
  // trùng jti — dù xác suất bằng không với UUID v4 — sẽ bị chặn oan mà không ai hiểu vì sao.
  try {
    if (!relay.replayGuard.consume(envelope.jti, envelope.exp, now)) {
      throw new TicketRejected(
        "ALREADY_USED",
        "This ticket has already been used. Use the action again to request a new single-use ticket.",
      );
    }
  } catch (error) {
    if (error instanceof TicketRejected) throw error;
    if (error instanceof ReplayJournalUnavailableError) {
      throw new TicketRejected(
        "JOURNAL_UNAVAILABLE",
        "Relay could not persist its replay-protection journal, so the ticket was not accepted. Keep the journal file, fix its disk permissions, then try again.",
        { cause: error },
      );
    }
    throw error;
  }

  try {
    return {
      envelope,
      payload: openSealedPayload(
        { ephemeralPublicKey: envelope.epk, sealed: envelope.sealed },
        relay.privateKey,
      ),
    };
  } catch (cause) {
    throw new TicketRejected(
      "UNSEALABLE",
      "The ticket payload could not be opened. Request a new ticket on the registered Relay PC.",
      { cause },
    );
  }
}
