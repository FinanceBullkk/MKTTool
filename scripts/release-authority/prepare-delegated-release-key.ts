import { randomBytes } from "node:crypto";
import { mkdirSync, rmSync, writeFileSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import {
  buildDelegationRequest,
  privateKeyFromSeed,
  publicKeyHex,
} from "./release-authority-format.mjs";
import { protectForCurrentWindowsUser } from "./windows-dpapi-current-user";

interface Arguments {
  requestOutput: string;
  storeDirectory: string;
  expiresAt: string;
  label: string;
}

const args = parseArguments(process.argv.slice(2));
const storePath = path.join(args.storeDirectory, "delegated-manifest-key.dpapi");
const createdAt = new Date().toISOString();
const expiresAt = validateExpiry(createdAt, args.expiresAt);
const seed = randomBytes(32);
let requestWritten = false;
let storeWritten = false;

try {
  const delegatedPublicHex = publicKeyHex(privateKeyFromSeed(seed));
  const request = buildDelegationRequest({
    publicHex: delegatedPublicHex,
    createdAt,
    notBefore: createdAt,
    expiresAt,
    label: args.label,
  });
  const protectedStore = {
    schemaVersion: 1,
    type: "mkttool.delegated-release-key-store",
    algorithm: "Ed25519",
    delegatedKeyId: request.delegatedKeyId,
    delegatedPublicKeyHex: delegatedPublicHex,
    createdAt,
    protectedSeed: protectForCurrentWindowsUser(seed),
  };

  mkdirSync(path.dirname(args.requestOutput), { recursive: true });
  mkdirSync(args.storeDirectory, { recursive: true });
  writeJsonExclusive(args.requestOutput, request);
  requestWritten = true;
  writeJsonExclusive(storePath, protectedStore);
  storeWritten = true;

  console.log(`Delegated release key created: ${request.delegatedKeyId}`);
  console.log(`Offline comparison fingerprint: ${request.delegatedKeyId.slice(0, 32)}`);
  console.log(`DPAPI store: ${storePath}`);
  console.log(`Public delegation request: ${args.requestOutput}`);
  console.log("Move only the public request to the offline ceremony host. Never copy the DPAPI store.");
} catch (error) {
  if (requestWritten && !storeWritten) rmSync(args.requestOutput, { force: true });
  throw error;
} finally {
  seed.fill(0);
}

function parseArguments(values: string[]): Arguments {
  const parsed = new Map<string, string>();
  for (let index = 0; index < values.length; index += 2) {
    const name = values[index];
    const value = values[index + 1];
    if (!name?.startsWith("--") || !value) throw new Error(usage());
    parsed.set(name.slice(2), value);
  }

  const requestOutput = parsed.get("request-output");
  if (!requestOutput) throw new Error(`--request-output is required.\n\n${usage()}`);
  const defaultStore = path.join(
    process.env.LOCALAPPDATA ?? path.join(os.homedir(), "AppData", "Local"),
    "MKTTool",
    "release-signing-authority",
  );
  const oneYearFromNow = new Date();
  oneYearFromNow.setUTCFullYear(oneYearFromNow.getUTCFullYear() + 1);

  return {
    requestOutput: path.resolve(requestOutput),
    storeDirectory: path.resolve(parsed.get("store-dir") ?? defaultStore),
    expiresAt: parsed.get("expires-at") ?? oneYearFromNow.toISOString(),
    label: parsed.get("label") ?? `owner-${new Date().getUTCFullYear()}`,
  };
}

function validateExpiry(createdAt: string, expiresAt: string): string {
  const created = Date.parse(createdAt);
  const expires = Date.parse(expiresAt);
  if (!Number.isFinite(expires)) throw new Error("--expires-at must be a valid ISO-8601 timestamp.");
  const lifetimeDays = (expires - created) / 86_400_000;
  if (lifetimeDays < 30 || lifetimeDays > 400) {
    throw new Error("The delegated key lifetime must be between 30 and 400 days.");
  }
  return new Date(expires).toISOString();
}

function writeJsonExclusive(filePath: string, value: unknown): void {
  writeFileSync(filePath, `${JSON.stringify(value, null, 2)}\n`, {
    encoding: "utf8",
    flag: "wx",
    mode: 0o600,
  });
}

function usage(): string {
  return [
    "Usage:",
    "  npm run release:delegation:prepare -- --request-output <path>",
    "    [--store-dir <path>] [--expires-at <ISO timestamp>] [--label <name>]",
  ].join("\n");
}
