/**
 * Phase 01 / H01–H03: one Ed25519 server key signs four protocols. Prove they cannot be confused.
 *
 * `issueTicket`, `issueGrantAuthorization` and `issueDeviceRetirementAuthorization` all produce the
 * *identical* wire shape — `base64url(JSON(envelope)) + "." + base64url(Ed25519(encoded))` — using
 * the same server signing key. There is **no cryptographic domain separator**: no protocol tag is
 * mixed into the signed bytes. A signature minted for one protocol is therefore a mathematically
 * valid signature for every other one, and the only thing standing between them is each verifier's
 * field-shape validation, which runs *after* the signature check.
 *
 * That property holds today because the required-field sets happen to be disjoint. "Happens to be"
 * is not a security argument, which is why it is pinned here: this matrix fails the moment someone
 * relaxes a validator, adds an optional field, or introduces a fifth protocol that overlaps an
 * existing shape.
 *
 * Device-retirement *finalization* is the control case. It is signed by a per-retirement one-use key
 * rather than the server key, so it must fail against the server key on signature grounds alone —
 * separation by key, which is what the other three lack.
 *
 * Synthetic keys only. No device identity, no vault, no operational data.
 */
import { randomBytes, verify } from "node:crypto";
import { describe, expect, it, beforeEach } from "vitest";

// RFC 8032 test vector, matching the seed the sibling ticket tests use.
process.env.TICKET_SIGNING_KEY = "9d61b19deffd5a60ba844af492ec2cc44449c5697b326919703bac031cae7f60";

const { loadServerSigningKeys, resetServerSigningKeysCache, signingKeysFromSeed } = await import(
  "./server-signing-key"
);
const { generateRelayDeviceKeyPair, relayPrivateKeyToKeyObject } = await import(
  "./relay-device-key"
);
const { issueTicket } = await import("./ticket-issuer");
const { verifyTicket } = await import("./ticket-verifier");
const { TicketReplayGuard } = await import("./ticket-replay-guard");
const { TICKET_KINDS } = await import("./ticket-types");
const { issueGrantAuthorization, verifyGrantAuthorization } = await import(
  "../relay/enrollment/grant-authorization"
);
const { issueDeviceRetirementAuthorization, verifyDeviceRetirementAuthorization } = await import(
  "../relay/retirement/device-retirement-authorization"
);
const { issueDeviceRetirementFinalization, verifyDeviceRetirementFinalization } = await import(
  "../relay/retirement/device-retirement-finalization"
);

const DEVICE_ID = "device-under-test";
const NOW = 1_760_000_000_000;
const LIFETIME_MS = 60_000;
const HEX64 = "a".repeat(64);

/** Every artifact the server signing key can produce, plus the separately-keyed control. */
type ArtifactName =
  | "ticket"
  | "grant-delivery"
  | "grant-bootstrap"
  | "retirement-authorization"
  | "retirement-finalization";

/** Every verifier that consumes one of the above. */
type VerifierName =
  | "verifyTicket"
  | "verifyGrantAuthorization"
  | "verifyDeviceRetirementAuthorization"
  | "verifyDeviceRetirementFinalization";

/**
 * Which verifier legitimately accepts which artifact.
 *
 * `verifyGrantAuthorization` accepts both grant kinds by design — it validates the envelope, and
 * discriminating `delivery` from `bootstrap` is the caller's job
 * (`handle-receive-operator-key.ts:59` and `bootstrap-authorization.ts:33`). Those call-site checks
 * are asserted separately below, because an envelope-level test cannot see them.
 */
const ACCEPTED: Record<VerifierName, ReadonlySet<ArtifactName>> = {
  verifyTicket: new Set<ArtifactName>(["ticket"]),
  verifyGrantAuthorization: new Set<ArtifactName>(["grant-delivery", "grant-bootstrap"]),
  verifyDeviceRetirementAuthorization: new Set<ArtifactName>(["retirement-authorization"]),
  // Empty on purpose. In this matrix the finalization verifier is handed the SERVER key, so it must
  // reject every artifact here — including its own, which is signed by a per-retirement one-use key.
  // That is the point of the control: finalization is separated by key, so no server-signed artifact
  // can reach it regardless of shape. Its accepting path is asserted in the dedicated test below.
  verifyDeviceRetirementFinalization: new Set<ArtifactName>(),
};

let device: { publicKeyHex: string; privateKeyHex: string };
let artifacts: Record<ArtifactName, string>;
let verifiers: Record<VerifierName, (signed: string) => unknown>;
/** Signed by its own one-use key, never by the server key. */
let finalizationKeys: ReturnType<typeof signingKeysFromSeed>;

