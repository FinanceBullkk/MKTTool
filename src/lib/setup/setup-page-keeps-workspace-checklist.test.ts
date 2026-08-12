import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

describe("setup page composition", () => {
  it("keeps the current-PC controller and workspace checklist on the same route", () => {
    const source = readFileSync(path.join(process.cwd(), "src/app/setup/page.tsx"), "utf8");

    expect(source).toContain("<RelayEnrollCard");
    expect(source).toContain("loadSetupChecklist()");
    expect(source).toContain("<WorkspaceSetupChecklist");
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
});
