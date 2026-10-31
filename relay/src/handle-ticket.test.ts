/**
 * Vòng đời một tấm vé, đo **hai đầu thật**: máy chủ phát bằng `issueTicket`, cầu nối nhận bằng
 * `handleTicketRequest`.
 *
 * Test này cố ý không giả lập bộ phát vé. Giá trị duy nhất của nó là chứng minh hai chương
 * trình viết rời hiểu nhau — mà một bản giả lập thì luôn hiểu chính nó.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { AntidetectAdapter } from "../../src/lib/antidetect/antidetect-browser-adapter";
import { AntidetectError } from "../../src/lib/antidetect/antidetect-browser-adapter";
import { generateRelayDeviceKeyPair } from "../../src/lib/tickets/relay-device-key";
import { issueTicket } from "../../src/lib/tickets/ticket-issuer";
import {
  SERVER_SIGNING_KEY_ENV,
  resetServerSigningKeysCache,
} from "../../src/lib/tickets/server-signing-key";
import { TICKET_KINDS, TICKET_LIFETIME_MS } from "../../src/lib/tickets/ticket-types";
import { handleTicketRequest } from "./handle-ticket";
import { relayPrivateKeyToKeyObject } from "../../src/lib/tickets/relay-device-key";
import { buildRelayIdentity } from "./relay-identity";
import type { RelayAntidetect } from "./relay-antidetect";
import { AntidetectNotConfiguredError } from "./relay-antidetect";
import { publicKeyToHex, signingKeysFromSeed } from "../../src/lib/tickets/server-signing-key";

// Hạt giống thật, cố định: `parseSigningSeed` từ chối khuôn mẫu điền tạm (FINDING C2), nên
// một chuỗi kiểu "11".repeat(32) không còn dựng được khóa. Cố định chứ không ngẫu nhiên vì test
// dưới đây suy ra khóa công khai kỳ vọng từ chính nó.
const SERVER_SEED = "e40fcc2d2171ef9af68a69d386aa8f34be17646f3f4eda88ce4e505642e99b39";
const DEVICE_ID = "device-abc";
const RELAY_HOME = "C:\\MKTTool\\relay-ticket-tests";

const PROXY = {
  protocol: "http" as const,
  host: "1.2.3.4",
  port: 8080,
  username: "u",
  password: "mat-khau-proxy",
};

function launchPayload() {
  return {
    kind: TICKET_KINDS.LAUNCH_PROFILE,
    accountId: "acc-1",
    antidetectProfileId: "profile-1",
    proxyLabel: "Webshare #3",
    proxy: PROXY,
  } as const;
}

function createPayload() {
  return {
    kind: TICKET_KINDS.CREATE_PROFILE,
    accountId: "acc-1",
    requestId: "create-profile:acc-1",
    profileName: "REDDIT - anna",
    proxy: PROXY,
    fingerprint: {
      device: "windows-laptop-amd",
      localeId: "en-US",
      timezone: "America/Denver",
      screen: { width: 1680, height: 1050 },
    },
    seed: "mkttool-acc-1",
  } as const;
}

function operationIdOf(ticket: string): string {
  const envelope = JSON.parse(Buffer.from(ticket.split(".")[0]!, "base64url").toString("utf8")) as {
    jti: string;
  };
  return envelope.jti;
}

/** Adapter giả, ghi lại thứ tự các lời gọi — thứ tự chính là thứ luật "đẩy hỏng thì không mở" nói. */
function fakeAdapter(overrides: Partial<AntidetectAdapter> = {}) {
  const calls: string[] = [];
  const adapter: AntidetectAdapter = {
    providerName: "Giả",
    isAvailable: async () => true,
    applyProxy: async () => {
      calls.push("applyProxy");
    },
    launchProfile: async (profileId: string) => {
      calls.push("launchProfile");
      return { profileId };
    },
    closeProfile: async () => {},
    isRunning: async () => true,
    listProfiles: async () => [],
    fingerprintOptions: async () => ({ devices: [], locales: [] }),
    createProfile: async () => {
      calls.push("createProfile");
      return { profileId: "profile-vua-tao" };
    },
    ...overrides,
  };
  return { adapter, calls };
}

