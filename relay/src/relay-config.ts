/**
 * Ba giá trị người cài dán vào máy này, và phép kiểm từng giá trị một.
 *
 * ## Vì sao thiếu cấu hình KHÔNG làm cầu nối tắt
 *
 * Đường đối lập nghe an toàn hơn: thiếu khóa thì đổ ngay lúc khởi động. Nhưng cầu nối chạy nền
 * và tự bật cùng máy — đổ lúc khởi động nghĩa là **không có gì để nhìn**: không cửa sổ, không
 * log ai đọc, và triệu chứng duy nhất người dùng thấy là nút trên web báo *"không thấy cầu nối
 * trên máy này"*, câu chỉ sai hướng hoàn toàn.
 *
 * Nên cầu nối vẫn nghe, và **trang trạng thái là chỗ nói thiếu gì**. Đổi lại phải giữ đúng một
 * luật: mọi đường làm việc thật (`/ticket`, `/secret`, `/encrypt-for-vault`) từ chối thẳng khi
 * cấu hình chưa đủ, kèm đúng câu thiếu gì. Chạy nửa vời là kiểu hỏng tệ nhất trong cả hệ này.
 *
 * ## Vì sao `deviceId` phải dán tay
 *
 * Máy chủ sinh id cho một chiếc máy lúc ADMIN ghi nó vào sổ (`RelayDevice.id`), tức id chỉ tồn
 * tại **sau** khi khóa công khai đi lên. Cầu nối không hỏi lại được — theo QĐ 5 nó không nối
 * mạng ra ngoài. Nên luồng cài là hai chiều: khóa công khai đi lên, mã máy đi xuống.
 */
import { readFileSync } from "node:fs";
import { CONFIG_FILE, relayFilePath, resolveRelayHome } from "./relay-home";

/** Cấu hình đã kiểm xong, sẵn sàng dùng. */
export interface RelayConfig {
  /** `RelayDevice.id` mà web app hiện sau khi đăng ký máy này. */
  deviceId: string;
  /** Khóa công khai Ed25519 của máy chủ, hex — dùng để xác minh chữ ký vé. */
  serverPublicKey: string;
  /** Khóa vùng operator, 64 ký tự hex. Chỗ duy nhất trong hệ giữ nó là máy này. */
  vaultKeyOperator: string;
  /** Nguồn web được phép gọi xuống — CORS khai đúng một nguồn, không bao giờ `*`. */
  webOrigin: string;
}

/** Một ô cấu hình chưa đúng, kèm câu nói rõ phải làm gì. */
export interface ConfigProblem {
  field: keyof RelayConfig | "file";
  message: string;
}

export type ConfigLoad =
  | { ok: true; config: RelayConfig }
  /** Thiếu hoặc sai — trang trạng thái vẽ nguyên danh sách này ra. */
  | { ok: false; problems: ConfigProblem[] };

/** Độ dài khóa vùng operator — cùng con số với `VAULT_KEY_HEX_LENGTH` phía máy chủ. */
const VAULT_KEY_HEX_LENGTH = 64;

/** Khóa công khai Ed25519 xuất ra hex cũng là 32 byte. */
const SERVER_PUBLIC_KEY_HEX_LENGTH = 64;

/**
 * Mẫu file cấu hình, in ra cho người cài chép.
 *
 * Có mặt trong chính mã nguồn thay vì chỉ nằm ở tài liệu: người đang sửa lỗi lúc 11 giờ đêm
 * đọc trang trạng thái, không đọc tài liệu bàn giao.
 */
export const CONFIG_TEMPLATE = {
  deviceId: "<mã máy, lấy ở trang Máy cầu nối trên web sau khi đăng ký>",
  serverPublicKey: "<64 ký tự hex — chạy `npm run keys:server-pubkey` trên máy chủ>",
  vaultKeyOperator: "<64 ký tự hex — khóa vùng operator của team>",
  webOrigin: "https://<địa chỉ web app>",
};

function hexProblem(
  field: keyof RelayConfig,
  value: unknown,
  length: number,
  whatItIs: string,
  whereToGetIt: string,
): ConfigProblem | null {
  if (typeof value !== "string" || value.trim() === "") {
    return { field, message: `Thiếu "${field}" — ${whatItIs}. ${whereToGetIt}` };
  }

  const hex = value.trim().toLowerCase();

  if (hex.length !== length || !/^[0-9a-f]+$/.test(hex)) {
    return {
      field,
      message:
        `"${field}" phải là ${length} ký tự hex (0-9, a-f), đang có ${hex.length} ký tự. ` +
        whereToGetIt,
    };
  }

  return null;
}

/**
 * Soi một object đã đọc từ đĩa thành cấu hình dùng được.
 *
 * Tách khỏi phần đọc file để test được mà không phải ghi ra đĩa, và để **gom hết** vấn đề rồi
 * trả một lượt: dừng ở lỗi đầu tiên thì người cài sửa một dòng, chạy lại, gặp lỗi tiếp — bốn
 * vòng cho bốn ô, mỗi vòng một lần khởi động lại.
 */
