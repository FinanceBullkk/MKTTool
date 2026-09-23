/**
 * `GET /profiles` — và cái đáng canh là **cách nó hỏng**, không phải cách nó chạy.
 *
 * Returning an empty array when MKT Browser is unreachable says *"this machine has no profiles"*,
 * which is not true and can send the operator toward creating duplicates. Preserve the same
 * fail-closed distinction used elsewhere: "not checked" is not "alive", and "unreachable" is not
 * "healthy".
 */
import { describe, expect, it } from "vitest";
import type { AntidetectAdapter } from "../../src/lib/antidetect/antidetect-browser-adapter";
import { AntidetectError } from "../../src/lib/antidetect/antidetect-browser-adapter";
import { handleProfilesRequest } from "./handle-profiles";
import {
  AntidetectNotConfiguredError,
  AntidetectRuntimeNotReadyError,
  type RelayAntidetect,
} from "./relay-antidetect";

const OPTIONS = {
  devices: [{ family: "windows-laptop-amd", label: "Windows laptop", screens: [{ width: 1680, height: 1050 }] }],
  locales: [{ id: "en-US", label: "English (US)", country: "us", timezones: ["America/Denver"] }],
};

function fakeAdapter(overrides: Partial<AntidetectAdapter> = {}): AntidetectAdapter {
  return {
    providerName: "Giả",
    isAvailable: async () => true,
    applyProxy: async () => {},
    launchProfile: async (profileId: string) => ({ profileId }),
    closeProfile: async () => {},
    isRunning: async () => true,
    listProfiles: async () => [{ id: "p1", name: "REDDIT — anna", proxyCountry: "us" }],
    fingerprintOptions: async () => OPTIONS,
    createProfile: async () => ({ profileId: "p-moi" }),
    ...overrides,
  };
}

function fakeAntidetect(adapter: AntidetectAdapter | null, runtimeError?: Error) {
  const forgotten: boolean[] = [];
  const antidetect = {
    getAdapter: () => {
      if (!adapter) throw new AntidetectNotConfiguredError();
      return adapter;
    },
    isReady: async () => adapter !== null,
    requireOperationalRuntime: async () => {
      if (runtimeError) throw runtimeError;
      return {} as never;
    },
    forgetProbe: () => forgotten.push(true),
  } as unknown as RelayAntidetect;
  return { antidetect, forgotten };
}

describe("đường thuận", () => {
  it("trả cả danh sách lẫn danh mục trong một lượt gọi", async () => {
    const { antidetect } = fakeAntidetect(fakeAdapter());

    const result = await handleProfilesRequest(antidetect);

    expect(result.ok).toBe(true);
    expect(result.profiles).toHaveLength(1);
    // Giao diện luôn cần cả hai — tách đôi chỉ để "sạch khái niệm" là thêm một vòng gọi mỗi lần
    // mở trang, đổi lấy không gì cả.
    expect(result.fingerprintOptions).toEqual(OPTIONS);
  });

  it("makes clear that MKT Browser is reachable when the profile list is empty", async () => {
    const { antidetect } = fakeAntidetect(fakeAdapter({ listProfiles: async () => [] }));

    const result = await handleProfilesRequest(antidetect);

    expect(result.ok).toBe(true);
    expect(result.message).toContain("is reachable");
    expect(result.profiles).toEqual([]);
  });
});

