/**
 * Người dùng dán khóa vùng operator vào máy này.
 *
 * Hai tính chất được canh:
 *
 *  1. **Chỉ trang của chính cầu nối gọi được.** Web app cũng không — khóa này không được đi qua
 *     máy chủ, và ngày nó đi qua thì cả GĐ3 mất nghĩa.
 *  2. **Không đạp lên `deviceId` / `serverPublicKey`** mà web app vừa ghi xuống. Hai đường ghi
 *     vào cùng một file từ hai phía; đường nào cũng ghi đè cả file là đường nào cũng phá đường kia.
 */
import type { IncomingMessage } from "node:http";
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";
import { RELAY_ORIGIN } from "../../src/lib/relay/relay-endpoints";
import { handleSetOperatorKey } from "./handle-set-operator-key";
import { CONFIG_FILE } from "./relay-home";
import { RELAY_SECRET_NAMES } from "./secure-store";
import { WindowsSecureStore } from "./windows-secure-store";
import { readProtectedOperatorKey } from "./relay-config";

const OPERATOR_KEY = "c4".repeat(32);
const homes: string[] = [];

function makeHome(seed?: Record<string, unknown>): string {
  const dir = mkdtempSync(path.join(tmpdir(), "mkttool-relay-op-"));
  homes.push(dir);
  if (seed) writeFileSync(path.join(dir, CONFIG_FILE), JSON.stringify(seed), "utf8");
  return dir;
}

function readConfig(home: string): Record<string, unknown> {
  return JSON.parse(readFileSync(path.join(home, CONFIG_FILE), "utf8"));
}

/** `null` = request không khai `Origin`. Xem chú thích cùng tên ở `handle-configure.test.ts`. */
function call(home: string, body: unknown, origin: string | null = RELAY_ORIGIN) {
  const onConfigured = vi.fn(() => ({ ok: true, message: "Đã lưu." }));
  const request = { headers: origin ? { origin } : {} } as IncomingMessage;
  return {
    result: handleSetOperatorKey(request, JSON.stringify(body), { home, onConfigured }),
    onConfigured,
  };
}

afterEach(() => {
  for (const dir of homes.splice(0)) rmSync(dir, { recursive: true, force: true });
});

describe("handleSetOperatorKey", () => {
  it("lưu khóa khi gọi từ chính trang của cầu nối", () => {
    const home = makeHome();
    const { result, onConfigured } = call(home, { vaultKeyOperator: OPERATOR_KEY });

    expect(result.ok).toBe(true);
    expect(new WindowsSecureStore(home).read(RELAY_SECRET_NAMES.operatorDomainKey)).toBe(OPERATOR_KEY);
    expect(readConfig(home).vaultKeyOperator).toBeUndefined();
    expect(onConfigured).toHaveBeenCalledOnce();
  });

  it("TỪ CHỐI khi gọi từ web app", () => {
    // Không phải phòng kẻ tấn công — phòng chính mình sáu tháng sau, lúc thêm một ô nhập cho
    // tiện. Khóa đi qua trang web là khóa đã đi qua máy chủ.
    const home = makeHome();
    const { result } = call(home, { vaultKeyOperator: OPERATOR_KEY }, "https://mkttool.example.com");

    expect(result.ok).toBe(false);
    expect(() => readConfig(home)).toThrow();
  });

  it("GIỮ NGUYÊN mã máy và khóa máy chủ do web app ghi xuống", () => {
    const home = makeHome({ deviceId: "device-abc", serverPublicKey: "a1".repeat(32) });
    call(home, { vaultKeyOperator: OPERATOR_KEY });

    expect(readConfig(home)).toMatchObject({
      deviceId: "device-abc",
      serverPublicKey: "a1".repeat(32),
    });
    expect(new WindowsSecureStore(home).read(RELAY_SECRET_NAMES.operatorDomainKey)).toBe(OPERATOR_KEY);
  });

  it("bắt khóa sai độ dài, nói rõ đang có bao nhiêu ký tự", () => {
    const home = makeHome();
    const { result } = call(home, { vaultKeyOperator: "abc" });

    expect(result.ok).toBe(false);
    expect(result.message).toContain("3 ký tự");
  });

  it("bắt khóa đúng độ dài nhưng không phải hex", () => {
    const home = makeHome();
    expect(call(home, { vaultKeyOperator: "z".repeat(64) }).result.ok).toBe(false);
  });

  it("reports that both fields are empty instead of claiming they were saved", () => {
    const home = makeHome();
    const { result, onConfigured } = call(home, { vaultKeyOperator: "", mktBrowserToken: "" });

    expect(result.ok).toBe(false);
    expect(onConfigured).not.toHaveBeenCalled();
  });

  it("saves only the MKT Browser token without changing the operator key", () => {
    const home = makeHome();
    new WindowsSecureStore(home).write(RELAY_SECRET_NAMES.operatorDomainKey, OPERATOR_KEY);
    call(home, { mktBrowserToken: "test-browser-token" });

    expect(readConfig(home)).toMatchObject({ mktBrowserToken: "test-browser-token" });
    expect(readProtectedOperatorKey(home)).toBe(OPERATOR_KEY);
  });
});
