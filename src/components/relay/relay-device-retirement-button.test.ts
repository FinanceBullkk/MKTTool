import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import type { RelayOutcome } from "@/lib/relay/relay-browser-client";
import { RELAY_VERSION, type RelayHealth, type RelayReply } from "@/lib/relay/relay-endpoints";

const localPing = vi.hoisted(() => ({ current: null as unknown }));

vi.mock("@/components/relay/relay-local-identity-provider", () => ({
  useLocalRelayPing: () => localPing.current,
}));

import { RelayDeviceRetirementButton } from "./relay-device-retirement-button";

const props = {
  deviceId: "device-a",
  deviceName: "PC Hao",
  devicePublicKey: "public-key-a",
};

const health: RelayHealth & RelayReply = {
  ok: true,
  message: "Ready.",
  relayVersion: RELAY_VERSION,
  publicKey: "public-key-a",
  antidetectReady: true,
  configured: true,
  deviceId: "device-a",
  browser: {
    ready: true,
    provider: "mkt-browser",
    appVersion: "0.3.1",
    contractVersion: 4,
    contractCompatible: true,
    contractProblem: "",
    engine: { kind: "cft", version: "148.0.0.0", status: "ready" },
    capabilities: [],
  },
};

function renderButton(outcome: RelayOutcome<RelayHealth & RelayReply> | null): string {
  localPing.current = outcome;
  return renderToStaticMarkup(createElement(RelayDeviceRetirementButton, props));
}

describe("RelayDeviceRetirementButton locality rendering", () => {
  it("replaces the button with guidance when this is definitely another PC", () => {
    const markup = renderButton({
      status: "ok",
      data: { ...health, publicKey: "public-key-b" },
    });

    expect(markup).not.toContain("<button");
    expect(markup).toContain("This page is open on a different PC.");
    expect(markup).toContain("PC Hao");
  });

  it("keeps the button and explains the uncertainty when Relay is unavailable", () => {
    const markup = renderButton({ status: "unreachable", message: "No Relay." });

    expect(markup).toContain("Retire this PC");
    expect(markup).toContain("No Relay was found on the PC showing this page");
  });
});
