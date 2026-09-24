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
  type AntidetectReadOptions,
  AntidetectError,
  isAntidetectProfileSummary,
  isFingerprintOptions,
} from "../../src/lib/antidetect/antidetect-browser-adapter";
import { isMktBrowserErrorCode } from "../../src/lib/antidetect/mkt-browser-contract";
import {
  McpReadTimeoutError,
  McpToolError,
} from "../../src/lib/antidetect/mkt-browser-mcp-client";
import {
  AntidetectNotConfiguredError,
  AntidetectRuntimeNotReadyError,
  RELAY_READINESS_BUDGET_MS,
  type RelayAntidetect,
} from "./relay-antidetect";
import type { RelayResponseBody } from "./relay-http-server";

type ProfileReadStage = "profile-list" | "fingerprint-options";
type ProfileReadFailureStage = ProfileReadStage | "profile-read";

type ProfileReadResult =
  | { ok: true; stage: ProfileReadStage; value: unknown }
  | { ok: false; stage: ProfileReadStage; code?: string; timedOut?: true };

function safeProfileReadCode(error: unknown): string | undefined {
  const code = error instanceof McpToolError || error instanceof AntidetectError
    ? error.code
    : undefined;
  return isMktBrowserErrorCode(code) ? code : undefined;
}

function observeProfileRead(
  stage: ProfileReadStage,
  read: () => Promise<unknown>,
): Promise<ProfileReadResult> {
  // Convert synchronous adapter defects and rejected MCP reads into a safe stage result.
  return Promise.resolve().then(read).then(
    (value) => ({ ok: true, stage, value }),
    (error: unknown) => {
      if (error instanceof McpReadTimeoutError) {
        return { ok: false, stage, timedOut: true as const };
      }
      const code = safeProfileReadCode(error);
      return { ok: false, stage, ...(code ? { code } : {}) };
    },
  );
}

function failedProfileRead(stage: ProfileReadStage, code?: string): RelayResponseBody {
  if (stage === "fingerprint-options") {
    return {
      ok: false,
      code: code ?? "FINGERPRINT_OPTIONS_UNAVAILABLE",
      stage,
      message: "MKT Browser could not read browser profile options. Keep it open, then check again.",
    };
  }

  return {
    ok: false,
    code: code ?? "PROFILE_LIST_UNAVAILABLE",
    stage,
    message: "MKT Browser could not read its browser profile list. Keep it open, then check again.",
  };
}

function timedOutProfileRead(stage: ProfileReadFailureStage): RelayResponseBody {
  return {
    ok: false,
    code: "PROFILE_READ_TIMEOUT",
    stage,
    message: "MKT Browser did not finish reading browser profiles in time. Keep it open, then check again.",
  };
}

function invalidProfileReadStage(
  result: Extract<ProfileReadResult, { ok: true }>,
): ProfileReadStage | undefined {
  if (result.stage === "profile-list") {
    return Array.isArray(result.value) && result.value.every(isAntidetectProfileSummary)
      ? undefined
      : result.stage;
  }

  return isFingerprintOptions(result.value) ? undefined : result.stage;
}

export async function handleProfilesRequest(
  antidetect: RelayAntidetect,
): Promise<RelayResponseBody> {
  const deadline = Date.now() + RELAY_READINESS_BUDGET_MS;
  const remainingBudget = () => Math.max(0, deadline - Date.now());
  let adapter;
  try {
    adapter = await antidetect.requireOperationalAdapter(remainingBudget());
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

  if (remainingBudget() === 0) {
    antidetect.forgetProbe();
    return {
      ok: false,
      code: "BROWSER_HEALTH_UNAVAILABLE",
      stage: "browser-health",
      message: "MKT Browser readiness could not be checked. Keep it open, then check again.",
    };
  }

  const controller = new AbortController();
  let deadlineTimer: ReturnType<typeof setTimeout> | undefined;
  try {
    // Hai thứ trong một lượt gọi: giao diện tạo/chọn profile luôn cần cả danh sách lẫn danh mục,
    // và tách đôi chỉ để "sạch khái niệm" thì đổi lấy một vòng gọi nữa cho mỗi lần mở trang.
    const options: AntidetectReadOptions = { deadline, signal: controller.signal };
    const profileList = observeProfileRead("profile-list", () => adapter.listProfiles(options));
    const fingerprintOptionsRead = observeProfileRead(
      "fingerprint-options",
      () => adapter.fingerprintOptions(options),
    );
    const deadlineReached = new Promise<{ deadline: true }>((resolve) => {
      deadlineTimer = setTimeout(() => {
        controller.abort();
        resolve({ deadline: true });
      }, remainingBudget());
    });

    const first = await Promise.race([profileList, fingerprintOptionsRead, deadlineReached]);
    if ("deadline" in first) {
      antidetect.forgetProbe();
      return timedOutProfileRead("profile-read");
    }
    if (!first.ok) {
      controller.abort();
      antidetect.forgetProbe();
      if (first.timedOut) return timedOutProfileRead(first.stage);
      return failedProfileRead(first.stage, first.code);
    }

    const firstInvalidStage = invalidProfileReadStage(first);
    if (firstInvalidStage) {
      controller.abort();
      antidetect.forgetProbe();
      return failedProfileRead(firstInvalidStage);
    }

    const pendingStage: ProfileReadStage =
      first.stage === "profile-list" ? "fingerprint-options" : "profile-list";
    const pendingRead = first.stage === "profile-list" ? fingerprintOptionsRead : profileList;
    const second = await Promise.race([pendingRead, deadlineReached]);
    if ("deadline" in second) {
      antidetect.forgetProbe();
      return timedOutProfileRead(pendingStage);
    }
    if (!second.ok) {
      controller.abort();
      antidetect.forgetProbe();
      if (second.timedOut) return timedOutProfileRead(second.stage);
      return failedProfileRead(second.stage, second.code);
    }

    const secondInvalidStage = invalidProfileReadStage(second);
    if (secondInvalidStage) {
      controller.abort();
      antidetect.forgetProbe();
      return failedProfileRead(secondInvalidStage);
    }

    const profiles = first.stage === "profile-list" ? first.value : second.value;
    const fingerprintOptions =
      first.stage === "fingerprint-options" ? first.value : second.value;
    if (!Array.isArray(profiles) || !profiles.every(isAntidetectProfileSummary)) {
      antidetect.forgetProbe();
      return failedProfileRead("profile-list");
    }
    if (!isFingerprintOptions(fingerprintOptions)) {
      antidetect.forgetProbe();
      return failedProfileRead("fingerprint-options");
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
      stage: "profile-read",
      message: "MKT Browser could not read browser profiles. Keep it open, then check again.",
    };
  } finally {
    if (deadlineTimer) clearTimeout(deadlineTimer);
    controller.abort();
  }
}
