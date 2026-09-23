import { afterEach, describe, expect, it, vi } from "vitest";
import { pingRelay } from "./relay-browser-client";

afterEach(() => vi.unstubAllGlobals());

describe("Relay browser client transport outcomes", () => {
  it.each([
    Object.assign(new Error("request deadline"), { name: "TimeoutError" }),
    Object.assign(new Error("request aborted"), { name: "AbortError" }),
  ])("classifies %s as an indeterminate timeout", async (error) => {
    vi.stubGlobal("fetch", vi.fn().mockRejectedValue(error));

    await expect(pingRelay()).resolves.toMatchObject({ status: "timeout" });
  });

  it("keeps a generic fetch TypeError indeterminate instead of claiming Relay is offline", async () => {
    vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new TypeError("network failed")));

    await expect(pingRelay()).resolves.toMatchObject({
      status: "indeterminate",
      message: expect.not.stringMatching(/could not be found|start the relay/i),
    });
  });

  it.each([
    Object.assign(new Error("response deadline"), { name: "TimeoutError" }),
    Object.assign(new Error("response aborted"), { name: "AbortError" }),
  ])("keeps a %s JSON body read as an indeterminate timeout", async (error) => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({
        status: 200,
        json: vi.fn().mockRejectedValue(error),
      }),
    );

    await expect(pingRelay()).resolves.toMatchObject({ status: "timeout" });
  });
});
