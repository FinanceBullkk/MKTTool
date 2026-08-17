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
import { generateKeyPairSync, randomBytes } from "node:crypto";
import type { IncomingMessage } from "node:http";
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";
import { RELAY_ORIGIN } from "../../src/lib/relay/relay-endpoints";
import { handleSetOperatorKey } from "./handle-set-operator-key";
import { CONFIG_FILE } from "./relay-home";
import { RELAY_SECRET_NAMES, type SecureStore } from "./secure-store";
import { InMemorySecureStore } from "./in-memory-secure-store";
import { issueGrantAuthorization } from "../../src/lib/relay/enrollment/grant-authorization";
import { hashGrantCompletionProof } from "../../src/lib/relay/enrollment/grant-digests";
import { relayPublicKeyToHex } from "../../src/lib/tickets/relay-device-key";
import { sealForDevice } from "../../src/lib/tickets/ticket-sealed-box";
import { BootstrapAuthorizationBroker } from "./bootstrap-authorization";
import { readOperatorGrantState } from "./operator-grant-state";

/**
 * Khóa giả nhưng phải trông như hàng thật: từ FINDING C33 handler từ chối khuôn mẫu điền tạm, và
 * `"c4".repeat(32)` — giá trị bài này dùng trước đây — chính là một trong số đó. Giá trị cố định
 * chứ không `randomBytes`: bài test cần lặp lại được, và một khóa rút ngẫu nhiên mỗi lần chạy sẽ
 * biến một lần đỏ thành thứ không dựng lại nổi.
 */
