/**
 * Máy nhận mở hộp khóa và lưu lại.
 *
 * Hai tính chất được canh, và cả hai đều là *"không ghi gì"* chứ không phải *"trả về lỗi"*:
 * một chiếc máy đang chạy tốt mà bị ghi đè khóa hỏng thì mọi bí mật thành không mở nổi, và câu
 * lỗi lúc đó sẽ nói về việc giải mã chứ không nói về lượt ghi này.
 *
 * Tính chất thứ ba là chống lại đúng lỗi mà bản mã mời mắc: ghi đè **cả file** cấu hình, xóa mất
 * `multizenToken` của máy đã cài xong.
 */
import { generateKeyPairSync } from "node:crypto";
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";
import { relayPublicKeyToHex } from "../../src/lib/tickets/relay-device-key";
import { sealForDevice } from "../../src/lib/tickets/ticket-sealed-box";
import { handleReceiveOperatorKey } from "./handle-receive-operator-key";
import { CONFIG_FILE } from "./relay-home";

const OPERATOR_KEY = "c4".repeat(32);
const homes: string[] = [];

function makeDevice() {
  const pair = generateKeyPairSync("x25519");
  return { privateKey: pair.privateKey, publicKeyHex: relayPublicKeyToHex(pair.publicKey) };
}

function makeHome(seed?: Record<string, unknown>): string {
  const dir = mkdtempSync(path.join(tmpdir(), "mkttool-relay-recv-"));
  homes.push(dir);
  if (seed) writeFileSync(path.join(dir, CONFIG_FILE), JSON.stringify(seed), "utf8");
  return dir;
}

function readConfig(home: string): Record<string, unknown> {
  return JSON.parse(readFileSync(path.join(home, CONFIG_FILE), "utf8"));
}

function call(home: string, body: unknown, devicePrivateKey: ReturnType<typeof makeDevice>["privateKey"]) {
  const onConfigured = vi.fn(() => ({ ok: true, message: "Đã lưu. Cầu nối sẵn sàng." }));
  return {
    result: handleReceiveOperatorKey(JSON.stringify(body), {
      devicePrivateKey,
      home,
      onConfigured,
    }),
    onConfigured,
  };
}

afterEach(() => {
  for (const dir of homes.splice(0)) rmSync(dir, { recursive: true, force: true });
});

describe("handleReceiveOperatorKey", () => {
  it("mở hộp của chính mình rồi lưu khóa", () => {
    const device = makeDevice();
    const home = makeHome();
    const grant = sealForDevice({ vaultKeyOperator: OPERATOR_KEY }, device.publicKeyHex);

    const { result, onConfigured } = call(home, grant, device.privateKey);

    expect(result.ok).toBe(true);
    expect(readConfig(home).vaultKeyOperator).toBe(OPERATOR_KEY);
    expect(onConfigured).toHaveBeenCalledOnce();
  });

  it("GIỮ NGUYÊN token MultiZen — không ghi đè cả file", () => {
    const device = makeDevice();
    const home = makeHome({ deviceId: "device-abc", multizenToken: "mz-token" });
    const grant = sealForDevice({ vaultKeyOperator: OPERATOR_KEY }, device.publicKeyHex);

    call(home, grant, device.privateKey);

    expect(readConfig(home)).toMatchObject({
      deviceId: "device-abc",
      multizenToken: "mz-token",
      vaultKeyOperator: OPERATOR_KEY,
    });
  });

  it("hộp của MÁY KHÁC thì từ chối và KHÔNG ghi gì", () => {
    const stranger = makeDevice();
    const me = makeDevice();
    const home = makeHome({ deviceId: "device-abc" });
    const grant = sealForDevice({ vaultKeyOperator: OPERATOR_KEY }, stranger.publicKeyHex);

    const { result, onConfigured } = call(home, grant, me.privateKey);

    expect(result.ok).toBe(false);
    expect(result.message).toContain("máy khác");
    expect(readConfig(home).vaultKeyOperator).toBeUndefined();
    expect(onConfigured).not.toHaveBeenCalled();
  });

  it("mở được nhưng ruột không phải khóa hợp lệ thì KHÔNG ghi", () => {
    // Ca này không phải giả thuyết: bên bọc đổi hình dạng payload mà bên mở chưa đổi theo là ra
    // đúng cảnh này. Ghi bừa vào đây là làm hỏng một chiếc máy đang chạy tốt.
    const device = makeDevice();
    const home = makeHome({ deviceId: "device-abc" });
    const grant = sealForDevice({ vaultKeyOperator: "khong-phai-hex" }, device.publicKeyHex);

    const { result, onConfigured } = call(home, grant, device.privateKey);

    expect(result.ok).toBe(false);
    expect(readConfig(home).vaultKeyOperator).toBeUndefined();
    expect(onConfigured).not.toHaveBeenCalled();
  });

  it("thiếu phần của hộp thì nói thẳng", () => {
    const device = makeDevice();
    const home = makeHome();

    expect(call(home, { sealed: "v1.a.b.c" }, device.privateKey).result.ok).toBe(false);
    expect(call(home, {}, device.privateKey).result.ok).toBe(false);
  });

  it("thân không phải JSON thì không nổ", () => {
    const device = makeDevice();
    const home = makeHome();
    const onConfigured = vi.fn(() => ({ ok: true, message: "" }));

    const result = handleReceiveOperatorKey("khong-phai-json", {
      devicePrivateKey: device.privateKey,
      home,
      onConfigured,
    });

    expect(result.ok).toBe(false);
    expect(onConfigured).not.toHaveBeenCalled();
  });
});
