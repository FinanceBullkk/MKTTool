import { runRetainedRelayTlsHarness } from "./retained-relay-tls-harness";

async function main(): Promise<void> {
  const { archivePath, metadataPath } = parseArgs(process.argv.slice(2));
  const result = await runRetainedRelayTlsHarness({ archivePath, metadataPath });
  console.log(`PASS  retained Relay v20 TLS harness (${result.cases.length}/${result.cases.length})`);
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

function usage(): string {
  return "Usage: npm run relay:verify-retained-tls -- --archive <MKTTool-Relay.zip> --metadata <relay-release.json>";
}

void main().catch((error: unknown) => {
  console.error((error as Error).message);
  process.exitCode = 1;
});
