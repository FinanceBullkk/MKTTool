import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const source = readFileSync(
  new URL("./smoke-test-mkt-browser-correct-proxy.ts", import.meta.url),
  "utf8",
);

describe("correct-proxy smoke authorization path", () => {
  it("launches only through a signed ticket handled by Relay", () => {
    expect(source).toContain("issueTicket(");
    expect(source).toContain("handleTicketRequest(");
    expect(source).toContain("TICKET_KINDS.LAUNCH_PROFILE");
    expect(source).toContain("new RelayAntidetect(");
    expect(source).toContain("await waitForProfileInventory(adapter, child)");

    expect(source).not.toContain('callTool("navigate"');
    expect(source).not.toContain('callTool("evaluate_js"');
    expect(source).not.toContain("adapter.applyProxy(");
    expect(source).not.toContain("adapter.launchProfile(");
  });
});
