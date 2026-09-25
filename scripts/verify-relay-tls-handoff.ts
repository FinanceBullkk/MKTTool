import { readFileSync } from "node:fs";
import {
  runRelayTlsHandoffHarness,
  type RelayTlsHandoffCandidate,
} from "./retained-relay-tls-harness";

async function main(): Promise<void> {
  const { archivePath, metadataPath } = parseArgs(process.argv.slice(2));
  const candidate = readCandidate(metadataPath);
  const result = await runRelayTlsHandoffHarness({ archivePath, metadataPath, candidate });
  console.log(`PASS  source Relay TLS handoff (${result.cases.length}/${result.cases.length})`);
  console.log(`Archive SHA-256: ${result.archiveSha256}`);
  console.log(`Executable SHA-256: ${result.executableSha256}`);
}

function parseArgs(values: string[]): { archivePath: string; metadataPath: string } {
  const parsed = new Map<string, string>();
  for (let index = 0; index < values.length; index += 2) {
    const key = values[index];
    const value = values[index + 1];
    if (!key?.startsWith("--") || !value || parsed.has(key)) throw new Error(usage());
    parsed.set(key, value);
  }
  const archivePath = parsed.get("--archive");
  const metadataPath = parsed.get("--metadata");
  if (!archivePath || !metadataPath || parsed.size !== 2) throw new Error(usage());
  return { archivePath, metadataPath };
}

function readCandidate(metadataPath: string): RelayTlsHandoffCandidate {
  let metadata: Record<string, unknown>;
  try {
    metadata = JSON.parse(readFileSync(metadataPath, "utf8")) as Record<string, unknown>;
  } catch {
    throw new Error("Relay TLS handoff verification requires readable candidate metadata.");
  }
  if (
    !Number.isSafeInteger(metadata.version) || Number(metadata.version) <= 0 ||
    typeof metadata.sha256 !== "string" || !/^[0-9a-f]{64}$/.test(metadata.sha256) ||
    typeof metadata.executableSha256 !== "string" || !/^[0-9a-f]{64}$/.test(metadata.executableSha256) ||
    !Number.isSafeInteger(metadata.compatibilityFloor) || Number(metadata.compatibilityFloor) <= 0
  ) {
    throw new Error("Relay TLS handoff verification requires a valid hash-bound candidate metadata sidecar.");
  }
  return {
    label: `source Relay v${metadata.version}`,
    version: Number(metadata.version),
    archiveSha256: metadata.sha256,
    executableSha256: metadata.executableSha256,
    compatibilityFloor: Number(metadata.compatibilityFloor),
  };
}

function usage(): string {
  return "Usage: npm run relay:verify-tls-handoff -- --archive <MKTTool-Relay.zip> --metadata <MKTTool-Relay.metadata.json>";
}

void main().catch((error: unknown) => {
  console.error((error as Error).message);
  process.exitCode = 1;
});
