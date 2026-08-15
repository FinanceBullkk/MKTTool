import { randomBytes, createPrivateKey, createPublicKey } from "node:crypto";
import { describe, expect, it } from "vitest";
import { publicKeyHex } from "../../../scripts/release-authority/release-authority-key-primitives.mjs";
import {
  compatibilityArtifactAuthorizationMatches,
  encodeCompatibilityArtifactAuthorization,
  signCompatibilityUpdateAuthorization,
  verifyCompatibilityUpdateAuthorization,
} from "./compatibility-update-authorization";

const NOW = new Date("2026-08-15T05:00:00.000Z");

describe("compatibility update authorization", () => {
  it("binds one short-lived command and longer artifact access to a device and manifest", () => {
    const fixture = createFixture();
    expect(verify(fixture)).toEqual(fixture.authorization);
    const header = encodeCompatibilityArtifactAuthorization(fixture.authorization);
    expect(
      compatibilityArtifactAuthorizationMatches(header, {
        serverPublicKeyHex: fixture.publicKeyHex,
        requestPath: fixture.path,
        now: new Date(NOW.getTime() + 30 * 60 * 1000),
      }),
    ).toBe(true);
    expect(() =>
      verifyCompatibilityUpdateAuthorization(fixture.authorization, {
        serverPublicKeyHex: fixture.publicKeyHex,
        deviceId: fixture.deviceId,
        sequence: fixture.sequence,
        manifestDigest: fixture.manifestDigest,
        manifestArtifactUrls: fixture.manifestArtifactUrls,
        now: new Date(NOW.getTime() + 60_000),
      }),
    ).toThrow("expired");
    expect(
      compatibilityArtifactAuthorizationMatches(header, {
        serverPublicKeyHex: fixture.publicKeyHex,
        requestPath: fixture.path,
        now: new Date(NOW.getTime() + 60 * 60 * 1000),
      }),
    ).toBe(false);
  });

  it("rejects tampering, wrong manifests, non-ADMIN repair, and unrelated artifact paths", () => {
    const fixture = createFixture();
    expect(() =>
      verify({
        ...fixture,
        authorization: { ...fixture.authorization, sequence: 3 },
      }),
    ).toThrow("signature");
    expect(() =>
      verify({ ...fixture, manifestDigest: "b".repeat(64) }),
    ).toThrow("does not match");

    const operator = createFixture({ authorizedRole: "OPERATOR", repairMissingState: true });
    expect(() => verify(operator)).toThrow("Only ADMIN");
    const header = encodeCompatibilityArtifactAuthorization(fixture.authorization);
    expect(
      compatibilityArtifactAuthorizationMatches(header, {
        serverPublicKeyHex: fixture.publicKeyHex,
        requestPath: "/api/relay/download/v12/artifact/browser",
        now: NOW,
      }),
    ).toBe(false);
  });
});

function createFixture(
  overrides: Partial<Parameters<typeof signCompatibilityUpdateAuthorization>[1]> = {},
) {
  const privateKey = createPrivateKey({
    key: Buffer.concat([
      Buffer.from("302e020100300506032b657004220420", "hex"),
      randomBytes(32),
    ]),
    format: "der",
    type: "pkcs8",
  });
  const path = "/api/relay/download/v12/artifact/installer";
  const authorization = signCompatibilityUpdateAuthorization(privateKey, {
    schemaVersion: 1,
    type: "mkttool.compatibility-update-authorization",
    authorizationId: "741d4377-4c55-4fb0-8c41-133aaa15057a",
    actorUserId: "admin",
    authorizedRole: "ADMIN",
    deviceId: "device-1",
    sequence: 2,
    manifestDigest: "a".repeat(64),
    repairMissingState: true,
    authenticatedArtifactPaths: [path],
    issuedAt: NOW.toISOString(),
    commandExpiresAt: new Date(NOW.getTime() + 60_000).toISOString(),
    artifactExpiresAt: new Date(NOW.getTime() + 60 * 60 * 1000).toISOString(),
    ...overrides,
  });
  return {
    authorization,
    publicKeyHex: publicKeyHex(createPublicKey(privateKey)),
    deviceId: "device-1",
    sequence: 2,
    manifestDigest: "a".repeat(64),
    manifestArtifactUrls: [`https://mkttool.example.com${path}`],
    path,
  };
}

function verify(fixture: ReturnType<typeof createFixture>) {
  return verifyCompatibilityUpdateAuthorization(fixture.authorization, {
    serverPublicKeyHex: fixture.publicKeyHex,
    deviceId: fixture.deviceId,
    sequence: fixture.sequence,
    manifestDigest: fixture.manifestDigest,
    manifestArtifactUrls: fixture.manifestArtifactUrls,
    now: NOW,
  });
}
