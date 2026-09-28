/**
 * Người dùng dán khóa vùng operator vào máy này.
 *
 * ## Vì sao đường này KHÔNG đi qua web app
 *
 * Máy chủ không có `VAULT_KEY_OPERATOR` — đó là toàn bộ điểm của GĐ3. Nếu khóa đi qua một ô nhập
 * trên trang web thì nó vừa đi qua máy chủ, và cả kiến trúc mất nghĩa trong đúng một form.
 *
 * Nên ô nhập nằm ở **trang trạng thái do chính cầu nối phục vụ**. Nó cùng nguồn với cầu nối, nên
 * chuỗi khóa không rời khỏi `127.0.0.1` một bước nào.
 *
 * ## Vì sao vẫn kiểm `Origin`
 *
 * Cùng lý do với `handle-configure.ts`: CORS chặn việc *đọc phản hồi*, không chặn request rời đi.
 * Một trang độc gửi `POST` kiểu "simple request" xuống đây sẽ **ghi đè khóa vùng operator** bằng
 * chuỗi của họ — không đọc được gì, nhưng đủ để mọi bí mật trên máy này thành không mở nổi, và
 * người dùng thì không hiểu vì sao.
 */
import type { IncomingMessage } from "node:http";
import { RELAY_ORIGIN } from "../../src/lib/relay/relay-endpoints";
import { describePlaceholderSecret } from "../../src/lib/crypto/placeholder-secret-detection";
import { fingerprintOperatorKey } from "../../src/lib/crypto/operator-key-fingerprint";
import type { RelayResponseBody } from "./relay-http-server";
import { writeRelayConfig } from "./relay-config";
import type { SecureStore } from "./secure-store";
import type { BootstrapAuthorizationBroker } from "./bootstrap-authorization";
import { readOperatorGrantState, writeOperatorGrantState } from "./operator-grant-state";

/** Cùng con số với `VAULT_KEY_HEX_LENGTH` phía máy chủ. */
const VAULT_KEY_HEX_LENGTH = 64;

export interface SetOperatorKeyDeps {
  home?: string;
  /**
   * Kho bí mật. Bỏ trống thì `writeRelayConfig` tự dựng `WindowsSecureStore`, tức đường chạy thật.
   * Có mặt để test kiểm được logic ở đây mà không cần DPAPI — CI chạy Linux, và ở đó kho thật ném.
   */
  secureStore?: SecureStore;
  bootstrap?: BootstrapAuthorizationBroker;
  onConfigured: () => { ok: boolean; message: string };
}

export function handleSetOperatorKey(
  request: IncomingMessage,
  body: string,
  deps: SetOperatorKeyDeps,
): RelayResponseBody {
  // Chỉ trang của chính cầu nối. Không nới cho web app: khóa này không được đi qua đó.
  if (request.headers.origin !== RELAY_ORIGIN) {
    return {
      ok: false,
      message:
        "Khóa vùng operator chỉ dán được ở trang trạng thái của chính cầu nối, không qua trang " +
        "web. Mở " + RELAY_ORIGIN + " trên máy này.",
    };
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(body);
  } catch {
    return { ok: false, message: "Thân request không phải JSON hợp lệ." };
  }

  const raw = (typeof parsed === "object" && parsed !== null ? parsed : {}) as Record<
    string,
    unknown
  >;

  const patch: Record<string, string> = {};

  // Cả hai ô đều tùy chọn ở đây, nhưng bỏ trống CẢ HAI là một cú bấm không làm gì — nói thẳng
  // thay vì trả về "đã lưu" cho một lượt lưu rỗng.
  const rawKey = typeof raw.vaultKeyOperator === "string" ? raw.vaultKeyOperator.trim() : "";
  if (rawKey !== "") {
    const key = rawKey.toLowerCase();
    if (key.length !== VAULT_KEY_HEX_LENGTH || !/^[0-9a-f]+$/.test(key)) {
      return {
        ok: false,
        message:
          `Khóa vùng operator phải là ${VAULT_KEY_HEX_LENGTH} ký tự hex (0-9, a-f), đang có ` +
          `${key.length} ký tự. Chép lại nguyên văn từ trình quản lý mật khẩu của team.`,
      };
    }

    /**
     * Chặn khóa điền tạm — FINDING C33, nửa phía cầu nối.
     *
     * Ô ngay trên đây là **nơi khóa operator thật sự sống** khi GĐ3 đã xong: máy chủ không giữ
     * nó nữa. Bịt lỗ ở `parseVaultKey` mà bỏ trống chỗ này thì chốt chỉ canh con đường đang bị
     * bỏ đi, còn con đường ở lại thì mở. Ô nhập lại còn gợi ý sẵn `000…0` làm placeholder, tức
     * là giá trị dễ gõ nhất cũng đúng là giá trị tệ nhất.
     *
     * Ở đây không nhắc `vault:keygen`: người đứng trước màn hình này là nhân viên đang dán khóa
     * do quản trị viên phát, không phải người sinh khóa. Bảo họ chạy script là chỉ sai cửa.
     */
    const placeholder = describePlaceholderSecret(Buffer.from(key, "hex"));
    if (placeholder) {
      return {
        ok: false,
        message:
          `Chuỗi này trông như khóa điền tạm (${placeholder}) chứ không phải khóa thật của team. ` +
          "Chép lại nguyên văn từ trình quản lý mật khẩu; nếu đúng là chuỗi quản trị viên gửi thì " +
          "báo lại — khóa đó cần được thay chứ không nên dùng.",
      };
    }

    patch.vaultKeyOperator = key;
  }

  const token = typeof raw.mktBrowserToken === "string" ? raw.mktBrowserToken.trim() : "";
  if (token !== "") patch.mktBrowserToken = token;

  if (Object.keys(patch).length === 0) {
    return { ok: false, message: "Chưa điền gì cả." };
  }

  try {
    if (patch.vaultKeyOperator && deps.bootstrap) {
      if (!deps.secureStore) throw new Error("Bootstrap requires protected storage.");
      const completion = deps.bootstrap.consume();
      writeOperatorGrantState(deps.secureStore, {
        v: 1,
        kind: "bootstrap",
        operatorKey: patch.vaultKeyOperator,
        generation: completion.generation,
        grantId: completion.grantId,
        grantHash: completion.grantHash,
        completionProof: completion.proof,
      });
      delete patch.vaultKeyOperator;
    }
    writeRelayConfig(patch, deps.home, deps.secureStore);
  } catch (error) {
    return { ok: false, message: `Không ghi được file cấu hình: ${(error as Error).message}` };
  }

  const configured = deps.onConfigured();
  if (deps.bootstrap && !deps.bootstrap.isAuthorized()) {
    const state = deps.secureStore ? readBootstrapState(deps.secureStore) : null;
    if (state) return { ...configured, ...state };
  }
  return configured;
}

function readBootstrapState(store: SecureStore): Record<string, unknown> | null {
  const state = readOperatorGrantState(store);
  return state?.kind === "bootstrap"
    ? {
        grantId: state.grantId,
        generation: state.generation,
        proof: state.completionProof,
        keyFingerprint: fingerprintOperatorKey(state.operatorKey),
      }
    : null;
}
