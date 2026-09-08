import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { ProfileSetupStatus } from "./profile-setup-status";
import type { ProfileSetupBlocked } from "@/lib/relay/profile-setup-readiness";

const BROWSER_OFFLINE: ProfileSetupBlocked = {
  kind: "blocked", state: "browser-offline", title: "MKT Browser is not connected",
  message: "Open MKT Browser on this PC, then check again.",
};

describe("ProfileSetupStatus", () => {
  it("shows checking as pending rather than old or ready", () => {
    const markup = renderToStaticMarkup(createElement(ProfileSetupStatus, {
      state: null, checking: true, onRetry: () => undefined,
    }));
    expect(markup).toContain("Checking this PC");
    expect(markup).toContain("Checking...");
    expect(markup).toContain('disabled=""');
    expect(markup).toContain('aria-busy="true"');
    expect(markup).not.toContain("Relay update required");
  });

  it("offers retry after opening Browser without sending the user to download Relay", () => {
    const markup = renderToStaticMarkup(createElement(ProfileSetupStatus, {
      state: BROWSER_OFFLINE, checking: false, onRetry: () => undefined,
    }));
    expect(markup).toContain("MKT Browser is not connected");
    expect(markup).toContain("Check again");
    expect(markup).not.toContain('disabled=""');
    expect(markup).not.toContain("/setup#download");
    expect(markup).not.toContain("Relay update required");
  });

  it("retains the cause while checking again and links the measured outdated case to download", () => {
    const markup = renderToStaticMarkup(createElement(ProfileSetupStatus, {
      state: { ...BROWSER_OFFLINE, state: "relay-outdated", title: "Relay update required",
        message: "Update Relay, then check again.", setupHref: "/setup#download" },
      checking: true, onRetry: () => undefined,
    }));
    expect(markup).toContain("Relay update required");
    expect(markup).toContain('href="/setup#download"');
    expect(markup).toContain("Checking...");
    expect(markup).toContain('role="status"');
  });
});
