/**
 * Cầu nối của ADMIN bọc khóa vùng operator cho một máy khác.
 *
 * Tính chất quan trọng nhất được canh ở đây là tính chất mà bản bị thay thế (`/wrap-vault-key`)
 * đã phá: **thứ phát ra phải vô dụng với chính người vừa gọi**. Nên test không chỉ hỏi "có trả về
 * gì không" mà hỏi thẳng *ai mở được cái vừa trả về*.
 */
import type { IncomingMessage } from "node:http";
import { generateKeyPairSync } from "node:crypto";
import { describe, expect, it } from "vitest";
import { RELAY_ORIGIN } from "../../src/lib/relay/relay-endpoints";
import { relayPublicKeyToHex } from "../../src/lib/tickets/relay-device-key";
import { openSealedPayload } from "../../src/lib/tickets/ticket-sealed-box";
import { handleSealOperatorKey } from "./handle-seal-operator-key";

const WEB_ORIGIN = "https://mkttool.example.com";
const OPERATOR_KEY = "c4".repeat(32);

function makeDevice() {
  const pair = generateKeyPairSync("x25519");
  return { privateKey: pair.privateKey, publicKeyHex: relayPublicKeyToHex(pair.publicKey) };
}

function call(
  body: unknown,
  {
    origin = WEB_ORIGIN,
    vaultKeyOperator = Buffer.from(OPERATOR_KEY, "hex"),
  }: { origin?: string | null; vaultKeyOperator?: Buffer | null } = {},
) {
  const request = { headers: origin ? { origin } : {} } as IncomingMessage;
  return handleSealOperatorKey(request, JSON.stringify(body), {
    allowedOrigin: WEB_ORIGIN,
    vaultKeyOperator,
    notConfiguredMessage: "Máy này chưa cấu hình xong.",
  });
}

describe("handleSealOperatorKey", () => {
  it("bọc xong thì ĐÚNG máy nhận mở ra được khóa", () => {
    const device = makeDevice();
    const result = call({ recipientPublicKey: device.publicKeyHex });

    expect(result.ok).toBe(true);

    const opened = openSealedPayload(
      { ephemeralPublicKey: String(result.ephemeralPublicKey), sealed: String(result.sealed) },
      device.privateKey,
    );
    expect(opened).toEqual({ vaultKeyOperator: OPERATOR_KEY });
  });

  it("MÁY KHÁC mở không được — đó là toàn bộ lý do đường này tồn tại", () => {
    const recipient = makeDevice();
    const stranger = makeDevice();
    const result = call({ recipientPublicKey: recipient.publicKeyHex });

    expect(() =>
      openSealedPayload(
        { ephemeralPublicKey: String(result.ephemeralPublicKey), sealed: String(result.sealed) },
        stranger.privateKey,
      ),
    ).toThrow();
  });

  it("KHÔNG trả khóa vùng operator ra dưới bất kỳ trường nào", () => {
    // Phép kiểm chống lại đúng lỗi của bản mã mời: nó trả về cả hộp lẫn chìa, nên trang web gọi
    // nó là đọc được khóa. Ở đây soi cả phản hồi dưới dạng chuỗi, không soi từng trường — thêm
    // một trường mới mà lỡ tay nhét khóa vào thì test này vẫn bắt được.
    const device = makeDevice();
    const result = call({ recipientPublicKey: device.publicKeyHex });

    expect(JSON.stringify(result)).not.toContain(OPERATOR_KEY);
  });

  it("từ chối nguồn lạ", () => {
    const device = makeDevice();
    const result = call(
      { recipientPublicKey: device.publicKeyHex },
      { origin: "https://ke-tan-cong.example" },
    );

    expect(result.ok).toBe(false);
    expect(result.sealed).toBeUndefined();
  });

  it("nhận lời gọi từ chính trang trạng thái của cầu nối", () => {
    const device = makeDevice();
    expect(call({ recipientPublicKey: device.publicKeyHex }, { origin: RELAY_ORIGIN }).ok).toBe(
      true,
    );
  });

  it("máy chưa có khóa thì nói 'chưa cấu hình xong', không bọc bừa", () => {
    // Ca của chiếc máy ĐẦU TIÊN: chưa ai cấp khóa cho nó, nên nó cũng chưa cấp cho ai được.
    const device = makeDevice();
    const result = call({ recipientPublicKey: device.publicKeyHex }, { vaultKeyOperator: null });

    expect(result.ok).toBe(false);
    expect(result.message).toContain("chưa cấu hình xong");
  });

  it("khóa công khai của máy nhận hỏng thì từ chối kèm lý do", () => {
    const result = call({ recipientPublicKey: "khong-phai-hex" });

    expect(result.ok).toBe(false);
    expect(result.sealed).toBeUndefined();
  });

  it("thiếu khóa máy nhận thì nói thẳng", () => {
    expect(call({}).ok).toBe(false);
  });
});
