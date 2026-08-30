import { createElement, Fragment } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { ProfileTable } from "./ProfileTable";
import { ProfileTile, type ProfileItemData } from "./ProfileTile";
import type { LocalLaunchReadiness } from "@/lib/relay/profile-launch-readiness";

const PROFILE: ProfileItemData = {
  id: "account-a",
  username: "operator-profile",
  platform: "TIKTOK",
  status: "ALIVE",
  coldStartUntil: null,
  coldStartDaysRemaining: 0,
  voice: null,
  contentAngle: null,
  notes: null,
  firstLoginAt: null,
  antidetectProfileId: "profile-a",
  device: { id: "device-a", name: "Operator PC", userId: "user-a" },
  proxy: {
    id: "proxy-a",
    label: "secret-proxy-label",
    host: "203.0.113.10",
    port: 1080,
    country: "US",
    type: "SOCKS5",
    lastExitIp: "198.51.100.20",
    lastCheckVerdict: "ALIVE",
  },
};

const READY: LocalLaunchReadiness = {
  ready: true,
  state: "ready",
  message: "Local browser technical checks passed; identity isolation is not proven.",
  deviceId: "device-a",
};

describe("profile launch UI", () => {
  it("shows safe proxy status without rendering proxy endpoints", () => {
    const tile = createElement(ProfileTile, {
      profile: PROFILE,
      localReadiness: READY,
      isRunning: false,
      onOpened: () => undefined,
    });
    const table = createElement(ProfileTable, {
      profiles: [PROFILE],
      localReadiness: READY,
      runningProfileIds: new Set<string>(),
      onOpened: () => undefined,
    });
    const markup = renderToStaticMarkup(createElement(Fragment, null, tile, table));

    expect(markup).toContain("Verified");
    expect(markup).not.toContain(PROFILE.proxy!.host);
    expect(markup).not.toContain(PROFILE.proxy!.lastExitIp);
    expect(markup).not.toContain(String(PROFILE.proxy!.port));
    expect(markup).not.toContain(PROFILE.proxy!.label);
    expect(markup).not.toMatch(/cloakbrowser|chromium|\bMCP\b|47821|47822/i);
  });

  it("disables launch and shows the measured recovery remedy", () => {
    const recovering: LocalLaunchReadiness = {
      ready: false,
      state: "recovery-pending",
      message: "The local browser is recovering a prior session.",
      deviceId: "device-a",
    };
    const markup = renderToStaticMarkup(
      createElement(ProfileTile, {
        profile: PROFILE,
        localReadiness: recovering,
        isRunning: false,
        onOpened: () => undefined,
      }),
    );

    expect(markup).toContain("disabled");
    expect(markup).toContain("recovering a prior session");
  });
});
