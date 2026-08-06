/**
 * Web app ghi hộ cấu hình xuống cầu nối.
 *
 * Bài quan trọng nhất ở đây là bài `Origin`: CORS chặn việc **đọc phản hồi**, không chặn request
 * rời đi. Một trang độc gửi `POST` kiểu "simple request" vẫn tới nơi, và nếu đường này tin vào
 * header CORS thì nó vừa trỏ cầu nối sang máy chủ của kẻ tấn công — biến một chiếc máy đang giữ
 * `VAULT_KEY_OPERATOR` thành máy giải mã thuê cho mọi ciphertext lấy được từ một bản sao lưu.
 */
import type { IncomingMessage } from "node:http";
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";
import { handleConfigure } from "./handle-configure";
import { CONFIG_FILE } from "./relay-home";

const WEB_ORIGIN = "https://mkttool.example.com";
const DEVICE_ID = "device-abc123";
const SERVER_KEY = "a1".repeat(32);

const homes: string[] = [];

function makeHome(seed?: Record<string, unknown>): string {
  const dir = mkdtempSync(path.join(tmpdir(), "mkttool-relay-"));
  homes.push(dir);
  if (seed) writeFileSync(path.join(dir, CONFIG_FILE), JSON.stringify(seed), "utf8");
  return dir;
}

function readConfig(home: string): Record<string, unknown> {
  return JSON.parse(readFileSync(path.join(home, CONFIG_FILE), "utf8"));
}

/** Chỉ cần đúng một header, nên không dựng cả một `IncomingMessage` thật. */
function request(origin: string | null): IncomingMessage {
  return { headers: origin ? { origin } : {} } as IncomingMessage;
}

/**
 * `null` nghĩa là request KHÔNG khai `Origin`.
 *
 * Dùng `null` chứ không phải `undefined`: truyền `undefined` vào một tham số có giá trị mặc định
 * thì JavaScript vẫn lấy mặc định, nên bài "không khai Origin" sẽ lặng lẽ chạy với Origin hợp lệ
 * và xanh vì lý do sai. Đã đỏ thật vì đúng chuyện này.
 */
function call(home: string, body: unknown, origin: string | null = WEB_ORIGIN) {
  const onConfigured = vi.fn(() => ({ ok: true, message: "Đã lưu. Cầu nối sẵn sàng." }));
  const result = handleConfigure(request(origin), JSON.stringify(body), {
    allowedOrigin: WEB_ORIGIN,
    home,
    onConfigured,
  });
  return { result, onConfigured };
}

afterEach(() => {
  for (const dir of homes.splice(0)) rmSync(dir, { recursive: true, force: true });
});

describe("handleConfigure", () => {
  it("ghi được cấu hình từ đúng nguồn web", () => {
    const home = makeHome();
    const { result, onConfigured } = call(home, {
      deviceId: DEVICE_ID,
      serverPublicKey: SERVER_KEY,
    });

    expect(result.ok).toBe(true);
    expect(readConfig(home)).toMatchObject({
      deviceId: DEVICE_ID,
      serverPublicKey: SERVER_KEY,
    });
    // Nạp lại ngay: ghi file mà vẫn bắt tắt bật lại là dựng lại đúng bước cần dẹp — và người
    // dùng vừa đọc "đã lưu" nên họ sẽ không đi tắt bật.
    expect(onConfigured).toHaveBeenCalledOnce();
  });

  it("KHÔNG ghi khi Origin lạ, dù thân request hợp lệ", () => {
    const home = makeHome();
    const { result, onConfigured } = call(
      home,
      { deviceId: DEVICE_ID, serverPublicKey: SERVER_KEY },
      "https://ke-tan-cong.example",
    );

    expect(result.ok).toBe(false);
    expect(result.message).toContain(WEB_ORIGIN);
    expect(onConfigured).not.toHaveBeenCalled();
    expect(() => readConfig(home)).toThrow();
  });

  it("KHÔNG ghi khi request không khai Origin", () => {
    // `curl` và mọi thứ không phải trình duyệt rơi vào đây. Malware trên máy đọc thẳng file cấu
    // hình được nên đây không phải hàng rào cuối — nhưng nó không việc gì phải mở sẵn.
    const home = makeHome();
    const { result } = call(home, { deviceId: DEVICE_ID, serverPublicKey: SERVER_KEY }, null);

    expect(result.ok).toBe(false);
    expect(() => readConfig(home)).toThrow();
  });

  it("GIỮ NGUYÊN khóa vùng operator đã có", () => {
    // Đây là tính chất sống còn: máy chủ không có khóa này, nên đạp mất nó nghĩa là người dùng
    // phải đi xin lại quản trị viên.
    const home = makeHome({ vaultKeyOperator: "b".repeat(64), multizenToken: "mz-token" });
    call(home, { deviceId: DEVICE_ID, serverPublicKey: SERVER_KEY });

    expect(readConfig(home)).toMatchObject({
      vaultKeyOperator: "b".repeat(64),
      multizenToken: "mz-token",
      deviceId: DEVICE_ID,
    });
  });

  it("từ chối khóa máy chủ sai hình dạng", () => {
    const home = makeHome();
    const { result } = call(home, { deviceId: DEVICE_ID, serverPublicKey: "khong-phai-hex" });

    expect(result.ok).toBe(false);
    expect(result.message).toContain("64 ký tự hex");
  });

  it("từ chối khi thiếu mã máy", () => {
    const home = makeHome();
    expect(call(home, { serverPublicKey: SERVER_KEY }).result.ok).toBe(false);
  });

  it("bản build không nung nguồn web nào thì không nhận cấu hình từ đâu cả", () => {
    const home = makeHome();
    const result = handleConfigure(
      request(WEB_ORIGIN),
      JSON.stringify({ deviceId: DEVICE_ID, serverPublicKey: SERVER_KEY }),
      { allowedOrigin: null, home, onConfigured: () => ({ ok: true, message: "" }) },
    );

    expect(result.ok).toBe(false);
    expect(result.message).toContain("Tải lại bản mới");
  });

  it("chuẩn hóa khóa máy chủ về chữ thường", () => {
    const home = makeHome();
    call(home, { deviceId: DEVICE_ID, serverPublicKey: SERVER_KEY.toUpperCase() });

    expect(readConfig(home).serverPublicKey).toBe(SERVER_KEY);
  });
});
