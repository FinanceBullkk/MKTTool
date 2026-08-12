/**
 * Cặp khóa riêng của **chiếc máy này** — sinh ở lần chạy đầu, rồi ở lại mãi.
 *
 * ## Vì sao cầu nối tự sinh, thay vì máy chủ phát cho
 *
 * Đây là chốt của cả kiến trúc GĐ3/GĐ4: khóa riêng của máy **chưa từng** đi qua máy chủ, nên
 * chiếm được máy chủ không mở nổi một tấm vé nào. Máy chủ phát khóa hộ thì tính chất đó mất ngay
 * lúc phát, và không có cách nào lấy lại — nó là chuyện đã xảy ra.
 *
 * `scripts/generate-relay-device-key.ts` bên phía repo cũng sinh được một cặp, nhưng đó là đường
 * cho test và cho lúc dựng thử. Đường cài thật là hàm này, chạy trên chính chiếc máy đó.
 *
 * ## Khóa nằm ở đâu — đổi từ MKB-03 Phase 03
 *
 * Không còn là `relay-device-key.json` dạng chữ trần. Khóa đi vào kho bảo vệ theo người dùng của
 * Windows (DPAPI CurrentUser — xem `windows-secure-store.ts`), còn đường dẫn cũ giữ một **bia mộ**
 * không chứa bí mật: một bản cầu nối đời cũ gặp nó thì dừng lại, thay vì lặng lẽ sinh một khóa
 * chữ trần mới rồi chạy tiếp như không có gì.
 *
 * Ranh giới này là **cùng-một-tài-khoản-Windows**, không phải cách ly tiến trình: chương trình
 * khác chạy dưới cùng tài khoản vẫn nhờ Windows giải mã được. Nó chặn người đọc được đĩa, không
 * chặn người đã chạy được mã dưới danh nghĩa tài khoản đó.
 *
 * ## Mất khóa = phải đăng ký lại máy
 *
 * Không có đường khôi phục, và đó là thiết kế: khóa riêng không có bản sao ở đâu cả. Cầu nối sinh
 * cặp mới, in khóa công khai mới, ADMIN ghi vào sổ, thu hồi hàng cũ. Vài phút, và không mất dữ
 * liệu nào — vé chỉ sống 30 giây nên không có gì "đang dở" để mất.
 *
 * ## Đọc không ra thì ném lỗi, KHÔNG sinh cặp mới
 *
 * `SecureStore.read` ném khi blob hỏng hoặc DPAPI từ chối giải mã, và nhánh đó phải để cho ném
 * lên. Âm thầm sinh cặp mới trong tình huống đó là biến một chiếc máy **đã đăng ký** thành một
 * chiếc máy lạ, và triệu chứng sẽ là *"vé này phát cho máy khác"* — một câu chỉ đúng chỗ sai
 * nhưng không nói được vì sao.
 */
import { type KeyObject, createPublicKey } from "node:crypto";
import {
  RelayDeviceKeyError,
  generateRelayDeviceKeyPair,
  relayPrivateKeyToKeyObject,
  relayPublicKeyToHex,
} from "../../src/lib/tickets/relay-device-key";
import { resolveRelayHome } from "./relay-home";
import { RELAY_SECRET_NAMES, type SecureStore } from "./secure-store";
import { WindowsSecureStore } from "./windows-secure-store";
import { writeLegacyDeviceKeyTombstone } from "./legacy-device-key-tombstone";

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
 * Ghi bằng `writeIfAbsent` chứ không phải `write`: nếu có một tiến trình cầu nối thứ hai vừa kịp
 * sinh khóa trước, ghi đè nghĩa là chiếc máy tự vứt mất khóa mà nó vừa in ra cho người ta đi đăng
 * ký. Lượt thua không đổ — nó đọc lại khóa của bên thắng rồi đi tiếp, vì cả hai đều chỉ cần *một*
 * khóa của *chiếc máy này*, không cần biết ai sinh ra nó.
 */
export function loadOrCreateDeviceKeypair(
  home: string = resolveRelayHome(),
  secureStore: SecureStore = new WindowsSecureStore(home),
): RelayDeviceKeypair {
  const existing = secureStore.read(RELAY_SECRET_NAMES.devicePrivateKey);
  if (existing) {
    const privateKey = relayPrivateKeyToKeyObject(existing);
    return { publicKeyHex: publicKeyHexFrom(privateKey), privateKey, created: false };
  }

  const generated = generateRelayDeviceKeyPair();
  try {
    // Bia mộ đặt TRƯỚC khi có khóa: chết giữa hai lệnh này thì lượt sau chạy lại được, và không
    // có thời điểm nào một khóa chữ trần tồn tại trên đĩa.
    writeLegacyDeviceKeyTombstone(home);
    if (!secureStore.writeIfAbsent(RELAY_SECRET_NAMES.devicePrivateKey, generated.privateKeyHex)) {
      const winner = secureStore.read(RELAY_SECRET_NAMES.devicePrivateKey);
      if (!winner) throw new Error("kho bảo vệ báo đã có khóa máy nhưng đọc ra rỗng");
      const privateKey = relayPrivateKeyToKeyObject(winner);
      return { publicKeyHex: publicKeyHexFrom(privateKey), privateKey, created: false };
    }
  } catch (cause) {
    throw new RelayDeviceKeyError(
      `Không ghi được khóa máy vào kho bảo vệ của Windows: ${(cause as Error).message}\n` +
        `Cầu nối phải chạy dưới đúng tài khoản Windows của người đang dùng máy này — kho bảo vệ ` +
        `gắn với tài khoản đó. Đừng chạy nó như một dịch vụ nền, cũng đừng "Run as administrator" ` +
        `bằng một tài khoản khác. Mở lại bằng shortcut ngoài desktop rồi thử lại.`,
    );
  }

  const privateKey = relayPrivateKeyToKeyObject(generated.privateKeyHex);
  return { publicKeyHex: publicKeyHexFrom(privateKey), privateKey, created: true };
}
