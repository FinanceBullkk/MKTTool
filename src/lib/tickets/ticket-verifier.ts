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
 * 3. Hạn, đúng máy, chưa tiêu.
 * 4. Cuối cùng mới giải mã.
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
import type { TicketReplayGuard } from "./ticket-replay-guard";
import { TICKET_FORMAT_VERSION, type TicketEnvelope } from "./ticket-types";

export type TicketRejectionCode =
  | "MALFORMED"
  | "BAD_SIGNATURE"
  | "UNKNOWN_FORMAT"
  | "RELAY_TOO_OLD"
  | "EXPIRED"
  | "WRONG_DEVICE"
  | "ALREADY_USED"
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
    throw new TicketRejected("MALFORMED", "Vé sai định dạng — cần đúng hai phần.");
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
      "Vé không do máy chủ này phát, hoặc đã bị sửa trên đường.",
    );
  }

  let envelope: unknown;
  try {
    envelope = JSON.parse(Buffer.from(encodedEnvelope, "base64url").toString("utf8"));
  } catch (cause) {
    throw new TicketRejected("MALFORMED", "Bao ngoài của vé không phải JSON hợp lệ.", { cause });
  }

  if (!isEnvelopeShaped(envelope)) {
    throw new TicketRejected("MALFORMED", "Bao ngoài của vé thiếu trường bắt buộc.");
  }

  if (envelope.v !== TICKET_FORMAT_VERSION) {
    throw new TicketRejected(
      "UNKNOWN_FORMAT",
      `Vé dùng định dạng phiên bản ${envelope.v}, bản cầu nối này chỉ đọc được ${TICKET_FORMAT_VERSION}. Tải lại cầu nối từ web app.`,
    );
  }

  if (envelope.minRelayVersion > relay.version) {
    throw new TicketRejected(
      "RELAY_TOO_OLD",
      `Bản cầu nối này quá cũ (${relay.version}); máy chủ đang phát vé cần bản ${envelope.minRelayVersion} trở lên. Tải lại cầu nối từ web app.`,
    );
  }

  if (envelope.exp <= now) {
    throw new TicketRejected("EXPIRED", "Vé đã quá hạn. Bấm lại nút vừa bấm.");
  }

  if (envelope.deviceId !== relay.deviceId) {
    throw new TicketRejected(
      "WRONG_DEVICE",
      "Vé này phát cho máy khác. Kiểm lại xem cầu nối trên máy này đã đăng ký đúng chưa.",
    );
  }

  // Tiêu vé SAU mọi phép kiểm khác: đánh dấu rồi mới phát hiện vé quá hạn thì một tấm vé hợp lệ
  // trùng jti — dù xác suất bằng không với UUID v4 — sẽ bị chặn oan mà không ai hiểu vì sao.
  if (!relay.replayGuard.consume(envelope.jti, envelope.exp, now)) {
    throw new TicketRejected(
      "ALREADY_USED",
      "Vé này đã dùng rồi. Mỗi lần bấm chỉ đổi được một lần.",
    );
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
    throw new TicketRejected("UNSEALABLE", "Không mở được ruột vé.", { cause });
  }
}
