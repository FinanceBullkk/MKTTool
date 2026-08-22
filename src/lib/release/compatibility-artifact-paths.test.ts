import { describe, expect, it } from "vitest";
import type { CompatibilityManifest } from "./compatibility-manifest";
import { managedCompatibilityArtifactPaths } from "./compatibility-artifact-paths";

const webOrigin = "https://mkt.example";

describe("managed compatibility artifact paths", () => {
  it("keeps the engine on the same authenticated immutable channel as the app tuple", () => {
    expect(managedCompatibilityArtifactPaths(artifacts(), webOrigin)).toEqual([
      "/api/relay/download/v15/artifact/installer",
      "/api/relay/download/v15/artifact/relay",
      "/api/relay/download/v15/artifact/browser",
      "/api/relay/download/v15/artifact/control-contract",
      "/api/relay/download/v15/artifact/engine",
    ]);
  });
});

function artifacts(): CompatibilityManifest["artifacts"] {
  const artifact = (kind: string) => ({
    kind,
    version: "1",
    sha256: "a".repeat(64),
    sizeBytes: 1,
    url: `${webOrigin}/api/relay/download/v15/artifact/${kind}`,
  });
  return {
    installer: { ...artifact("installer"), kind: "installer" },
    relay: {
      ...artifact("relay"),
      kind: "relay",
      supportedBrowserContract: { min: 4, max: 4 },
      secureStoreSchemaVersion: 1,
    },
    browser: {
      ...artifact("browser"),
      kind: "browser",
      contractVersion: 4,
      profileSchemaVersion: 3,
      engineKind: "cloakbrowser",
    },
    controlContract: {
      ...artifact("control-contract"),
      kind: "control-contract",
      contractVersion: 4,
    },
    engine: { ...artifact("engine"), kind: "engine", engineKind: "cloakbrowser" },
  };
}
