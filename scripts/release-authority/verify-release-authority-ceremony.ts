import os from "node:os";
import path from "node:path";
import { verifyReleaseAuthorityCeremony } from "./release-authority-ceremony-verifier";

interface Arguments {
  rootPublic: string;
  signedDelegation: string;
  publicRecord: string;
  recoveryProof: string;
  receiptOutput: string;
  storeDirectory: string;
  expectedRootKeyId: string;
}

const args = parseArguments(process.argv.slice(2));
const receipt = verifyReleaseAuthorityCeremony(args);
console.log(`Release-authority ceremony verified for root ${receipt.rootKeyId}.`);
console.log(`Public receipt: ${args.receiptOutput}`);

function parseArguments(values: string[]): Arguments {
  const parsed = new Map<string, string>();
  for (let index = 0; index < values.length; index += 2) {
    if (!values[index]?.startsWith("--") || !values[index + 1]) throw new Error(usage());
    parsed.set(values[index].slice(2), values[index + 1]);
  }
  const defaultStore = path.join(
    process.env.LOCALAPPDATA ?? path.join(os.homedir(), "AppData", "Local"),
    "MKTTool",
    "release-signing-authority",
  );
  return {
    rootPublic: path.resolve(required(parsed, "root-public")),
    signedDelegation: path.resolve(required(parsed, "signed-delegation")),
    publicRecord: path.resolve(required(parsed, "public-record")),
    recoveryProof: path.resolve(required(parsed, "recovery-proof")),
    receiptOutput: path.resolve(required(parsed, "receipt-output")),
    storeDirectory: path.resolve(parsed.get("store-dir") ?? defaultStore),
    expectedRootKeyId: required(parsed, "expected-root-key-id"),
  };
}

function required(values: Map<string, string>, name: string): string {
  const value = values.get(name);
  if (!value) throw new Error(`--${name} is required.\n\n${usage()}`);
  return value;
}

function usage(): string {
  return [
    "Usage:",
    "  npm run release:ceremony:verify -- --root-public <file> --signed-delegation <file>",
    "    --public-record <file> --recovery-proof <file> --receipt-output <file>",
    "    --expected-root-key-id <32-or-64-hex fingerprint>",
    "    [--store-dir <path>]",
  ].join("\n");
}
