import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { isSea } from "node:sea";
import path from "node:path";
import type { VerifiedCompatibilityManifest } from "../../src/lib/release/compatibility-manifest";
import { updateRoot } from "./compatibility-update-marker";
import {
  CompatibilityArtifactDownloadError,
  stageCompatibilitySet,
} from "./compatibility-artifact-staging";
import { NODE_TLS_ENVIRONMENT_KEYS } from "./relay-child-environment";

const CONFIG_ENVIRONMENT_VARIABLE = "MKTTOOL_RELAY_STAGE_ONLY_TLS_FIXTURE";

interface FixtureInput {
  home: string;
  reportPath: string;
  verified: VerifiedCompatibilityManifest;
}

interface FixtureReport {
  outcome: "staged" | "rejected" | "unexpected";
  code?: string;
  artifactCount?: number;
  stagingDirectoryPresent: boolean;
  tlsEnvironment: Record<string, string | null>;
  tlsEnvironmentKeys: string[];
}

async function main(): Promise<void> {
  if (!isSea()) throw new Error("The stage-only TLS fixture must run inside a Node SEA executable.");
  const input = readFixtureInput();
  const stagingDirectory = path.join(
    updateRoot(input.home),
    "staging",
    String(input.verified.manifest.sequence),
  );
  try {
    const staged = await stageCompatibilitySet(input.home, input.verified);
    writeReport(input.reportPath, {
      outcome: "staged",
      artifactCount: Object.keys(staged.artifacts).length,
      stagingDirectoryPresent: existsSync(stagingDirectory),
      ...observedTlsEnvironment(),
    });
  } catch (error) {
    writeReport(input.reportPath, {
      outcome: error instanceof CompatibilityArtifactDownloadError ? "rejected" : "unexpected",
      code: error instanceof CompatibilityArtifactDownloadError ? error.code : "UNEXPECTED",
      stagingDirectoryPresent: existsSync(stagingDirectory),
      ...observedTlsEnvironment(),
    });
  }
}

function readFixtureInput(): FixtureInput {
  const configPath = process.env[CONFIG_ENVIRONMENT_VARIABLE];
  if (!configPath) throw new Error("The stage-only TLS fixture needs its explicit configuration.");
  const input = JSON.parse(readFileSync(configPath, "utf8")) as Partial<FixtureInput>;
  if (
    typeof input.home !== "string" ||
    typeof input.reportPath !== "string" ||
    !input.verified ||
    !Number.isSafeInteger(input.verified.manifest?.sequence)
  ) {
    throw new Error("The stage-only TLS fixture configuration is invalid.");
  }
  return input as FixtureInput;
}

function observedTlsEnvironment(): Pick<FixtureReport, "tlsEnvironment" | "tlsEnvironmentKeys"> {
  const tlsEnvironment: Record<string, string | null> = {};
  for (const key of NODE_TLS_ENVIRONMENT_KEYS) tlsEnvironment[key] = process.env[key] ?? null;
  const tlsEnvironmentKeys = Object.keys(process.env)
    .filter((key) => NODE_TLS_ENVIRONMENT_KEYS.includes(key.toUpperCase() as (typeof NODE_TLS_ENVIRONMENT_KEYS)[number]))
    .sort();
  return { tlsEnvironment, tlsEnvironmentKeys };
}

function writeReport(reportPath: string, report: FixtureReport): void {
  // The parent receives fixed outcome codes only, never raw TLS, URL, or filesystem error details.
  writeFileSync(reportPath, `${JSON.stringify(report)}\n`, "utf8");
}

void main().catch(() => {
  process.exitCode = 1;
});
