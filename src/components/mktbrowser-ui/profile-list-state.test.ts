import { describe, expect, it } from "vitest";
import type { ProfileItemData } from "./ProfileTile";
import {
  profileListCounts,
  profileMatchesListFilter,
  profileMatchesSearchQuery,
} from "./profile-list-state";

const PROFILES: ProfileItemData[] = [
  profile("account-a", "profile-a", 0),
  profile("account-b", "profile-b", 2),
  profile("account-c", null, 0),
];

describe("profile list state", () => {
  it("counts and filters running profiles from Relay inventory", () => {
    const running = new Set(["profile-a"]);

    expect(profileListCounts(PROFILES, running)).toMatchObject({
      all: 3,
      running: 1,
      warmup: 1,
      idle: 1,
    });
    expect(
      PROFILES.filter((item) => profileMatchesListFilter(item, "running", running)).map(
        (item) => item.id,
      ),
    ).toEqual(["account-a"]);
    expect(
      PROFILES.filter((item) => profileMatchesListFilter(item, "idle", running)).map(
        (item) => item.id,
      ),
    ).toEqual(["account-c"]);
  });

  it("filters the Home nick vault by visible identity fields", () => {
    const searchable = {
      ...PROFILES[0],
      username: "review-kitchen",
      contentAngle: "Kitchen operations",
      voice: "Practical reviewer",
      notes: "Priority handoff",
      proxy: {
        ...PROFILES[0].proxy!,
        label: "US-static-01",
        lastExitIp: "203.0.113.25",
      },
      device: { id: "device-a", name: "Relay-Laptop-A", userId: "user-a" },
    };

    expect(profileMatchesSearchQuery(searchable, "KITCHEN")).toBe(true);
    expect(profileMatchesSearchQuery(searchable, "practical")).toBe(true);
    expect(profileMatchesSearchQuery(searchable, "operations")).toBe(true);
    expect(profileMatchesSearchQuery(searchable, "priority handoff")).toBe(true);
    expect(profileMatchesSearchQuery(searchable, "us-static")).toBe(true);
    expect(profileMatchesSearchQuery(searchable, "203.0.113.10")).toBe(true);
    expect(profileMatchesSearchQuery(searchable, "203.0.113.25")).toBe(true);
    expect(profileMatchesSearchQuery(searchable, "relay-laptop")).toBe(true);
    expect(profileMatchesSearchQuery(searchable, "tiktok")).toBe(true);
    expect(profileMatchesSearchQuery(searchable, "missing")).toBe(false);
    expect(profileMatchesSearchQuery(searchable, "   ")).toBe(true);
  });
});

function profile(
  id: string,
  antidetectProfileId: string | null,
  coldStartDaysRemaining: number,
): ProfileItemData {
  return {
    id,
    username: id,
    platform: "TIKTOK",
    status: "ALIVE",
    coldStartUntil: null,
    coldStartDaysRemaining,
    voice: null,
    contentAngle: null,
    notes: null,
    firstLoginAt: null,
    antidetectProfileId,
    device: { id: "device-a", name: "PC", userId: "user-a" },
    proxy: {
      id: `proxy-${id}`,
      label: "Proxy",
      host: "203.0.113.10",
      port: 1080,
      country: "US",
      type: "SOCKS5",
      lastExitIp: null,
      lastCheckVerdict: "OK",
    },
  };
}
