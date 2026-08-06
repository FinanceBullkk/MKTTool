/**
 * Cặp khóa riêng của **chiếc máy này** — sinh ở lần chạy đầu, rồi ở lại mãi.
 *
 * ## Vì sao cầu nối tự sinh, thay vì máy chủ phát cho
 *
 * Đây là chốt của cả kiến trúc GĐ3/GĐ4: khóa riêng của máy **chưa từng** đi qua máy chủ, nên
 * chiếm được máy chủ không mở nổi một tấm vé nào. Máy chủ phát khóa hộ thì tính chất đó mất
 * ngay lúc phát, và không có cách nào lấy lại — nó là chuyện đã xảy ra.
 *
 * `scripts/generate-relay-device-key.ts` bên phía repo cũng sinh được một cặp, nhưng đó là
 * đường cho test và cho lúc dựng thử. Đường cài thật là hàm này, chạy trên chính chiếc máy đó.
 *
 * ## Mất file khóa = phải đăng ký lại máy
 *
 * Không có đường khôi phục, và đó là thiết kế: khóa riêng không có bản sao ở đâu cả. Cầu nối
 * sinh cặp mới, in khóa công khai mới, ADMIN ghi vào sổ, thu hồi hàng cũ. Vài phút, và không
 * mất dữ liệu nào — vé chỉ sống 30 giây nên không có gì "đang dở" để mất.
 */
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { type KeyObject, createPublicKey } from "node:crypto";
import {
  RelayDeviceKeyError,
  generateRelayDeviceKeyPair,
  relayPrivateKeyToKeyObject,
  relayPublicKeyToHex,
} from "../../src/lib/tickets/relay-device-key";
import { DEVICE_KEY_FILE, relayFilePath, resolveRelayHome } from "./relay-home";

/** Hình dạng file khóa trên đĩa. Một trường, để sau này thêm được mà bản cũ vẫn đọc ra. */
interface DeviceKeyFile {
  privateKey: string;
}

export interface RelayDeviceKeypair {
  /** Khóa công khai, hex — thứ người cài chép sang màn hình đăng ký trên web. */
  publicKeyHex: string;
  /** Khóa riêng đã dựng sẵn, để đưa thẳng vào `verifyTicket`. */
  privateKey: KeyObject;
  /** `true` nếu cặp khóa vừa được sinh trong lượt chạy này. */
  created: boolean;
}

/** Suy khóa công khai từ khóa riêng — không lưu riêng, để hai nửa không thể lệch nhau. */
function publicKeyHexFrom(privateKey: KeyObject): string {
  return relayPublicKeyToHex(createPublicKey(privateKey));
}

/**
 * Đọc cặp khóa của máy, sinh mới nếu chưa có.
 *
 * Ghi bằng `writeFileSync` với cờ `wx` khi tạo mới: nếu có một tiến trình cầu nối thứ hai vừa
 * kịp sinh khóa trước, cờ đó làm lượt ghi này **đổ** thay vì đè lên — và đè lên nghĩa là chiếc
 * máy tự vứt mất khóa mà nó vừa in ra cho người ta đi đăng ký.
 */
export function loadOrCreateDeviceKeypair(home: string = resolveRelayHome()): RelayDeviceKeypair {
  const filePath = relayFilePath(DEVICE_KEY_FILE, home);

  const existing = readDeviceKeyFile(filePath);
  if (existing) {
    const privateKey = relayPrivateKeyToKeyObject(existing);
    return { publicKeyHex: publicKeyHexFrom(privateKey), privateKey, created: false };
  }

  const generated = generateRelayDeviceKeyPair();
  const body: DeviceKeyFile = { privateKey: generated.privateKeyHex };

  try {
    // Thư mục cạnh `.exe` thì luôn có sẵn, nhưng `RELAY_HOME` trỏ vào chỗ chưa tạo là chuyện
    // thường — cả lúc chạy dev lẫn lúc `setup.bat` dựng thư mục mới.
    mkdirSync(home, { recursive: true });
    writeFileSync(filePath, `${JSON.stringify(body, null, 2)}\n`, { encoding: "utf8", flag: "wx" });
  } catch (cause) {
    throw new RelayDeviceKeyError(
      `Không ghi được file khóa ${filePath}: ${(cause as Error).message}\n` +
        `Cầu nối phải ghi được vào thư mục nó đang nằm. Chép .exe sang thư mục người dùng ` +
        `(đừng để trong Program Files) rồi chạy lại.`,
    );
  }

  const privateKey = relayPrivateKeyToKeyObject(generated.privateKeyHex);
  return { publicKeyHex: publicKeyHexFrom(privateKey), privateKey, created: true };
}

/**
 * Đọc khóa riêng từ file, `null` nếu chưa có file.
 *
 * File có mà hỏng thì **ném lỗi**, không âm thầm sinh cặp mới: sinh mới trong tình huống đó là
 * đổi một chiếc máy đã đăng ký thành một chiếc máy lạ, và triệu chứng sẽ là *"vé này phát cho
 * máy khác"* — một câu chỉ vào đúng chỗ sai nhưng không nói được vì sao.
 */
function readDeviceKeyFile(filePath: string): string | null {
  let raw: string;
  try {
    raw = readFileSync(filePath, "utf8");
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return null;
    throw new RelayDeviceKeyError(`Không đọc được file khóa ${filePath}: ${(error as Error).message}`);
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    throw new RelayDeviceKeyError(
      `File khóa ${filePath} không phải JSON hợp lệ. Xóa nó để cầu nối sinh cặp mới, rồi đăng ` +
        `ký lại máy này trên web (khóa công khai sẽ khác).`,
    );
  }

  const privateKey = (parsed as Partial<DeviceKeyFile>)?.privateKey;
  if (typeof privateKey !== "string" || privateKey.trim() === "") {
    throw new RelayDeviceKeyError(
      `File khóa ${filePath} thiếu trường "privateKey". Xóa nó để cầu nối sinh cặp mới, rồi ` +
        `đăng ký lại máy này trên web.`,
    );
  }

  return privateKey;
}
