/**
 * `guarded-entry-points.test.ts` chỉ kiểm **hình dạng mã nguồn** — mọi route có được bọc không.
 * Nó không chứng minh cái bọc thật sự chặn ai. Với một wrapper vừa **nới** phạm vi (cho phép một
 * chìa máy đi thẳng), chỗ trống đó là chỗ đáng ngại nhất, nên ba nhánh dưới đây đo hành vi thật.
 *
 * Phải mock `require-actor` vì import thật kéo theo `auth-server`, mà file đó đòi có sẵn
 * `GOOGLE_CLIENT_ID` mới nạp được — cùng lý do đã khiến `entry-point-guard-names.ts` phải tách ra
 * thành một file không import gì.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";

class FakeAuthorizationError extends Error {
  constructor(
    message: string,
    readonly needsLogin: boolean,
  ) {
    super(message);
    this.name = "AuthorizationError";
  }
}

const requireActor = vi.fn();

vi.mock("./require-actor", () => ({
  AuthorizationError: FakeAuthorizationError,
  requireActor: () => requireActor(),
  requireAdmin: () => requireActor(),
}));

const { machineOrGuardedRoute, machineRoute } = await import("./guarded-route");

const ACTOR = { userId: "u1", email: "a@b.test", role: "OPERATOR" as const };

function route(isMachineCaller: (request: Request) => boolean) {
  return machineOrGuardedRoute(isMachineCaller, async () => new Response("payload"));
}

beforeEach(() => {
  requireActor.mockReset();
});

describe("machineOrGuardedRoute", () => {
  it("serves a machine caller without ever asking who they are", async () => {
    const response = await route(() => true)(new Request("https://x.test/"));

    expect(response.status).toBe(200);
    expect(await response.text()).toBe("payload");
    // Đây mới là điều đáng kiểm: chìa máy đi thẳng, KHÔNG dựng ra một phiên nào.
    expect(requireActor).not.toHaveBeenCalled();
  });

  it("falls back to the login check when the machine key is absent or wrong", async () => {
    requireActor.mockRejectedValue(new FakeAuthorizationError("not signed in", true));

    const response = await route(() => false)(new Request("https://x.test/"));

    expect(response.status).toBe(401);
    expect(requireActor).toHaveBeenCalledOnce();
  });

  it("serves a signed-in person when the machine key is absent", async () => {
    requireActor.mockResolvedValue(ACTOR);

    const response = await route(() => false)(new Request("https://x.test/"));

    expect(response.status).toBe(200);
    expect(await response.text()).toBe("payload");
  });

  it("answers a wrong key exactly as it answers no key, so it is not a guessing oracle", async () => {
    requireActor.mockRejectedValue(new FakeAuthorizationError("not signed in", true));

    const wrongKey = await route(() => false)(new Request("https://x.test/"));
    const noKey = await route(() => false)(new Request("https://x.test/"));

    expect(wrongKey.status).toBe(noKey.status);
    expect(await wrongKey.text()).toBe(await noKey.text());
  });

  it("reports 403 rather than 401 when the caller is known but not allowed", async () => {
    requireActor.mockRejectedValue(new FakeAuthorizationError("not allowed", false));

    expect((await route(() => false)(new Request("https://x.test/"))).status).toBe(403);
  });

  it("passes the request and the remaining route arguments through untouched", async () => {
    const seen: unknown[] = [];
    const handler = machineOrGuardedRoute(
      () => true,
      async (request: Request, context: { params: Promise<{ version: string }> }) => {
        seen.push(request.url, await context.params);
        return new Response("ok");
      },
    );

    await handler(new Request("https://x.test/v8"), { params: Promise.resolve({ version: "v8" }) });

    expect(seen).toEqual(["https://x.test/v8", { version: "v8" }]);
  });
});

describe("machineRoute", () => {
  it("serves only an explicitly authorized machine caller", async () => {
    const handler = machineRoute(() => true, async () => new Response("artifact"));

    const response = await handler(new Request("https://x.test/artifact"));

    expect(response.status).toBe(200);
    expect(await response.text()).toBe("artifact");
    expect(requireActor).not.toHaveBeenCalled();
  });

  it("rejects a missing or invalid machine credential without a user-session fallback", async () => {
    requireActor.mockResolvedValue(ACTOR);
    const handler = machineRoute(() => false, async () => new Response("artifact"));

    const response = await handler(new Request("https://x.test/artifact"));

    expect(response.status).toBe(401);
    expect(requireActor).not.toHaveBeenCalled();
  });
});
