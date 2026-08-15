import type { CompatibilityManifest } from "./compatibility-manifest";

export function managedCompatibilityArtifactPaths(
  artifacts: CompatibilityManifest["artifacts"],
  webOrigin: string,
): string[] {
  const origin = new URL(webOrigin).origin;
  const paths = [
    artifacts.installer,
    artifacts.relay,
    artifacts.browser,
    artifacts.controlContract,
  ].map((artifact) => {
    const url = new URL(artifact.url);
    if (url.origin !== origin) {
      throw new Error("Signed managed artifacts must use the configured MKTTool web origin.");
    }
    return url.pathname;
  });
  if (new Set(paths).size !== paths.length) {
    throw new Error("Signed managed artifacts must use distinct immutable paths.");
  }
  return paths;
}
