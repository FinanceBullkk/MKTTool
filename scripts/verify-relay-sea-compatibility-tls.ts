import { mkdtempSync, rmSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { createTlsFixtureCertificates } from "./compatibility-artifact-tls-fixture-certificates";
import { buildRelayStageOnlyTlsFixture } from "./relay-sea-tls-fixture-builder";
import {
  runRelaySeaTlsFixtureTestCase,
  type RelaySeaTlsFixtureTestCase,
} from "./relay-sea-tls-fixture-runner";

const TEST_CASES: RelaySeaTlsFixtureTestCase[] = [
  { name: "trusted chain", certificate: "trusted", trustFixtureCa: true, response: "normal", expected: "staged" },
  { name: "self-signed certificate", certificate: "selfSigned", trustFixtureCa: false, response: "normal", expected: "COMPATIBILITY_ARTIFACT_TLS" },
  { name: "unknown CA", certificate: "trusted", trustFixtureCa: false, response: "normal", expected: "COMPATIBILITY_ARTIFACT_TLS" },
  { name: "missing intermediate", certificate: "missingIntermediate", trustFixtureCa: true, response: "normal", expected: "COMPATIBILITY_ARTIFACT_TLS" },
  { name: "expired certificate", certificate: "expired", trustFixtureCa: true, response: "normal", expected: "COMPATIBILITY_ARTIFACT_TLS" },
  { name: "wrong hostname", certificate: "wrongHostname", trustFixtureCa: true, response: "normal", expected: "COMPATIBILITY_ARTIFACT_TLS" },
  { name: "redirect", certificate: "trusted", trustFixtureCa: true, response: "redirect", expected: "COMPATIBILITY_ARTIFACT_NETWORK" },
  { name: "HTTP refusal", certificate: "trusted", trustFixtureCa: true, response: "httpRefusal", expected: "COMPATIBILITY_ARTIFACT_HTTP" },
  { name: "truncated body", certificate: "trusted", trustFixtureCa: true, response: "truncated", expected: "COMPATIBILITY_ARTIFACT_SIZE" },
  { name: "oversize body", certificate: "trusted", trustFixtureCa: true, response: "oversize", expected: "COMPATIBILITY_ARTIFACT_SIZE" },
  { name: "hash mismatch", certificate: "trusted", trustFixtureCa: true, response: "hashMismatch", expected: "COMPATIBILITY_ARTIFACT_HASH" },
  { name: "connection refusal", trustFixtureCa: false, response: "normal", expected: "COMPATIBILITY_ARTIFACT_NETWORK" },
];

async function main(): Promise<void> {
  if (process.platform !== "win32") throw new Error("The Relay SEA TLS fixture must run on Windows.");
  const workspace = mkdtempSync(path.join(os.tmpdir(), "mkttool-relay-sea-tls-"));
  let certificates: ReturnType<typeof createTlsFixtureCertificates> | undefined;
  try {
    const executable = buildRelayStageOnlyTlsFixture(workspace);
    certificates = createTlsFixtureCertificates();
    for (const testCase of TEST_CASES) {
      await runRelaySeaTlsFixtureTestCase(executable, certificates, testCase);
      console.log(`PASS  ${testCase.name}`);
    }
    console.log(`PASS  Relay SEA compatibility TLS fixture (${TEST_CASES.length}/${TEST_CASES.length})`);
  } finally {
    certificates?.cleanup();
    rmSync(workspace, { recursive: true, force: true });
  }
}

void main().catch((error: unknown) => {
  console.error((error as Error).message);
  process.exitCode = 1;
});