describe("cách nó hỏng", () => {
  it("returns a stable configuration code and stage instead of an empty array", async () => {
    const { antidetect } = fakeAntidetect(null);

    const result = await handleProfilesRequest(antidetect);

    expect(result.ok).toBe(false);
    expect(result.profiles).toBeUndefined();
    expect(result).toMatchObject({
      code: "BROWSER_NOT_CONFIGURED",
      stage: "not-configured",
      message: "Open MKT Browser, enable MCP, then check again.",
    });
  });

  it.each([
    "INSTALL_READINESS_CHECKING",
    "INSTALL_READINESS_UNAVAILABLE",
    "INSTALL_READINESS_FAILED",
  ] as const)("keeps the v6 readiness code at the browser-health boundary: %s", async (code) => {
    let listCalls = 0;
    const { antidetect } = fakeAntidetect(
      fakeAdapter({
        listProfiles: async () => {
          listCalls += 1;
          return [];
        },
      }),
      new AntidetectRuntimeNotReadyError("token=private-value", code),
    );

    const result = await handleProfilesRequest(antidetect);

    expect(result).toMatchObject({ ok: false, code, stage: "browser-health" });
    expect(JSON.stringify(result)).not.toContain("private-value");
    expect(listCalls).toBe(0);
  });

  it("reports failure and forgets the cached probe when MKT Browser stops", async () => {
    const { antidetect, forgotten } = fakeAntidetect(
      fakeAdapter({
        listProfiles: async () => {
          throw new AntidetectError("Could not connect to MKT Browser.", "MKT Browser");
        },
      }),
    );

    const result = await handleProfilesRequest(antidetect);

    expect(result.ok).toBe(false);
    expect(result).toMatchObject({
      code: "PROFILE_LIST_UNAVAILABLE",
      stage: "profile-list",
    });
    // Không quên thì `/health` còn trả lời bằng tin cũ tới 30 giây — đủ lâu để người dùng bấm
    // tiếp một nút nữa rồi nhận một câu lỗi khác hẳn cho cùng một nguyên nhân.
    expect(forgotten).toHaveLength(1);
  });

  it("danh mục hỏng cũng là hỏng cả lượt, không trả danh sách nửa vời", async () => {
    const { antidetect } = fakeAntidetect(
      fakeAdapter({
        fingerprintOptions: async () => {
          throw new AntidetectError("Unknown tool.", "MKT Browser");
        },
      }),
    );

    const result = await handleProfilesRequest(antidetect);

    expect(result).toMatchObject({
      ok: false,
      code: "FINGERPRINT_OPTIONS_UNAVAILABLE",
      stage: "fingerprint-options",
    });
    expect(result.profiles).toBeUndefined();
  });

  it("rejects a malformed profile entry instead of presenting an empty inventory", async () => {
    const { antidetect } = fakeAntidetect(
      fakeAdapter({
        listProfiles: async () => [{ id: "profile-only" }] as never,
      }),
    );

    await expect(handleProfilesRequest(antidetect)).resolves.toMatchObject({
      ok: false,
      code: "PROFILE_LIST_UNAVAILABLE",
      stage: "profile-list",
    });
  });

  it("rejects malformed fingerprint options instead of presenting a usable setup form", async () => {
    const { antidetect } = fakeAntidetect(
      fakeAdapter({
        fingerprintOptions: async () => ({ devices: [], locales: [{ id: "en-US" }] }) as never,
      }),
    );

    await expect(handleProfilesRequest(antidetect)).resolves.toMatchObject({
      ok: false,
      code: "FINGERPRINT_OPTIONS_UNAVAILABLE",
      stage: "fingerprint-options",
    });
  });

  it("never returns proxy, token, URL, or local-path text from a rejected inventory read", async () => {
    const leaked = "https://relay.example/profiles?token=relay-private at 203.0.113.10:1080 C:\\Users\\operator\\secret";
    const { antidetect } = fakeAntidetect(
      fakeAdapter({ listProfiles: async () => { throw new Error(leaked); } }),
    );

    const result = await handleProfilesRequest(antidetect);
    const serialized = JSON.stringify(result);

    expect(result).toMatchObject({ code: "PROFILE_LIST_UNAVAILABLE", stage: "profile-list" });
    expect(serialized).not.toMatch(/relay-private|203\.0\.113\.10|1080|C:\\Users|relay\.example/i);
  });
});

describe("không ném ra ngoài", () => {
  /** Chỗ gọi là một nút bấm trên web; một promise reject ở đây chỉ làm nút chết lặng. */
  it("lỗi lạ vẫn thành ok=false chứ không ném", async () => {
    const { antidetect } = fakeAntidetect(
      fakeAdapter({
        listProfiles: async () => {
          throw new Error("lỗi không ai lường");
        },
      }),
    );

    await expect(handleProfilesRequest(antidetect)).resolves.toMatchObject({ ok: false });
  });
});