export function reviewRelayConfig(parsed: unknown): ConfigLoad {
  if (typeof parsed !== "object" || parsed === null) {
    return {
      ok: false,
      problems: [{ field: "file", message: "File cấu hình phải là một object JSON." }],
    };
  }

  const raw = parsed as Record<string, unknown>;
  const problems: ConfigProblem[] = [];

  const deviceId = typeof raw.deviceId === "string" ? raw.deviceId.trim() : "";
  if (deviceId === "") {
    problems.push({
      field: "deviceId",
      message:
        'Thiếu "deviceId" — mã chiếc máy này trong sổ đăng ký. Mở trang Máy cầu nối trên web ' +
        "app, tìm hàng của máy này rồi chép mã của nó vào đây.",
    });
  }

  const serverKeyProblem = hexProblem(
    "serverPublicKey",
    raw.serverPublicKey,
    SERVER_PUBLIC_KEY_HEX_LENGTH,
    "khóa công khai của máy chủ, dùng để nhận ra vé thật",
    "Chạy `npm run keys:server-pubkey` trên máy chủ rồi chép nguyên dòng nó in ra.",
  );
  if (serverKeyProblem) problems.push(serverKeyProblem);

  const vaultKeyProblem = hexProblem(
    "vaultKeyOperator",
    raw.vaultKeyOperator,
    VAULT_KEY_HEX_LENGTH,
    "khóa mở bí mật nick. Không có nó thì cầu nối nhận được vé nhưng không đọc nổi ruột",
    "Hỏi quản trị viên — khóa này KHÔNG nằm trên máy chủ, đó là toàn bộ mục đích của nó.",
  );
  if (vaultKeyProblem) problems.push(vaultKeyProblem);

  const webOrigin = typeof raw.webOrigin === "string" ? raw.webOrigin.trim() : "";
  const originProblem = reviewWebOrigin(webOrigin);
  if (originProblem) problems.push(originProblem);

  if (problems.length > 0) return { ok: false, problems };

  return {
    ok: true,
    config: {
      deviceId,
      serverPublicKey: String(raw.serverPublicKey).trim().toLowerCase(),
      vaultKeyOperator: String(raw.vaultKeyOperator).trim().toLowerCase(),
      webOrigin: normalizeOrigin(webOrigin),
    },
  };
}

/**
 * `webOrigin` phải là một **nguồn**, không phải một URL có đường dẫn.
 *
 * Header `Access-Control-Allow-Origin` so khớp nguyên văn với nguồn trình duyệt gửi lên. Dán
 * `https://app.example.com/accounts` vào đây thì không lượt gọi nào khớp, và triệu chứng là mọi
 * nút đều hỏng theo kiểu CORS — thứ khó đoán nhất trong cả danh sách này.
 */
function reviewWebOrigin(value: string): ConfigProblem | null {
  if (value === "") {
    return {
      field: "webOrigin",
      message:
        'Thiếu "webOrigin" — địa chỉ web app được phép gọi xuống máy này. Cầu nối chỉ nhận lời ' +
        "gọi từ đúng một nguồn, nên bỏ trống là mọi nút trên web đều hỏng.",
    };
  }

  let url: URL;
  try {
    url = new URL(value);
  } catch {
    return {
      field: "webOrigin",
      message: `"webOrigin" không phải một địa chỉ hợp lệ: ${value}. Ví dụ: https://mkttool.example.com`,
    };
  }

  if (url.pathname !== "/" || url.search !== "" || url.hash !== "") {
    return {
      field: "webOrigin",
      message:
        `"webOrigin" chỉ được là phần nguồn — "${url.protocol}//${url.host}" — không kèm đường ` +
        `dẫn. Đang có: ${value}`,
    };
  }

  return null;
}

/** `new URL(...).origin` bỏ dấu `/` cuối, đúng dạng mà trình duyệt gửi trong header `Origin`. */
function normalizeOrigin(value: string): string {
  return new URL(value).origin;
}

/** Đọc file cấu hình rồi soi. File chưa có cũng là một `problem`, không phải một ngoại lệ. */
export function loadRelayConfig(home: string = resolveRelayHome()): ConfigLoad {
  const filePath = relayFilePath(CONFIG_FILE, home);

  let raw: string;
  try {
    raw = readFileSync(filePath, "utf8");
  } catch (error) {
    const missing = (error as NodeJS.ErrnoException).code === "ENOENT";
    return {
      ok: false,
      problems: [
        {
          field: "file",
          message: missing
            ? `Chưa có file cấu hình ${filePath}. Tạo file đó với nội dung mẫu bên dưới rồi khởi động lại cầu nối.`
            : `Không đọc được ${filePath}: ${(error as Error).message}`,
        },
      ],
    };
  }

  try {
    return reviewRelayConfig(JSON.parse(raw));
  } catch {
    return {
      ok: false,
      problems: [
        {
          field: "file",
          message: `${filePath} không phải JSON hợp lệ — nhiều khả năng thừa hoặc thiếu một dấu phẩy.`,
        },
      ],
    };
  }
}
