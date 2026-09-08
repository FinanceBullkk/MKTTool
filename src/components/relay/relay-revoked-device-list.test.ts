import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { RELAY_VERSION, type RelayHealth, type RelayReply } from "@/lib/relay/relay-endpoints";
import type { RelayDeviceListItem } from "./relay-device-list-types";

const localPing = vi.hoisted(() => ({ current: null as unknown }));

vi.mock("@/components/relay/relay-local-identity-provider", () => ({
  useLocalRelayPing: () => localPing.current,
}));
vi.mock("@/lib/retirement/relay-device-retirement-actions", () => ({
  beginRelayDeviceRetirement: vi.fn(),
  completeRelayDeviceRetirement: vi.fn(),
  issueRelayDeviceRetirementFinalization: vi.fn(),
}));
vi.mock("@/lib/format/vietnamese-date-format", () => ({
  formatFullDateTime: () => "08 September 2026",
}));
vi.mock("./relay-device-version-cell", () => ({ RelayDeviceVersionCell: () => null }));

import { RelayRevokedDeviceList } from "./relay-revoked-device-list";

const device: RelayDeviceListItem = {
  id: "revoked-device",
  userId: "owner-user",
  name: "Owner PC",
  publicKey: "owner-public-key",
  createdAt: new Date("2026-09-01T00:00:00Z"),
  relayVersion: RELAY_VERSION,
  lastSeenAt: null,
  revokedAt: new Date("2026-09-08T00:00:00Z"),
  operatorKeyGrant: null,
  operatorKeyReadyAt: null,
  retirementId: null,
  retirementCompletedAt: null,
  user: { email: "owner@example.com" },
  _count: { accounts: 0 },
};

const health: RelayHealth & RelayReply = {
  ok: true,
  message: "Relay is responding.",
  relayVersion: RELAY_VERSION,
  publicKey: device.publicKey,
  deviceId: device.id,
  antidetectReady: false,
  configured: true,
  browser: {
    ready: false,
    provider: null,
    appVersion: null,
    contractVersion: null,
    contractCompatible: false,
    contractProblem: "",
    engine: null,
    capabilities: [],
  },
};

function renderList(input: {
  viewerUserId?: string;
  isAdmin?: boolean;
  device?: Partial<RelayDeviceListItem>;
} = {}): string {
  return renderToStaticMarkup(createElement(RelayRevokedDeviceList, {
    devices: [{ ...device, ...input.device }],
    viewerUserId: input.viewerUserId,
    isAdmin: input.isAdmin ?? false,
    minimumRelayVersion: 13,
  }));
}

beforeEach(() => {
  localPing.current = { status: "ok", data: health };
});

describe("RelayRevokedDeviceList recovery controls", () => {
  it("lets the owner finish cleanup of their already revoked PC", () => {
    const markup = renderList({ viewerUserId: device.userId });

    expect(markup).toContain("Local cleanup pending");
    expect(markup).toContain("Finish local cleanup");
    expect(markup).not.toContain("Retire this PC");
    expect(markup).not.toContain("Check local receipt");
    expect(markup).not.toContain("open Setup and register a new Relay PC");
  });

  it.each(["another-user", undefined])("does not expose pending cleanup to viewer %s", (viewerUserId) => {
    const markup = renderList({ viewerUserId });

    expect(markup).toContain("Local cleanup pending");
    expect(markup).not.toContain("Finish local cleanup");
  });

  it("keeps administrator recovery available for another owner's revoked PC", () => {
    expect(renderList({ viewerUserId: "admin-user", isAdmin: true })).toContain("Finish local cleanup");
  });

  it.each([false, true])("does not expose cleanup for an active record (admin: %s)", (isAdmin) => {
    const markup = renderList({ viewerUserId: device.userId, isAdmin, device: { revokedAt: null } });

    expect(markup).not.toContain("Finish local cleanup");
  });

  it("lets the owner check the local receipt after server completion", () => {
    const markup = renderList({
      viewerUserId: device.userId,
      device: { retirementId: "retirement-id", retirementCompletedAt: new Date("2026-09-08T01:00:00Z") },
    });

    expect(markup).toContain("Local cleanup confirmed");
    expect(markup).toContain("Check local receipt");
    expect(markup).not.toContain("Finish local cleanup");
    expect(markup.indexOf("Check local receipt")).toBeLessThan(markup.indexOf("Technical record"));
    // Server completion replaces the cleanup control, so guidance cannot depend on its old state.
    expect(markup).toContain("On Owner PC, if Setup still reports unfinished retirement");
    expect(markup).toContain("After Relay confirms completion and closes");
    expect(markup).toContain("open Setup and register a new Relay PC");
  });

  it.each(["another-user", undefined])("does not expose the completed receipt to viewer %s", (viewerUserId) => {
    const markup = renderList({
      viewerUserId,
      device: { retirementId: "retirement-id", retirementCompletedAt: new Date("2026-09-08T01:00:00Z") },
    });

    expect(markup).not.toContain("Check local receipt");
  });

  it("keeps administrator receipt recovery available for another owner's revoked PC", () => {
    const markup = renderList({
      viewerUserId: "admin-user",
      isAdmin: true,
      device: { retirementId: "retirement-id", retirementCompletedAt: new Date("2026-09-08T01:00:00Z") },
    });

    expect(markup).toContain("Check local receipt");
  });

  it("does not expose receipt recovery for an active record", () => {
    const markup = renderList({
      viewerUserId: device.userId,
      device: { revokedAt: null, retirementId: "retirement-id", retirementCompletedAt: new Date("2026-09-08T01:00:00Z") },
    });

    expect(markup).not.toContain("Check local receipt");
  });

  it("still requires the owner to use the matching physical PC", () => {
    localPing.current = { status: "ok", data: { ...health, publicKey: "another-pc-key" } };
    const markup = renderList({ viewerUserId: device.userId });

    expect(markup).not.toContain("Finish local cleanup");
    expect(markup).toContain("This page is open on a different PC.");
  });
});
