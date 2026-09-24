/**
 * `GET /profiles` — và cái đáng canh là **cách nó hỏng**, không phải cách nó chạy.
 *
 * Returning an empty array when MKT Browser is unreachable says *"this machine has no profiles"*,
 * which is not true and can send the operator toward creating duplicates. Preserve the same
 * fail-closed distinction used elsewhere: "not checked" is not "alive", and "unreachable" is not
 * "healthy".
 */
import { afterEach, describe, expect, it, vi } from "vitest";
import type { AntidetectAdapter } from "../../src/lib/antidetect/antidetect-browser-adapter";
import { AntidetectError } from "../../src/lib/antidetect/antidetect-browser-adapter";
import { MktBrowserAdapter } from "../../src/lib/antidetect/mkt-browser-adapter";
import {
  McpReadTimeoutError,
  McpToolError,
} from "../../src/lib/antidetect/mkt-browser-mcp-client";
import type { RelayConfig } from "./relay-config";
import { handleProfilesRequest } from "./handle-profiles";
import {
  AntidetectNotConfiguredError,
  AntidetectRuntimeNotReadyError,
  RELAY_READINESS_BUDGET_MS,
  RelayAntidetect,
} from "./relay-antidetect";
import type { ResolvedMktBrowserToken } from "./mkt-browser-token-discovery";

afterEach(() => {
  vi.useRealTimers();
  vi.restoreAllMocks();
});

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
    requireOperationalAdapter: async () => {
      if (runtimeError) throw runtimeError;
      if (!adapter) throw new AntidetectNotConfiguredError();
      return adapter;
    },
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

  it("uses the adapter bound to readiness rather than resolving a later token", async () => {
    const boundAdapter = fakeAdapter();
    const laterAdapter = fakeAdapter({
      listProfiles: async () => {
        throw new Error("later token must not be used");
      },
    });
    const getAdapter = vi.fn(() => laterAdapter);
    const antidetect = {
      requireOperationalAdapter: async () => boundAdapter,
      getAdapter,
      forgetProbe: vi.fn(),
    } as unknown as RelayAntidetect;

    await expect(handleProfilesRequest(antidetect)).resolves.toMatchObject({ ok: true });
    expect(getAdapter).not.toHaveBeenCalled();
  });
});