function fakeAntidetect(adapter: AntidetectAdapter | null): RelayAntidetect {
  return {
    getAdapter: () => {
      if (!adapter) throw new AntidetectNotConfiguredError();
      return adapter;
    },
    isReady: async () => adapter !== null,
    requireOperationalAdapter: async () => {
      if (!adapter) throw new AntidetectNotConfiguredError();
      return adapter;
    },
    requireOperationalRuntime: async () => ({}) as never,
    forgetProbe: () => {},
  } as unknown as RelayAntidetect;
}

/** Danh tính của cầu nối, kèm khóa công khai để máy chủ phát vé cho đúng máy này. */
function relaySetup(deviceId = DEVICE_ID) {
  const keys = generateRelayDeviceKeyPair();
  const serverPublicKey = publicKeyToHex(
    signingKeysFromSeed(Buffer.from(SERVER_SEED, "hex")).publicKey,
  );

  const identity = buildRelayIdentity(
    {
      deviceId,
      serverPublicKey,
      vaultKeyOperator: "aa".repeat(32),
      webOrigin: "https://web.example",
    },
    relayPrivateKeyToKeyObject(keys.privateKeyHex),
  );

  return { identity, recipient: { deviceId, publicKey: keys.publicKeyHex } };
}

function requestBody(ticket: string): string {
  return JSON.stringify({ ticket });
}

beforeEach(() => {
  process.env[SERVER_SIGNING_KEY_ENV] = SERVER_SEED;
  resetServerSigningKeysCache();
});

afterEach(() => {
  delete process.env[SERVER_SIGNING_KEY_ENV];
  resetServerSigningKeysCache();
  vi.useRealTimers();
});

