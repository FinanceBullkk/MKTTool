import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const read = (relativePath: string) =>
  readFileSync(join(process.cwd(), relativePath), "utf8");

describe("Phase 2 navigation and vocabulary contract", () => {
  it("keeps the nick vault discoverable with visible rail labels", () => {
    const source = read("src/components/mktbrowser-ui/LeftRail.tsx");

    expect(source).toContain('{ href: "/accounts", icon: Users, label: "Nick vault" }');
    expect(source).toContain("{item.label}");
    expect(source).toContain('aria-current={active ? "page" : undefined}');
    expect(source).not.toContain("Kênh / Profiles");
  });

  it("moves working search into Home and removes false header signals", () => {
    const home = read("src/components/mktbrowser-ui/Constellation.tsx");
    const topBar = read("src/components/mktbrowser-ui/TopBar.tsx");
    const shell = read("src/components/mktbrowser-ui/AppShell.tsx");

    expect(home).toContain('type="search"');
    expect(home).toContain("profileMatchesSearchQuery(p, searchQuery)");
    expect(home).toContain('href="/accounts"');
    expect(home).toContain("Workspace overview");
    expect(home).toContain("Nick vault");
    expect(home).toContain("<WorkspaceStatusBoard");
    expect(topBar).not.toContain("Ctrl K");
    expect(topBar).not.toContain("<input");
    expect(topBar).not.toContain("runningCount");
    expect(topBar).not.toContain("totalCount");
    expect(shell).not.toContain("searchQuery");
    expect(shell).not.toContain("runningProfiles");
  });

  it("keeps the app canvas and its content bounded on wide desktops", () => {
    const styles = read("src/app/globals.css");
    const shell = read("src/components/mktbrowser-ui/AppShell.tsx");
    const topBar = read("src/components/mktbrowser-ui/TopBar.tsx");

    expect(styles).toContain("--mkt-canvas-width: 100rem");
    expect(styles).toContain("--mkt-frame-width: 72rem");
    expect(styles).toContain("width: min(100%, var(--mkt-canvas-width))");
    expect(styles).toContain(".app-frame,");
    expect(styles).toContain("width: min(100%, var(--mkt-frame-width))");
    expect(shell).toContain('className="app-canvas flex h-[100dvh]');
    expect(topBar).toContain('className="app-frame flex items-center gap-3.5"');
  });

  it("uses the shared icon-first metric language on operational index pages", () => {
    const metric = read("src/components/ui/summary-metric.tsx");
    const accounts = read("src/app/accounts/page.tsx");
    const proxies = read("src/components/proxies/proxy-console.tsx");
    const relayPcs = read("src/app/relay-devices/page.tsx");

    expect(metric).toContain("icon: Icon");
    expect(metric).toContain("tabular-nums");
    for (const page of [accounts, proxies, relayPcs]) {
      expect(page).toContain('from "@/components/ui/summary-metric"');
      expect(page).not.toContain("function SummaryMetric");
    }
  });

  it("uses the three canonical UI concepts on newcomer surfaces", () => {
    const accounts = read("src/app/accounts/page.tsx");
    const setup = read("src/components/setup/onboarding-stepper.tsx");
    const detail = read("src/app/accounts/[id]/page.tsx");
    const actions = read("src/app/accounts/[id]/account-vault-actions-panel.tsx");
    const table = read("src/components/mktbrowser-ui/ProfileTable.tsx");
    const tiktokSheet = read("src/components/tiktok/new-tiktok-profile-sheet.tsx");

    expect(accounts).toContain('title="Nick vault"');
    expect(setup).toContain("Set up this Relay PC");
    expect(detail).toContain('"Browser profile"');
    expect(detail).toContain('"Relay PC"');
    expect(actions).toContain("Open browser profile");
    expect(table).toContain("Open on this Relay PC");
    expect(table).toContain("Owner");
    expect(table).toContain("Relay PC not assigned");
    expect(table).not.toContain("Local PC");
    expect(tiktokSheet).toContain("Create TikTok nick");
    expect(tiktokSheet).not.toContain("Tạo hồ sơ TikTok mới");
  });
});