const OPERATOR_KEY = "500492c4cba32f2a2f5e5c9f0a002c5998c98ea1f0f93afc862a02a7059e8e77";
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
function call(
  home: string,
  body: unknown,
  origin: string | null = RELAY_ORIGIN,
  // Kho giả, không phải DPAPI: bài này kiểm logic ở handler, và kho thật ném trên CI Linux.
  secureStore: SecureStore = new InMemorySecureStore(),
) {
  const onConfigured = vi.fn(() => ({ ok: true, message: "Đã lưu." }));
  const request = { headers: origin ? { origin } : {} } as IncomingMessage;
  return {
    result: handleSetOperatorKey(request, JSON.stringify(body), {
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

describe("handleSetOperatorKey", () => {
  it("lưu khóa khi gọi từ chính trang của cầu nối", () => {
    const home = makeHome();
    const { result, onConfigured, secureStore } = call(home, { vaultKeyOperator: OPERATOR_KEY });

    expect(result.ok).toBe(true);
    expect(secureStore.read(RELAY_SECRET_NAMES.operatorDomainKey)).toBe(OPERATOR_KEY);
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
    const { secureStore } = call(home, { vaultKeyOperator: OPERATOR_KEY });

    expect(readConfig(home)).toMatchObject({
      deviceId: "device-abc",
      serverPublicKey: "a1".repeat(32),
    });
    expect(secureStore.read(RELAY_SECRET_NAMES.operatorDomainKey)).toBe(OPERATOR_KEY);
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

  /**
   * FINDING C33, nửa phía cầu nối.
   *
   * Đây mới là nơi khóa vùng operator sống khi GĐ3 xong — máy chủ không giữ nó nữa. Mọi chuỗi
   * dưới đây đều đúng 64 ký tự hex, nên độ dài và bảng chữ không bao giờ bắt được chúng; chỉ một
   * chính sách khuôn mẫu mới bắt được. `"0".repeat(64)` từng là placeholder in sẵn trong chính ô
   * nhập ấy, tức giá trị dễ dán nhất cũng là giá trị tệ nhất.
   *
   * Không chỉ kiểm `ok === false`: một lượt từ chối mà vẫn ghi khóa xuống kho là tệ hơn không
   * từ chối, vì nó vừa báo hỏng vừa để lại đúng thứ vừa cấm.
   */
  it.each([
    ["toàn số 0", "0".repeat(64)],
    ["toàn 0xff", "ff".repeat(32)],
    ["một byte lặp lại", "c4".repeat(32)],
    ["khối 2 byte lặp lại", "dead".repeat(16)],
    ["dãy đếm tăng", Array.from({ length: 32 }, (_, i) => i.toString(16).padStart(2, "0")).join("")],
  ])("từ chối khóa điền tạm (%s) và không ghi gì xuống kho", (_label, key) => {
    expect(key).toMatch(/^[0-9a-f]{64}$/);

    const home = makeHome();
    const { result, onConfigured, secureStore } = call(home, { vaultKeyOperator: key });

    expect(result.ok).toBe(false);
    expect(result.message).toContain("điền tạm");
    expect(secureStore.read(RELAY_SECRET_NAMES.operatorDomainKey)).toBeNull();
    expect(onConfigured).not.toHaveBeenCalled();
  });

  it("vẫn nhận khóa thật — chốt trên không được chặn nhầm hàng thật", () => {
    // Nửa còn lại của chốt, và là nửa đau hơn nếu sai: từ chối nhầm một khóa thật là khóa nhân
    // viên ra ngoài chính kho dữ liệu của họ.
    for (let i = 0; i < 50; i += 1) {
      const home = makeHome();
      const key = randomBytes(32).toString("hex");
      expect(call(home, { vaultKeyOperator: key }).result.ok, key).toBe(true);
    }
  });

  it("reports that both fields are empty instead of claiming they were saved", () => {
    const home = makeHome();
    const { result, onConfigured } = call(home, { vaultKeyOperator: "", mktBrowserToken: "" });

    expect(result.ok).toBe(false);
    expect(onConfigured).not.toHaveBeenCalled();
  });

  it("saves only the MKT Browser token without changing the operator key", () => {
    const home = makeHome();
    const seeded = new InMemorySecureStore({
      [RELAY_SECRET_NAMES.operatorDomainKey]: OPERATOR_KEY,
    });
    call(home, { mktBrowserToken: "test-browser-token" }, RELAY_ORIGIN, seeded);

    expect(readConfig(home)).toMatchObject({ mktBrowserToken: "test-browser-token" });
    expect(seeded.read(RELAY_SECRET_NAMES.operatorDomainKey)).toBe(OPERATOR_KEY);
  });

  it("recovers the cached bootstrap proof after the post-store response is lost", () => {
    const home = makeHome({ deviceId: "device-1", serverPublicKey: "a1".repeat(32) });
    const store = new InMemorySecureStore();
    const device = generateKeyPairSync("x25519");
    const signer = generateKeyPairSync("ed25519");
    const publicKey = relayPublicKeyToHex(device.publicKey);
    const proof = "bootstrap-proof";
    const completion = sealForDevice({ proof }, publicKey);
    const authorization = issueGrantAuthorization({
      kind: "bootstrap", authorizationId: "bootstrap-1", deviceId: "device-1",
      recipientPublicKey: publicKey, grantId: "bootstrap-1", generation: 1,
      grantHash: "aa".repeat(32), completionHash: hashGrantCompletionProof(proof),
      completionEphemeralPublicKey: completion.ephemeralPublicKey, completionSealed: completion.sealed,
    }, signer.privateKey, 1_000, 300_000);
    const consumedGeneration = () => readOperatorGrantState(store)?.generation ?? null;
    const broker = new BootstrapAuthorizationBroker(
      () => "device-1", publicKey, device.privateKey, () => signer.publicKey,
      () => 1_001, consumedGeneration,
    );
    broker.authorize(authorization);

    expect(() => handleSetOperatorKey(
      { headers: { origin: RELAY_ORIGIN } } as IncomingMessage,
      JSON.stringify({ vaultKeyOperator: OPERATOR_KEY }),
      { home, secureStore: store, bootstrap: broker, onConfigured: () => { throw new Error("lost response"); } },
    )).toThrow("lost response");
    expect(readOperatorGrantState(store)).toMatchObject({ kind: "bootstrap", completionProof: proof });
    expect(store.read(RELAY_SECRET_NAMES.operatorDomainKey)).toBeNull();

    const restarted = new BootstrapAuthorizationBroker(
      () => "device-1", publicKey, device.privateKey, () => signer.publicKey,
      () => 1_002, consumedGeneration,
    );
    expect(() => restarted.authorize(authorization)).toThrow(/consumed/i);
  });
});