describe("cách nó hỏng", () => {
  it("keeps a bounded runtime timeout distinct from an offline Browser through /profiles", async () => {
    vi.useFakeTimers();
    const listProfiles = vi.spyOn(MktBrowserAdapter.prototype, "listProfiles");
    vi.spyOn(MktBrowserAdapter.prototype, "observeRuntimeInfo")
      .mockImplementation(async () => new Promise<never>(() => {}));
    const config: RelayConfig = {
      deviceId: "device-abc",
      serverPublicKey: "a".repeat(64),
      vaultKeyOperator: "b".repeat(64),
      webOrigin: "https://mkttool.example.com",
    };
    const token: ResolvedMktBrowserToken = {
      value: "c".repeat(64),
      source: "mkt-browser-data",
    };
    const antidetect = new RelayAntidetect(config, () => token);

    const result = handleProfilesRequest(antidetect);
    await vi.advanceTimersByTimeAsync(RELAY_READINESS_BUDGET_MS);

    await expect(result).resolves.toMatchObject({
      ok: false,
      code: "RUNTIME_TIMEOUT",
      stage: "browser-health",
    });
    expect(listProfiles).not.toHaveBeenCalled();
  });

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

  it("keeps an adapter read deadline distinct from an ordinary profile-list failure", async () => {
    const { antidetect, forgotten } = fakeAntidetect(
      fakeAdapter({
        listProfiles: async () => {
          throw new McpReadTimeoutError();
        },
      }),
    );

    await expect(handleProfilesRequest(antidetect)).resolves.toMatchObject({
      ok: false,
      code: "PROFILE_READ_TIMEOUT",
      stage: "profile-list",
    });
    expect(forgotten).toHaveLength(1);
  });

  it("cancels a stalled options read as soon as the profile list fails", async () => {
    let optionsSignal: AbortSignal | undefined;
    let optionsAborted = false;
    const { antidetect, forgotten } = fakeAntidetect(
      fakeAdapter({
        listProfiles: async () => {
          throw new AntidetectError("list failed", "MKT Browser");
        },
        fingerprintOptions: async (options) => new Promise((_, reject) => {
          optionsSignal = options?.signal;
          options?.signal?.addEventListener("abort", () => {
            optionsAborted = true;
            reject(new DOMException("Read cancelled", "AbortError"));
          }, { once: true });
        }),
      }),
    );

    await expect(handleProfilesRequest(antidetect)).resolves.toMatchObject({
      ok: false,
      code: "PROFILE_LIST_UNAVAILABLE",
      stage: "profile-list",
    });
    expect(optionsSignal?.aborted).toBe(true);
    expect(optionsAborted).toBe(true);
    expect(forgotten).toHaveLength(1);
  });

  it("rejects a malformed profile list before stalled options can become a timeout", async () => {
    vi.useFakeTimers();
    let optionsSignal: AbortSignal | undefined;
    let optionsAborted = false;
    const { antidetect, forgotten } = fakeAntidetect(
      fakeAdapter({
        listProfiles: async () => [{ id: "profile-only" }] as never,
        fingerprintOptions: async (options) => new Promise((_, reject) => {
          optionsSignal = options?.signal;
          options?.signal?.addEventListener("abort", () => {
            optionsAborted = true;
            reject(new DOMException("Read cancelled", "AbortError"));
          }, { once: true });
        }),
      }),
    );

    const result = handleProfilesRequest(antidetect);
    await vi.advanceTimersByTimeAsync(RELAY_READINESS_BUDGET_MS);

    await expect(result).resolves.toMatchObject({
      ok: false,
      code: "PROFILE_LIST_UNAVAILABLE",
      stage: "profile-list",
    });
    expect(optionsSignal?.aborted).toBe(true);
    expect(optionsAborted).toBe(true);
    expect(forgotten).toHaveLength(1);
  });

  it("rejects malformed options before a stalled profile list can become a timeout", async () => {
    vi.useFakeTimers();
    let listSignal: AbortSignal | undefined;
    let listAborted = false;
    const { antidetect, forgotten } = fakeAntidetect(
      fakeAdapter({
        listProfiles: async (options) => new Promise((_, reject) => {
          listSignal = options?.signal;
          options?.signal?.addEventListener("abort", () => {
            listAborted = true;
            reject(new DOMException("Read cancelled", "AbortError"));
          }, { once: true });
        }),
        fingerprintOptions: async () => ({ devices: [], locales: [{ id: "en-US" }] }) as never,
      }),
    );

    const result = handleProfilesRequest(antidetect);
    await vi.advanceTimersByTimeAsync(RELAY_READINESS_BUDGET_MS);

    await expect(result).resolves.toMatchObject({
      ok: false,
      code: "FINGERPRINT_OPTIONS_UNAVAILABLE",
      stage: "fingerprint-options",
    });
    expect(listSignal?.aborted).toBe(true);
    expect(listAborted).toBe(true);
    expect(forgotten).toHaveLength(1);
  });

  it("uses the entry deadline even when an adapter ignores cancellation", async () => {
    vi.useFakeTimers();
    const signals: AbortSignal[] = [];
    const never = () => new Promise<never>(() => {});
    const { antidetect, forgotten } = fakeAntidetect(
      fakeAdapter({
        listProfiles: async (options) => {
          if (options?.signal) signals.push(options.signal);
          return never();
        },
        fingerprintOptions: async (options) => {
          if (options?.signal) signals.push(options.signal);
          return never();
        },
      }),
    );

    const result = handleProfilesRequest(antidetect);
    await vi.advanceTimersByTimeAsync(RELAY_READINESS_BUDGET_MS);

    await expect(result).resolves.toMatchObject({
      ok: false,
      code: "PROFILE_READ_TIMEOUT",
      stage: "profile-read",
    });
    expect(signals).toHaveLength(2);
    expect(signals.every((signal) => signal.aborted)).toBe(true);
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

  it.each([
    ["profile-list", "listProfiles", "ENGINE_UNAVAILABLE"],
    ["fingerprint-options", "fingerprintOptions", "FORBIDDEN"],
  ] as const)("keeps an allowlisted %s tool code without echoing the provider error", async (stage, method, code) => {
    const leaked = "https://relay.example/profiles?token=relay-private at C:\\Users\\operator\\secret";
    const { antidetect } = fakeAntidetect(
      fakeAdapter({
        [method]: async () => {
          throw new McpToolError(leaked, code);
        },
      }),
    );

    const result = await handleProfilesRequest(antidetect);
    expect(result).toMatchObject({ ok: false, code, stage });
    expect(JSON.stringify(result)).not.toMatch(/relay-private|C:\\Users|relay\.example/i);
  });

  it("names fingerprint options when the list completed before the entry deadline", async () => {
    vi.useFakeTimers();
    const { antidetect } = fakeAntidetect(
      fakeAdapter({
        listProfiles: async () => [],
        fingerprintOptions: async () => new Promise<never>(() => {}),
      }),
    );

    const result = handleProfilesRequest(antidetect);
    await vi.advanceTimersByTimeAsync(RELAY_READINESS_BUDGET_MS);

    await expect(result).resolves.toMatchObject({
      ok: false,
      code: "PROFILE_READ_TIMEOUT",
      stage: "fingerprint-options",
    });
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
