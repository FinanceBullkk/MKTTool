import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

function source(relativePath: string): string {
  return readFileSync(path.join(process.cwd(), relativePath), "utf8").replace(/\r\n/g, "\n");
}

describe("explicit browser-capacity refresh", () => {
  it("keeps initial and background reads passive while user retries refresh capacity first", () => {
    const home = source("src/components/mktbrowser-ui/Constellation.tsx");
    const profileSetup = source("src/components/vault/antidetect-profile-card.tsx");

    expect(home).toContain("setTimeout(() => void refreshLocalState(), 0)");
    expect(home).toContain("setInterval(() => void refreshLocalState(), 15_000)");
    expect(home).toContain("onRefresh={() => void refreshLocalState(true)}");
    expect(profileSetup).toContain("setTimeout(() => void refreshLocalState(), 0)");
    expect(profileSetup).toContain("onRetry={() => void refreshLocalState(true)}");
  });

  it("uses a POST refresh route and does not attach a launch ticket", () => {
    const client = source("src/lib/relay/relay-browser-client.ts");
    const endpoints = source("src/lib/relay/relay-endpoints.ts");
    expect(client).toMatch(/refreshRelayLicenseCapacity[\s\S]+licenseCapacityRefresh/);
    expect(client).toMatch(/licenseCapacityRefresh,\s*\{\s*method: "POST"/);
    const refreshBlock = client.slice(client.indexOf("export function refreshRelayLicenseCapacity"));
    const refreshFunction = refreshBlock.split("export function sendTicketToRelay")[0];
    expect(refreshFunction).not.toContain("ticket");
    expect(refreshFunction).toContain("RELAY_LICENSE_CAPACITY_REFRESH_TIMEOUT_MS");
    expect(endpoints).toContain(
      "export const RELAY_LICENSE_CAPACITY_REFRESH_TIMEOUT_MS = 10_000;",
    );
  });
});
