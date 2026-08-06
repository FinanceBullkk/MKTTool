import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { diffieHellman } from "node:crypto";
import { relayPublicKeyToKeyObject } from "../../src/lib/tickets/relay-device-key";
import { loadOrCreateDeviceKeypair } from "./relay-device-keypair";
import { DEVICE_KEY_FILE } from "./relay-home";

/** Mỗi test một thư mục thật: hàm này ghi ra đĩa, và giả lập `fs` là bỏ qua đúng phần đáng lo. */
const homes: string[] = [];

function newHome(): string {
  const home = mkdtempSync(path.join(tmpdir(), "mkttool-relay-"));
  homes.push(home);
  return home;
}

afterEach(() => {
  while (homes.length > 0) rmSync(homes.pop()!, { recursive: true, force: true });
});

describe("loadOrCreateDeviceKeypair", () => {
  it("lần đầu thì sinh cặp khóa và ghi ra đĩa", () => {
    const home = newHome();
    const keypair = loadOrCreateDeviceKeypair(home);

    expect(keypair.created).toBe(true);
    expect(keypair.publicKeyHex).toMatch(/^[0-9a-f]{64}$/);
    expect(readFileSync(path.join(home, DEVICE_KEY_FILE), "utf8")).toContain("privateKey");
  });

  it("lần sau đọc lại ĐÚNG cặp cũ — sinh mới là tự vứt đăng ký của máy", () => {
    const home = newHome();
    const first = loadOrCreateDeviceKeypair(home);
    const second = loadOrCreateDeviceKeypair(home);

    expect(second.created).toBe(false);
    expect(second.publicKeyHex).toBe(first.publicKeyHex);
  });

  it("khóa công khai in ra khớp với khóa riêng đã lưu", () => {
    // Phép thử thật: bắt tay X25519 giữa khóa riêng của máy và khóa công khai nó khai ra phải
    // chạy được. Lệch nhau thì máy chủ bọc vé bằng một khóa mà máy này không mở nổi — và triệu
    // chứng chỉ hiện ra ở tấm vé thật đầu tiên.
    const home = newHome();
    const keypair = loadOrCreateDeviceKeypair(home);

    expect(() =>
      diffieHellman({
        privateKey: keypair.privateKey,
        publicKey: relayPublicKeyToKeyObject(keypair.publicKeyHex),
      }),
    ).not.toThrow();
  });

  it("file khóa hỏng thì NÉM LỖI, không âm thầm sinh cặp mới", () => {
    // Sinh mới ở đây biến một chiếc máy đã đăng ký thành máy lạ, và triệu chứng sẽ là
    // "vé này phát cho máy khác" — câu chỉ đúng chỗ nhưng không nói được vì sao.
    const home = newHome();
    writeFileSync(path.join(home, DEVICE_KEY_FILE), "{ không phải json", "utf8");

    expect(() => loadOrCreateDeviceKeypair(home)).toThrow(/JSON/);
  });

  it("file khóa thiếu trường privateKey cũng ném lỗi", () => {
    const home = newHome();
    writeFileSync(path.join(home, DEVICE_KEY_FILE), JSON.stringify({ note: "trống" }), "utf8");

    expect(() => loadOrCreateDeviceKeypair(home)).toThrow(/privateKey/);
  });
});
