/**
 * Máy nhận mở hộp khóa và lưu lại.
 *
 * Hai tính chất được canh, và cả hai đều là *"không ghi gì"* chứ không phải *"trả về lỗi"*:
 * một chiếc máy đang chạy tốt mà bị ghi đè khóa hỏng thì mọi bí mật thành không mở nổi, và câu
 * lỗi lúc đó sẽ nói về việc giải mã chứ không nói về lượt ghi này.
 *
 * The third property guards against the exact mistake invited by this code: replacing the
 * **entire config file** and deleting `mktBrowserToken` from an already configured machine.
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
import { RELAY_SECRET_NAMES, type SecureStore } from "./secure-store";
import { InMemorySecureStore } from "./in-memory-secure-store";

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

function call(
  home: string,
  body: unknown,
  devicePrivateKey: ReturnType<typeof makeDevice>["privateKey"],
  // Kho giả, không phải DPAPI: bài này kiểm logic ở handler, và kho thật ném trên CI Linux.
  secureStore: SecureStore = new InMemorySecureStore(),
) {
  const onConfigured = vi.fn(() => ({ ok: true, message: "Đã lưu. Cầu nối sẵn sàng." }));
  return {
    result: handleReceiveOperatorKey(JSON.stringify(body), {
      devicePrivateKey,
      home,
      secureStore,
      onConfigured,
    }),
    onConfigured,
    secureStore,
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

    const { result, onConfigured, secureStore } = call(home, grant, device.privateKey);

    expect(result.ok).toBe(true);
    expect(secureStore.read(RELAY_SECRET_NAMES.operatorDomainKey)).toBe(OPERATOR_KEY);
    expect(readConfig(home).vaultKeyOperator).toBeUndefined();
    expect(onConfigured).toHaveBeenCalledOnce();
  });

  it("preserves the MKT Browser token instead of replacing the whole file", () => {
    const device = makeDevice();
    const home = makeHome({ deviceId: "device-abc", mktBrowserToken: "test-browser-token" });
    const grant = sealForDevice({ vaultKeyOperator: OPERATOR_KEY }, device.publicKeyHex);

    const { secureStore } = call(home, grant, device.privateKey);

    expect(readConfig(home)).toMatchObject({
      deviceId: "device-abc",
      mktBrowserToken: "test-browser-token",
    });
    expect(secureStore.read(RELAY_SECRET_NAMES.operatorDomainKey)).toBe(OPERATOR_KEY);
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