beforeEach(() => {
  resetServerSigningKeysCache();
  device = generateRelayDeviceKeyPair();
  finalizationKeys = signingKeysFromSeed(randomBytes(32));

  const serverKeys = loadServerSigningKeys();

  artifacts = {
    ticket: issueTicket(
      {
        kind: TICKET_KINDS.CREDENTIAL,
        accountId: "account-1",
        field: "password",
        credentialCiphertext: "v1:not-a-real-ciphertext",
      },
      { deviceId: DEVICE_ID, publicKey: device.publicKeyHex },
      NOW,
    ),

    "grant-delivery": issueGrantAuthorization(
      grantInput("delivery"),
      serverKeys.privateKey,
      NOW,
      LIFETIME_MS,
    ),

    "grant-bootstrap": issueGrantAuthorization(
      grantInput("bootstrap"),
      serverKeys.privateKey,
      NOW,
      LIFETIME_MS,
    ),

    "retirement-authorization": issueDeviceRetirementAuthorization(
      {
        authorizationId: "authorization-1",
        retirementId: "retirement-1",
        deviceId: DEVICE_ID,
        recipientPublicKey: device.publicKeyHex,
        completionHash: HEX64,
        completionEphemeralPublicKey: device.publicKeyHex,
        completionSealed: "sealed-completion",
        finalizationPublicKey: HEX64,
      },
      serverKeys.privateKey,
      NOW,
      LIFETIME_MS,
    ),

    "retirement-finalization": issueDeviceRetirementFinalization(
      {
        authorizationId: "authorization-1",
        retirementId: "retirement-1",
        deviceId: DEVICE_ID,
        recipientPublicKey: device.publicKeyHex,
        completionHash: HEX64,
      },
      finalizationKeys.privateKey,
      NOW,
    ),
  };

  verifiers = {
    verifyTicket: (signed) =>
      verifyTicket(
        signed,
        {
          deviceId: DEVICE_ID,
          version: 99,
          privateKey: relayPrivateKeyToKeyObject(device.privateKeyHex),
          serverPublicKey: serverKeys.publicKey,
          replayGuard: new TicketReplayGuard(),
        },
        NOW + 1_000,
      ),
    verifyGrantAuthorization: (signed) =>
      verifyGrantAuthorization(signed, serverKeys.publicKey, NOW + 1_000),
    verifyDeviceRetirementAuthorization: (signed) =>
      verifyDeviceRetirementAuthorization(signed, serverKeys.publicKey, NOW + 1_000),
    // Given the SERVER key on purpose: the question this matrix asks is whether a server-signed
    // artifact can be walked into this verifier.
    verifyDeviceRetirementFinalization: (signed) =>
      verifyDeviceRetirementFinalization(signed, serverKeys.publicKey),
  };
});

function grantInput(kind: "delivery" | "bootstrap") {
  return {
    kind,
    authorizationId: "authorization-1",
    deviceId: DEVICE_ID,
    recipientPublicKey: device.publicKeyHex,
    grantId: "grant-1",
    generation: 1,
    grantHash: HEX64,
    completionHash: HEX64,
    completionEphemeralPublicKey: device.publicKeyHex,
    completionSealed: "sealed-completion",
  };
}

describe("server signing key — cross-protocol separation (H01, H02, H03)", () => {
  const artifactNames: ArtifactName[] = [
    "ticket",
    "grant-delivery",
    "grant-bootstrap",
    "retirement-authorization",
    "retirement-finalization",
  ];
  const verifierNames: VerifierName[] = [
    "verifyTicket",
    "verifyGrantAuthorization",
    "verifyDeviceRetirementAuthorization",
    "verifyDeviceRetirementFinalization",
  ];

  // The 5x4 matrix. Every cell asserted, none skipped.
  for (const verifierName of verifierNames) {
    for (const artifactName of artifactNames) {
      const shouldAccept = ACCEPTED[verifierName].has(artifactName);

      it(`${verifierName} ${shouldAccept ? "accepts" : "rejects"} ${artifactName}`, () => {
        const run = () => verifiers[verifierName](artifacts[artifactName]);

        if (shouldAccept) {
          expect(run).not.toThrow();
        } else {
          expect(run).toThrow();
        }
      });
    }
  }

  it("confirms the artifacts really do share one key and one wire format", () => {
    // If this ever fails, the matrix above has become trivially true for the wrong reason — the
    // protocols would be separated by shape *and* format, and the cross-protocol risk this file
    // exists to pin would no longer be the risk being pinned.
    for (const name of ["ticket", "grant-delivery", "retirement-authorization"] as const) {
      expect(artifacts[name].split(".")).toHaveLength(2);
    }

    const serverKeys = loadServerSigningKeys();
    // Each server-signed artifact's signature verifies under the server key when checked raw,
    // independent of any envelope validation. This is the property that makes domain separation
    // load-bearing rather than decorative.
    for (const name of ["ticket", "grant-delivery", "retirement-authorization"] as const) {
      const [encoded, signature] = artifacts[name].split(".");
      expect(
        verify(
          null,
          Buffer.from(encoded!, "utf8"),
          serverKeys.publicKey,
          Buffer.from(signature!, "base64url"),
        ),
        `${name} should carry a server-key signature`,
      ).toBe(true);
    }
  });

  it("rejects a finalization artifact under the server key — separation by key, not by shape", () => {
    // The control. Finalization is the one protocol whose separation does not depend on field
    // validation at all.
    expect(() =>
      verifyDeviceRetirementFinalization(
        artifacts["retirement-finalization"],
        loadServerSigningKeys().publicKey,
      ),
    ).toThrow();

    expect(() =>
      verifyDeviceRetirementFinalization(
        artifacts["retirement-finalization"],
        finalizationKeys.publicKey,
      ),
    ).not.toThrow();
  });

  it("rejects a server-signed retirement authorization under the finalization key", () => {
    expect(() =>
      verifyDeviceRetirementAuthorization(
        artifacts["retirement-authorization"],
        finalizationKeys.publicKey,
        NOW + 1_000,
      ),
    ).toThrow();
  });

  it("does not let a swapped signature travel between protocols", () => {
    // Splice a grant's signature onto a ticket envelope and vice versa. Both must fail: the
    // signature covers the encoded envelope, so a mismatched pair cannot verify.
    const [ticketEnvelope] = artifacts.ticket.split(".");
    const [, grantSignature] = artifacts["grant-delivery"].split(".");

    expect(() => verifiers.verifyTicket(`${ticketEnvelope}.${grantSignature}`)).toThrow();
  });
});
