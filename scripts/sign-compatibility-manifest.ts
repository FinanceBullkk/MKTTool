import { readFileSync, writeFileSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { compatibilityManifestSchema, signedDelegationSchema } from "../src/lib/release/compatibility-manifest-schema";
import { signCompatibilityManifest } from "../src/lib/release/compatibility-manifest-crypto";
import {
  privateKeyFromSeed,
  publicKeyFromHex,
  publicKeyHex,
  releaseKeyId,
} from "./release-authority/release-authority-key-primitives.mjs";
import { verifySignedDelegation } from "./release-authority/release-authority-format.mjs";
import { unprotectForCurrentWindowsUser } from "./release-authority/windows-dpapi-current-user";
import { WINDOWS_RELEASE_ROOT_TRUST } from "../src/lib/release/release-root-trust";

interface DelegatedKeyStore {
  schemaVersion: 1;
  type: "mkttool.delegated-release-key-store";
  delegatedKeyId: string;
  delegatedPublicKeyHex: string;
  protectedSeed: string;
}

const args = parseArgs(process.argv.slice(2));
const manifest = compatibilityManifestSchema.parse(readJson(args.manifest));
const delegation = signedDelegationSchema.parse(readJson(args.delegation));
const store = readJson<DelegatedKeyStore>(path.join(args.storeDirectory, "delegated-manifest-key.dpapi"));
const rootKey = publicKeyFromHex(WINDOWS_RELEASE_ROOT_TRUST.publicKeyHex);
verifySignedDelegation(rootKey, delegation);

const seed = unprotectForCurrentWindowsUser(store.protectedSeed);
try {
  const privateKey = privateKeyFromSeed(seed);
  const publicHex = publicKeyHex(privateKey);
  const delegatedKeyId = releaseKeyId(publicHex);
  if (
    store.schemaVersion !== 1 ||
    store.type !== "mkttool.delegated-release-key-store" ||
    delegatedKeyId !== store.delegatedKeyId ||
    publicHex !== store.delegatedPublicKeyHex ||
    delegatedKeyId !== delegation.delegation.delegatedKeyId ||
    manifest.delegatedKeyId !== delegatedKeyId
  ) {
    throw new Error("The manifest, delegation, and DPAPI delegated key do not identify the same key.");
  }
  const signed = signCompatibilityManifest(privateKey, delegation, manifest, new Date().toISOString());
  writeFileSync(args.output, `${JSON.stringify(signed, null, 2)}\n`, { encoding: "utf8", flag: "wx" });
  console.log(`Signed compatibility manifest sequence ${manifest.sequence}.`);
  console.log(`Delegated key: ${delegatedKeyId}`);
  console.log(`Output: ${args.output}`);
} finally {
  seed.fill(0);
}

function readJson<T = unknown>(filePath: string): T {
  return JSON.parse(readFileSync(filePath, "utf8")) as T;
}

function parseArgs(values: string[]): {
  manifest: string;
  delegation: string;
  output: string;
  storeDirectory: string;
} {
  const parsed = new Map<string, string>();
  for (let index = 0; index < values.length; index += 2) {
    const name = values[index];
    const value = values[index + 1];
    if (!name?.startsWith("--") || !value) throw new Error(usage());
    parsed.set(name.slice(2), value);
  }
  const manifest = parsed.get("manifest");
  const delegation = parsed.get("delegation");
  const output = parsed.get("output");
  if (!manifest || !delegation || !output) throw new Error(usage());
  const defaultStore = path.join(
    process.env.LOCALAPPDATA ?? path.join(os.homedir(), "AppData", "Local"),
    "MKTTool",
    "release-signing-authority",
  );
  return {
    manifest: path.resolve(manifest),
    delegation: path.resolve(delegation),
    output: path.resolve(output),
    storeDirectory: path.resolve(parsed.get("store-dir") ?? defaultStore),
  };
}

function usage(): string {
  return "Usage: npm run release:manifest:sign -- --manifest <json> --delegation <json> --output <json> [--store-dir <path>]";
}
