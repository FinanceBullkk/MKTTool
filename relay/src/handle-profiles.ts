/**
 * `GET /profiles` — liệt kê profile antidetect **trên máy này**.
 *
 * ## Vì sao đường này không cần vé
 *
 * Ba đường kia chở bí mật: ciphertext của nick, hoặc mật khẩu proxy đã giải mã. Đường này chở
 * Profile names and ids are already visible in MKT Browser to the operator making the request.
 * Requiring a ticket would make the server authorize a list that **it cannot see or own**.
 *
 * Lớp gác vẫn còn nguyên và vẫn là lớp gác thật: CORS chỉ trả lời cho `webOrigin` nung trong bản
 * build, y hệt `/health` — đường vốn cũng khai khóa công khai của máy mà không cần vé.
 *
 * ## Explain what MKT Browser configuration is missing; do not return an empty array
 *
 * An empty array means "this machine has no profiles", which is not the same as "MKT Browser is
 * unreachable" and could send the operator toward creating duplicates in an existing vault.
 */
import { AntidetectError } from "../../src/lib/antidetect/antidetect-browser-adapter";
import {
  AntidetectNotConfiguredError,
  AntidetectRuntimeNotReadyError,
  type RelayAntidetect,
} from "./relay-antidetect";
import type { RelayResponseBody } from "./relay-http-server";

export async function handleProfilesRequest(
  antidetect: RelayAntidetect,
): Promise<RelayResponseBody> {
  let adapter;
  try {
    await antidetect.requireOperationalRuntime();
    adapter = antidetect.getAdapter();
  } catch (error) {
    if (
      error instanceof AntidetectNotConfiguredError ||
      error instanceof AntidetectRuntimeNotReadyError
    ) {
      return { ok: false, message: error.message };
    }
    throw error;
  }

  try {
    // Hai thứ trong một lượt gọi: giao diện tạo/chọn profile luôn cần cả danh sách lẫn danh mục,
    // và tách đôi chỉ để "sạch khái niệm" thì đổi lấy một vòng gọi nữa cho mỗi lần mở trang.
    const [profiles, fingerprintOptions] = await Promise.all([
      adapter.listProfiles(),
      adapter.fingerprintOptions(),
    ]);

    return {
      ok: true,
      profiles,
      fingerprintOptions,
      message:
        profiles.length === 0
          ? "MKT Browser is reachable, but this machine has no profiles."
          : `${profiles.length} profile trên máy này.`,
    };
  } catch (error) {
    // An adapter that stops responding often means MKT Browser just stopped. Discard the cached
    // probe so the next `/health` request reports current state instead of stale state.
    antidetect.forgetProbe();
    return {
      ok: false,
      message: `Không đọc được danh sách profile. ${
        error instanceof AntidetectError ? error.message : String(error)
      }`,
    };
  }
}