describe("handleTicketRequest — vé mở profile", () => {
  it("vé hợp lệ: đẩy proxy RỒI mở profile, đúng thứ tự đó", async () => {
    const { identity, recipient } = relaySetup();
    const { adapter, calls } = fakeAdapter();

    const result = await handleTicketRequest(requestBody(issueTicket(launchPayload(), recipient)), {
      identity,
      antidetect: fakeAntidetect(adapter),
      home: RELAY_HOME,
      notConfiguredMessage: "chưa cấu hình",
    });

    expect(result.ok).toBe(true);
    expect(calls).toEqual(["applyProxy", "launchProfile"]);
    // Nhắc nhãn proxy: người bấm nút không nhìn thấy gì khác để đối chiếu đúng nick đúng IP.
    expect(result.message).toContain("Webshare #3");
  });

  it("prefers one atomic launch call when the provider supports it", async () => {
    const { identity, recipient } = relaySetup();
    const { adapter, calls } = fakeAdapter({
      launchProfileWithProxy: async (profileId, proxy) => {
        calls.push("launchProfileWithProxy");
        expect(profileId).toBe("profile-1");
        expect(proxy).toEqual(PROXY);
        return { profileId };
      },
    });

    const result = await handleTicketRequest(requestBody(issueTicket(launchPayload(), recipient)), {
      identity,
      antidetect: fakeAntidetect(adapter),
      home: RELAY_HOME,
      notConfiguredMessage: "not configured",
    });

    expect(result.ok).toBe(true);
    expect(calls).toEqual(["launchProfileWithProxy"]);
  });

  it("đẩy proxy hỏng thì KHÔNG mở profile — mở ra là nick chạy bằng IP nhà", async () => {
    const { identity, recipient } = relaySetup();
    const { adapter, calls } = fakeAdapter({
      applyProxy: async () => {
        throw new AntidetectError("MKT Browser rejected the proxy configuration", "Test");
      },
    });

    const result = await handleTicketRequest(requestBody(issueTicket(launchPayload(), recipient)), {
      identity,
      antidetect: fakeAntidetect(adapter),
      home: RELAY_HOME,
      notConfiguredMessage: "chưa cấu hình",
    });

    expect(result.ok).toBe(false);
    expect(calls).not.toContain("launchProfile");
    expect(result.message).toContain("NOT opened");
  });

  it("không để lộ mật khẩu proxy ra câu trả lời, kể cả khi hỏng", async () => {
    const { identity, recipient } = relaySetup();
    const { adapter } = fakeAdapter({
      launchProfile: async () => {
        throw new Error(`mở hỏng với proxy ${PROXY.host}`);
      },
    });

    const result = await handleTicketRequest(requestBody(issueTicket(launchPayload(), recipient)), {
      identity,
      antidetect: fakeAntidetect(adapter),
      home: RELAY_HOME,
      notConfiguredMessage: "chưa cấu hình",
    });

    expect(JSON.stringify(result)).not.toContain(PROXY.password);
  });

  it("vé quá hạn bị từ chối kèm mã EXPIRED", async () => {
    const { identity, recipient } = relaySetup();
    const { adapter } = fakeAdapter();
    const issuedAt = Date.now();
    const ticket = issueTicket(launchPayload(), recipient, issuedAt);

    vi.useFakeTimers();
    vi.setSystemTime(issuedAt + TICKET_LIFETIME_MS + 1);

    const result = await handleTicketRequest(requestBody(ticket), {
      identity,
      antidetect: fakeAntidetect(adapter),
      home: RELAY_HOME,
      notConfiguredMessage: "chưa cấu hình",
    });

    expect(result.ok).toBe(false);
    expect(result.rejectionCode).toBe("EXPIRED");
  });

  it("vé dùng lần hai bị từ chối — sổ chống dùng lại nằm ở cầu nối", async () => {
    const { identity, recipient } = relaySetup();
    const { adapter } = fakeAdapter();
    const ticket = issueTicket(launchPayload(), recipient);
    const deps = {
      identity,
      antidetect: fakeAntidetect(adapter),
      home: RELAY_HOME,
      notConfiguredMessage: "x",
    };

    expect((await handleTicketRequest(requestBody(ticket), deps)).ok).toBe(true);

    const second = await handleTicketRequest(requestBody(ticket), deps);
    expect(second.ok).toBe(false);
    expect(second.rejectionCode).toBe("ALREADY_USED");
  });

  it("vé phát cho máy khác bị từ chối kèm mã WRONG_DEVICE", async () => {
    // Vé bọc cho khóa của máy này, nhưng bao ngoài khai một deviceId khác — đúng cảnh
    // "dán nhầm mã máy vào relay-config.json".
    const { identity, recipient } = relaySetup("device-abc");
    const { adapter } = fakeAdapter();
    const ticket = issueTicket(launchPayload(), { ...recipient, deviceId: "device-khac" });

    const result = await handleTicketRequest(requestBody(ticket), {
      identity,
      antidetect: fakeAntidetect(adapter),
      home: RELAY_HOME,
      notConfiguredMessage: "chưa cấu hình",
    });

    expect(result.rejectionCode).toBe("WRONG_DEVICE");
  });

  it("vé do khóa khác ký bị từ chối kèm mã BAD_SIGNATURE", async () => {
    const { identity, recipient } = relaySetup();
    const { adapter } = fakeAdapter();

    // Khác SERVER_SEED, và cũng phải là hạt giống thật — đây là vế "khóa không phải khóa đã cấu hình".
    process.env[SERVER_SIGNING_KEY_ENV] =
      "4d1e56d78393e0b8edaddd3ff251044540fabd9748d6baedb56e49e04c180060";
    resetServerSigningKeysCache();
    const forged = issueTicket(launchPayload(), recipient);

    const result = await handleTicketRequest(requestBody(forged), {
      identity,
      antidetect: fakeAntidetect(adapter),
      home: RELAY_HOME,
      notConfiguredMessage: "chưa cấu hình",
    });

    expect(result.rejectionCode).toBe("BAD_SIGNATURE");
  });

  it("vé bí mật KHÔNG đi đường này — nó đi qua tab riêng của cầu nối", async () => {
    // Nhận vé CREDENTIAL ở đây là mở một đường trả mật khẩu qua fetch, đúng thứ QĐ 3 chặn.
    const { identity, recipient } = relaySetup();
    const { adapter, calls } = fakeAdapter();
    const ticket = issueTicket(
      {
        kind: TICKET_KINDS.CREDENTIAL,
        accountId: "acc-1",
        field: "password",
        credentialCiphertext: "v1.aa.bb.cc",
      },
      recipient,
    );

    const result = await handleTicketRequest(requestBody(ticket), {
      identity,
      antidetect: fakeAntidetect(adapter),
      home: RELAY_HOME,
      notConfiguredMessage: "chưa cấu hình",
    });

    expect(result.ok).toBe(false);
    expect(calls).toEqual([]);
    expect(result.message).toContain("tab");
  });

  it("chưa cấu hình xong thì từ chối kèm câu chỉ sang trang trạng thái", async () => {
    const result = await handleTicketRequest(requestBody("bat-ky"), {
      identity: null,
      antidetect: fakeAntidetect(null),
      home: RELAY_HOME,
      notConfiguredMessage: "Cầu nối chưa cấu hình xong, mở http://127.0.0.1:47821",
    });

    expect(result.ok).toBe(false);
    expect(result.message).toContain("127.0.0.1:47821");
  });

  it("explains where to get a missing MKT Browser token instead of blaming the ticket", async () => {
    const { identity, recipient } = relaySetup();

    const result = await handleTicketRequest(requestBody(issueTicket(launchPayload(), recipient)), {
      identity,
      antidetect: fakeAntidetect(null),
      home: RELAY_HOME,
      notConfiguredMessage: "chưa cấu hình",
    });

    expect(result.ok).toBe(false);
    expect(result.message).toContain("enable MCP");
  });

  it("thân request không có trường ticket thì báo đúng chỗ thiếu", async () => {
    const { identity } = relaySetup();
    const { adapter } = fakeAdapter();

    const result = await handleTicketRequest("{}", {
      identity,
      antidetect: fakeAntidetect(adapter),
      home: RELAY_HOME,
      notConfiguredMessage: "chưa cấu hình",
    });

    expect(result.message).toContain("ticket");
  });
});

describe("handleTicketRequest - managed create correlation", () => {
  it("keeps ticket jti as operationId and the stable create requestId", async () => {
    const { identity, recipient } = relaySetup();
    let received: Record<string, unknown> | undefined;
    const { adapter } = fakeAdapter({
      createProfile: async (request) => {
        received = request as unknown as Record<string, unknown>;
        return { profileId: "profile-vua-tao" };
      },
    });
    const ticket = issueTicket(createPayload(), recipient);

    const result = await handleTicketRequest(requestBody(ticket), {
      identity,
      antidetect: fakeAntidetect(adapter),
      home: RELAY_HOME,
      notConfiguredMessage: "not configured",
    });

    expect(result.ok).toBe(true);
    expect(received).toMatchObject({
      externalRef: "acc-1",
      requestId: "create-profile:acc-1",
      operationId: operationIdOf(ticket),
    });
    expect(result.diagnostic).toMatchObject({
      operationId: operationIdOf(ticket),
      requestId: "create-profile:acc-1",
      stage: "complete",
    });
    expect(JSON.stringify(result.diagnostic)).not.toContain(PROXY.host);
    expect(JSON.stringify(result.diagnostic)).not.toContain(PROXY.password);
  });
});
