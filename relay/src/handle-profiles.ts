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
import {
  isAntidetectProfileSummary,
  isFingerprintOptions,
} from "../../src/lib/antidetect/antidetect-browser-adapter";
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
    if (error instanceof AntidetectNotConfiguredError) {
      return {
        ok: false,
        code: "BROWSER_NOT_CONFIGURED",
        stage: "not-configured",
        message: "Open MKT Browser, enable MCP, then check again.",
      };
    }
    if (error instanceof AntidetectRuntimeNotReadyError) {
      return {
        ok: false,
        code: error.code,
        stage: "browser-health",
        message: "MKT Browser is not ready for profile operations. Keep it open, then check again.",
      };
    }
    return {
      ok: false,
      code: "BROWSER_HEALTH_UNAVAILABLE",
      stage: "browser-health",
      message: "MKT Browser readiness could not be checked. Keep it open, then check again.",
    };
  }

  try {
    // Hai thứ trong một lượt gọi: giao diện tạo/chọn profile luôn cần cả danh sách lẫn danh mục,
    // và tách đôi chỉ để "sạch khái niệm" thì đổi lấy một vòng gọi nữa cho mỗi lần mở trang.
    const [profileList, fingerprintOptionsRead] = await Promise.allSettled([
      adapter.listProfiles().then((value) => ({ stage: "profile-list" as const, value })),
      adapter.fingerprintOptions().then((value) => ({ stage: "fingerprint-options" as const, value })),
    ]);

    if (profileList.status === "rejected") {
      antidetect.forgetProbe();
      return {
        ok: false,
        code: "PROFILE_LIST_UNAVAILABLE",
        stage: "profile-list",
        message: "MKT Browser could not read its browser profile list. Keep it open, then check again.",
      };
    }
    if (fingerprintOptionsRead.status === "rejected") {
      antidetect.forgetProbe();
      return {
        ok: false,
        code: "FINGERPRINT_OPTIONS_UNAVAILABLE",
        stage: "fingerprint-options",
        message: "MKT Browser could not read browser profile options. Keep it open, then check again.",
      };
    }

    const profiles = profileList.value.value;
    const fingerprintOptions = fingerprintOptionsRead.value.value;
    if (!Array.isArray(profiles) || !profiles.every(isAntidetectProfileSummary)) {
      antidetect.forgetProbe();
      return {
        ok: false,
        code: "PROFILE_LIST_UNAVAILABLE",
        stage: "profile-list",
        message: "MKT Browser could not read its browser profile list. Keep it open, then check again.",
      };
    }
    if (!isFingerprintOptions(fingerprintOptions)) {
      antidetect.forgetProbe();
      return {
        ok: false,
        code: "FINGERPRINT_OPTIONS_UNAVAILABLE",
        stage: "fingerprint-options",
        message: "MKT Browser could not read browser profile options. Keep it open, then check again.",
      };
    }

    return {
      ok: true,
      profiles,
      fingerprintOptions,
      message:
        profiles.length === 0
          ? "MKT Browser is reachable, but this machine has no profiles."
          : `${profiles.length} profile trên máy này.`,
    };
  } catch {
    // An adapter that stops responding often means MKT Browser just stopped. Discard the cached
    // probe so the next `/health` request reports current state instead of stale state.
    antidetect.forgetProbe();
    return {
      ok: false,
      code: "PROFILE_READ_UNAVAILABLE",
      stage: "profile-list",
      message: "MKT Browser could not read browser profiles. Keep it open, then check again.",
    };
  }
}
