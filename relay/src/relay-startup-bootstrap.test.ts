import type { AddressInfo } from "node:net";
import { afterEach, describe, expect, it } from "vitest";
import { RELAY_PATHS } from "../../src/lib/relay/relay-endpoints";
import { RELAY_ROUTE_POLICIES } from "./relay-route-policy";
import { createRelayStartupServer } from "./relay-startup-bootstrap";

const WEB_ORIGIN = "https://mkttool.example.com";
const running: Array<() => void> = [];

async function startStartupServer(state: "pending" | "failed" = "pending"): Promise<string> {
  const server = createRelayStartupServer({
    startupState: () => state,
    allowedOrigin: () => WEB_ORIGIN,
  });
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  running.push(() => server.close());
  return `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
}

afterEach(() => {
  while (running.length > 0) running.pop()!();
});

describe("Relay startup bootstrap", () => {
  it("returns a no-key pending health body before any protected state is available", async () => {
    const base = await startStartupServer();
    const response = await fetch(`${base}${RELAY_PATHS.health}`, { headers: { origin: WEB_ORIGIN } });
    const body = await response.json();

    expect(response.status).toBe(400);
    expect(response.headers.get("access-control-allow-origin")).toBe(WEB_ORIGIN);
    expect(body).toMatchObject({
      ok: false,
      code: "RELAY_STARTUP_PENDING",
      startupState: "pending",
      configured: false,
      antidetectReady: false,
      browser: { ready: false, capabilities: [] },
    });
    expect(body).not.toHaveProperty("publicKey");
  });

  it("fails closed on every non-health route while startup is pending", async () => {
    const base = await startStartupServer();
    for (const [path, policy] of Object.entries(RELAY_ROUTE_POLICIES)) {
      const response = await fetch(`${base}${path}`, {
        method: policy.method,
        ...(policy.method === "POST" ? { body: "{}" } : {}),
      });
      const body = await response.json();

      expect(response.status, path).toBe(400);
      expect(body, path).toMatchObject({
        ok: false,
        code: "RELAY_STARTUP_PENDING",
        startupState: "pending",
      });
    }
  });

  it("retains a failed startup state without inventing a ready capability", async () => {
    const base = await startStartupServer("failed");
    const body = await (await fetch(`${base}${RELAY_PATHS.health}`)).json();

    expect(body).toMatchObject({
      ok: false,
      code: "RELAY_STARTUP_FAILED",
      startupState: "failed",
      configured: false,
      antidetectReady: false,
    });
    expect(body).not.toHaveProperty("publicKey");
  });
});
