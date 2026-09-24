import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { RelayDeviceListItem } from "./relay-device-list-types";

const versionCells = vi.hoisted(() => ({ floors: [] as number[] }));

vi.mock("@/lib/tickets/relay-device-actions", () => ({ revokeRelayDevice: vi.fn() }));
vi.mock("@/lib/format/vietnamese-date-format", () => ({
  formatFullDateTime: () => "24 September 2026",
}));
vi.mock("./relay-device-id-cell", () => ({ RelayDeviceIdCell: () => null }));
vi.mock("./relay-grant-key-button", () => ({ RelayGrantKeyButton: () => null }));
vi.mock("./relay-compatibility-update-button", () => ({ RelayCompatibilityUpdateButton: () => null }));
vi.mock("./relay-compatibility-rollback-button", () => ({ RelayCompatibilityRollbackButton: () => null }));
vi.mock("./relay-device-revoke-button", () => ({ RelayDeviceRevokeButton: () => null }));
vi.mock("./relay-device-retirement-button", () => ({ RelayDeviceRetirementButton: () => null }));
vi.mock("./relay-device-version-cell", () => ({
  RelayDeviceVersionCell: ({ floor }: { floor: number }) => {
    versionCells.floors.push(floor);
    return null;
  },
}));

import { RelayActiveDeviceList } from "./relay-active-device-list";

const device: RelayDeviceListItem = {
  id: "device-1",
  userId: "user-1",
  name: "Operator PC",
  publicKey: "public-key",
  createdAt: new Date("2026-09-24T00:00:00Z"),
  relayVersion: 19,
  lastSeenAt: new Date("2026-09-24T00:00:00Z"),
  revokedAt: null,
  operatorKeyGrant: "grant",
  operatorKeyReadyAt: new Date("2026-09-24T00:00:00Z"),
  retirementId: null,
  retirementCompletedAt: null,
  user: { email: "operator@example.com" },
  _count: { accounts: 1 },
};

beforeEach(() => {
  versionCells.floors = [];
});

describe("RelayActiveDeviceList version floors", () => {
  it("shows the security and profile-operation floors separately", () => {
    const markup = renderToStaticMarkup(createElement(RelayActiveDeviceList, {
      devices: [device],
      isAdmin: false,
      canStillSignIn: () => true,
      securityMinimumRelayVersion: 13,
      profileOperationMinimumRelayVersion: 20,
    }));

    expect(markup).toContain("Relay security floor");
    expect(markup).toContain("Profile-operation floor");
    expect(versionCells.floors).toEqual([13, 20]);
  });
});
