import { createHash } from "node:crypto";
import { mkdtempSync, writeFileSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { vi } from "vitest";
import {
  buildDelegationRequest,
  privateKeyFromSeed,
  publicKeyHex,
  releaseKeyId,
  signDelegation,
} from "./release-authority/release-authority-format.mjs";
import { signCompatibilityManifest } from "../src/lib/release/compatibility-manifest-crypto";
import {
  signedDelegationSchema,
  type CompatibilityManifest,
} from "../src/lib/release/compatibility-manifest-schema";
import { RELAY_VERSION } from "../src/lib/relay/relay-endpoints";
import type { getObject, headObject, putObject, R2ObjectInfo } from "../src/lib/r2/r2-client";
import type { CompatibilityPublishArguments } from "./prepare-compatibility-publication";

export const PUBLICATION_TEST_NOW = new Date("2026-09-08T00:00:00.000Z");
const rootKey = privateKeyFromSeed(Buffer.alloc(32, 71));
const rootPublicHex = publicKeyHex(rootKey);
export const publicationTestRootTrust = {
  rootKeyId: releaseKeyId(rootPublicHex),
  publicKeyHex: rootPublicHex,
};
export const publicationTestConfig = {
  accountId: "test-account", bucket: "test-releases", accessKeyId: "test-key", secretAccessKey: "test-secret",
};

export function createPublicationFixture() {
  const directory = mkdtempSync(path.join(os.tmpdir(), "mkt-publication-test-"));
  const args = Object.fromEntries(
    ["manifest", "revocations", "installer", "relay", "browser", "controlContract", "engine"]
      .map((name) => [name, path.join(directory, name)]),
  ) as unknown as CompatibilityPublishArguments;
  const bodies = {
    installer: Buffer.from("test installer"), relay: Buffer.from("test relay"),
    browser: Buffer.from("test browser"), engine: Buffer.from("test engine"),
    controlContract: Buffer.from(JSON.stringify({
      schemaVersion: 1, type: "mktbrowser.windows-control-contract", appVersion: "0.3.13",
      contractVersion: 4, profileSchemaVersion: 3,
    })),
  };
  for (const [name, body] of Object.entries(bodies)) {
    writeFileSync(args[name as keyof typeof bodies], body);
  }
  const delegatedKey = privateKeyFromSeed(Buffer.alloc(32, 72));
  const request = buildDelegationRequest({
    publicHex: publicKeyHex(delegatedKey), createdAt: "2026-08-14T00:00:00.000Z",
    notBefore: "2026-08-14T00:00:00.000Z", expiresAt: "2027-08-14T00:00:00.000Z", label: "test-only",
  });
  const delegation = signedDelegationSchema.parse(signDelegation(
    rootKey, publicationTestRootTrust.rootKeyId, request, "2026-08-14T00:01:00.000Z",
  ));
  const artifact = (name: keyof typeof bodies, version: string) => ({
    version, sizeBytes: bodies[name].length,
    sha256: createHash("sha256").update(bodies[name]).digest("hex"),
    url: `https://releases.example/api/relay/download/v${RELAY_VERSION}/artifact/${name === "controlContract" ? "control-contract" : name}`,
  });
  const manifest: CompatibilityManifest = {
    schemaVersion: 1, type: "mkttool.windows.compatibility-manifest", sequence: 1,
    channel: "pilot", platform: "windows-x64", issuedAt: "2026-09-07T00:00:00.000Z",
    expiresAt: "2026-09-14T00:00:00.000Z", delegatedKeyId: request.delegatedKeyId,
    transition: { fromSequences: [0], retainedSequence: null },
    artifacts: {
      installer: { ...artifact("installer", "0.3.13"), kind: "installer" },
      relay: { ...artifact("relay", String(RELAY_VERSION)), kind: "relay", supportedBrowserContract: { min: 1, max: 4 }, secureStoreSchemaVersion: 2 },
      browser: { ...artifact("browser", "0.3.13"), kind: "browser", contractVersion: 4, profileSchemaVersion: 3, engineKind: "cft" },
      controlContract: { ...artifact("controlContract", "4"), kind: "control-contract", contractVersion: 4 },
      engine: { ...artifact("engine", "152.0.7977.64"), kind: "engine", engineKind: "cft" },
    },
  };
  const sign = () => {
    const signed = signCompatibilityManifest(delegatedKey, delegation, manifest, "2026-09-07T00:01:00.000Z");
    writeFileSync(args.manifest, JSON.stringify(signed));
    return signed;
  };
  sign();
  writeFileSync(args.revocations, "[]");
  return { directory, args, bodies, manifest, sign };
}

export function createPublicationStorage() {
  const events: string[] = [];
  const objects = new Map<string, { body: Buffer; info: R2ObjectInfo }>();
  const storage = {
    headObject: vi.fn<typeof headObject>(async ({ key }) => {
      events.push(`HEAD ${key}`);
      return objects.get(key)?.info ?? null;
    }),
    getObject: vi.fn<typeof getObject>(async ({ key }) => {
      events.push(`GET ${key}`);
      const object = objects.get(key);
      if (!object) throw new Error("Missing test object.");
      return { info: object.info, body: new Response(new Uint8Array(object.body)).body! };
    }),
    putObject: vi.fn<typeof putObject>(async ({ key, body, metadata, ifNoneMatch }) => {
      events.push(`PUT ${key}`);
      if (ifNoneMatch !== "*" || objects.has(key)) throw new Error("PreconditionFailed");
      objects.set(key, {
        body: Buffer.from(body),
        info: { sizeBytes: body.length, metadata: { ...metadata }, lastModified: PUBLICATION_TEST_NOW },
      });
    }),
  };
  return { storage, objects, events };
}
