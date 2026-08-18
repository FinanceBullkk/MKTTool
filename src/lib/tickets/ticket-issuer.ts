/**
 * Phát vé. Chạy trên **máy chủ**.
 *
 * ## Thứ tự: bọc trước, ký sau
 *
 * Ruột được mã hóa cho máy nhận, rồi chữ ký phủ lên **toàn bộ bao ngoài kể cả ruột đã bọc**.
 * Nhờ vậy cầu nối xác minh được chữ ký **trước khi** giải mã bất cứ thứ gì — nó không bao giờ
 * phải bóc một gói chưa có bảo chứng. Làm ngược lại (ký rồi mới bọc) thì chữ ký nằm bên trong
 * lớp mã hóa, và cách duy nhất để biết vé có thật hay không là cứ giải mã đã.
 *
 * ## Ký lên CHUỖI, không ký lên object
 *
 * Chữ ký phủ lên đúng chuỗi base64url được truyền đi, và cầu nối cũng xác minh trên đúng chuỗi
 * nó nhận được — không bên nào tuần tự hóa lại. Đây không phải chi tiết vặt: cầu nối GĐ4 là
 * chương trình viết độc lập, và `JSON.stringify` của hai chương trình khác nhau có thể xếp khóa
 * khác thứ tự hoặc thoát ký tự khác nhau. Ký lên object là hẹn trước một ngày mọi vé bị từ chối
 * mà không ai tìm ra vì sao.
 *
 * Cùng lý do JWS làm vậy, và ở đây lý do còn mạnh hơn vì hai đầu không dùng chung thư viện nào.
 */
import { randomUUID, sign } from "node:crypto";
import { loadServerSigningKeys } from "./server-signing-key";
import { sealForDevice } from "./ticket-sealed-box";
import {
  effectiveMinRelayVersion,
  TICKET_FORMAT_VERSION,
  TICKET_LIFETIME_MS,
  type SignedTicket,
  type TicketEnvelope,
  type TicketPayload,
} from "./ticket-types";

/** Máy nhận: chỉ cần đúng hai thứ này để phát được vé cho nó. */
export interface TicketRecipient {
  deviceId: string;
  publicKey: string;
}

/**
 * Dựng, bọc, ký một tấm vé.
 *
 * `now` nhận từ ngoài để test kiểm được chuyện hết hạn mà không phải đợi thật hay giả lập đồng
 * hồ toàn cục — cùng lối đã dùng ở các module khác của dự án.
 */
export function issueTicket(
  payload: TicketPayload,
  recipient: TicketRecipient,
  now: number = Date.now(),
): SignedTicket {
  const { ephemeralPublicKey, sealed } = sealForDevice(payload, recipient.publicKey);

  const envelope: TicketEnvelope = {
    v: TICKET_FORMAT_VERSION,
    // The higher of the security floor and this kind's capability floor. See
    // `effectiveMinRelayVersion`, which is the only place that rule is written down.
    //
    // This used to read `MIN_RELAY_VERSION_BY_KIND[kind] ?? MIN_RELAY_VERSION`, which looks like a
    // fallback and behaves as an override. Every kind is in the table, so the fallback could never
    // fire and the security floor was dead code — harmless at 1, and useless on the one day it
    // would ever be raised. See C39.
    minRelayVersion: effectiveMinRelayVersion(payload.kind),
    jti: randomUUID(),
    deviceId: recipient.deviceId,
    kind: payload.kind,
    exp: now + TICKET_LIFETIME_MS,
    epk: ephemeralPublicKey,
    sealed,
  };

  const encodedEnvelope = Buffer.from(JSON.stringify(envelope), "utf8").toString("base64url");
  const signature = sign(
    null, // Ed25519 tự băm bên trong; truyền tên thuật toán băm vào đây là lỗi.
    Buffer.from(encodedEnvelope, "utf8"),
    loadServerSigningKeys().privateKey,
  );

  return `${encodedEnvelope}.${signature.toString("base64url")}`;
}
