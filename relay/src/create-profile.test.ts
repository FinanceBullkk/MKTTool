import { describe, expect, it, vi } from "vitest";
import { TICKET_KINDS } from "../../src/lib/tickets/ticket-types";
import { createProfileFromTicket } from "./create-profile";
import {
  AntidetectRuntimeNotReadyError,
  type RelayAntidetect,
} from "./relay-antidetect";

function payload() {
  return {
    kind: TICKET_KINDS.CREATE_PROFILE,
    accountId: "account-1",
    requestId: "create-profile:account-1",
    profileName: "REDDIT - operator",
    proxy: {
      protocol: "http" as const,
      host: "203.0.113.10",
      port: 8080,
      username: "operator",
      password: "secret",
    },
    fingerprint: {
      device: "windows-laptop",
      localeId: "en-US",
      timezone: "America/Denver",
      screen: { width: 1280, height: 720 },
    },
    seed: "account-1",
  } as const;
}

describe("createProfileFromTicket install readiness", () => {
  it.each([
    ["checking", "INSTALL_READINESS_CHECKING"],
    ["unavailable", "INSTALL_READINESS_UNAVAILABLE"],
    ["failed", "INSTALL_READINESS_FAILED"],
  ] as const)("blocks %s before calling the Browser create tool", async (_state, code) => {
    const getAdapter = vi.fn();
    const antidetect = {
      requireOperationalRuntime: async () => {
        throw new AntidetectRuntimeNotReadyError("MKT Browser readiness is private", code);
      },
      getAdapter,
      forgetProbe: vi.fn(),
    } as unknown as RelayAntidetect;

    const result = await createProfileFromTicket(payload(), antidetect, "operation-1");

    expect(result).toMatchObject({
      ok: false,
      diagnostic: { stage: "browser-health", code },
    });
    expect(getAdapter).not.toHaveBeenCalled();
  });
});
