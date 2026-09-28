import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

describe("setup page composition", () => {
  it("keeps Browser/Relay downloads, current-PC enrollment, and the checklist on one route", () => {
    const page = readFileSync(path.join(process.cwd(), "src/app/setup/page.tsx"), "utf8");
    const stepper = readFileSync(
      path.join(process.cwd(), "src/components/setup/onboarding-stepper.tsx"),
      "utf8",
    );

    expect(page).toContain("<BrowserDownloadSection");
    expect(page).toContain("<RelayDownloadSection");
    expect(page).toContain("loadSetupChecklist()");
    expect(stepper).toContain("<RelayEnrollCard");
    expect(stepper).toContain("<WorkspaceSetupChecklist");
  });

  it("does not fabricate owner or shared-account conflicts for unclassified failures", () => {
    const source = readFileSync(
      path.join(process.cwd(), "src/components/relay/relay-enroll-card.tsx"),
      "utf8",
    );

    expect(source).not.toContain('conflict: "previous-owner"');
    expect(source).not.toContain('conflict: "shared-windows-account"');
    expect(source).toContain('status: "inspection-failed"');
  });

  it("does not make Browser installer availability a workspace-readiness condition", () => {
    const source = readFileSync(
      path.join(process.cwd(), "src/components/setup/onboarding-stepper.tsx"),
      "utf8",
    );

    expect(source).toContain("const workspaceReady = checklist.handoff.nextStepId === null;");
    expect(source).not.toContain("checklist.nextStepId === null && downloadable");
  });

  it("makes the combined Browser installer the setup entry point", () => {
    const source = readFileSync(
      path.join(process.cwd(), "src/components/setup/onboarding-stepper.tsx"),
      "utf8",
    );

    const browserSection = readFileSync(
      path.join(process.cwd(), "src/components/setup/browser-download-section.tsx"),
      "utf8",
    );

    expect(source).toContain('title="Install MKT Browser"');
    expect(source).toContain('title="Register this PC"');
    expect(source).toContain('title="Confirm handoff"');
    expect(source).toContain("I installed MKT Browser - register this PC");
    expect(source).toContain('onDownloadRelay={() => selectStep(1)}');
    expect(source).toContain('id="register"');
    expect(source).toContain('id="handoff"');
    expect(source).toContain("Standalone Relay download for repair");
    expect(source).toContain("profile manager with proxy binding");
    expect(source).not.toContain("installerDownloadUrl");
    expect(browserSection).toContain('href="/api/setup/windows-installer"');
  });

  it("does not make Browser health a Relay PC registration gate", () => {
    const stateMachine = readFileSync(
      path.join(process.cwd(), "src/lib/setup/setup-state-machine.ts"),
      "utf8",
    );

    expect(stateMachine).not.toContain("currentDeviceBrowserReadiness");
    expect(stateMachine).not.toContain("REQUIRED_SETUP_BROWSER_CAPABILITIES");
    expect(stateMachine).toContain("Browser readiness remains a separate rollout boundary");
  });
});
