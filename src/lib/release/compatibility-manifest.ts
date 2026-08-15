import { publicKeyFromHex, releaseKeyId } from "../../../scripts/release-authority/release-authority-key-primitives.mjs";
import { verifySignedDelegation } from "../../../scripts/release-authority/release-authority-format.mjs";
import {
  signedCompatibilityManifestSchema,
  signedDelegationRevocationSchema,
  type CompatibilityManifest,
  type SignedCompatibilityManifest,
} from "./compatibility-manifest-schema";
import {
  signedManifestDigest,
  verifyManifestSignature,
  verifyRevocationSignature,
} from "./compatibility-manifest-crypto";
import { WINDOWS_RELEASE_ROOT_TRUST, type ReleaseRootTrust } from "./release-root-trust";

const CLOCK_SKEW_MS = 5 * 60 * 1000;

export interface CompatibilityValidationState {
  highestAcceptedSequence: number;
  currentSequence: number | null;
  installerFloorSequence: number;
  pending?: { sequence: number; manifestDigest: string };
}

export interface ValidateCompatibilityManifestOptions {
  state: CompatibilityValidationState;
  now?: Date;
  rootTrust?: ReleaseRootTrust;
  revocations?: unknown[];
  /**
   * Revoked delegated key ids this device has already proven and remembered.
   *
   * Revocation statements arrive in the caller's payload, and a root signature makes them
   * unforgeable — but not unomittable. Whoever serves the update decides which statements to
   * include, so a holder of a compromised-then-revoked delegated key only has to leave the
   * statement out. Anti-downgrade already treats "highest sequence seen" as monotonic local
   * memory for exactly this reason; revocation is the same shape of fact and gets the same
   * treatment.
   */
  knownRevokedDelegatedKeyIds?: string[];
}

export interface VerifiedCompatibilityManifest {
  signed: SignedCompatibilityManifest;
  manifest: CompatibilityManifest;
  manifestDigest: string;
  /**
   * Root-signed revoked key ids proven by this payload. Callers persist these so the fact
   * survives a later payload that omits them.
   */
  observedRevokedDelegatedKeyIds: string[];
}

export function validateCompatibilityManifest(
  input: unknown,
  options: ValidateCompatibilityManifestOptions,
): VerifiedCompatibilityManifest {
  const signed = signedCompatibilityManifestSchema.parse(input);
  const now = (options.now ?? new Date()).getTime();
  const rootTrust = options.rootTrust ?? WINDOWS_RELEASE_ROOT_TRUST;
  const rootKeyId = releaseKeyId(rootTrust.publicKeyHex);
  if (rootKeyId !== rootTrust.rootKeyId) throw new Error("The pinned release root fingerprint is invalid.");

  const rootKey = publicKeyFromHex(rootTrust.publicKeyHex);
  const delegation = signed.delegation.delegation;
  if (signed.delegation.rootKeyId !== rootKeyId) {
    throw new Error("The compatibility manifest uses the wrong release root.");
  }
  verifySignedDelegation(rootKey, signed.delegation);
  if (releaseKeyId(delegation.delegatedPublicKeyHex) !== delegation.delegatedKeyId) {
    throw new Error("The delegated release key fingerprint is invalid.");
  }
  if (signed.manifest.delegatedKeyId !== delegation.delegatedKeyId) {
    throw new Error("The manifest does not name the key that signed it.");
  }
  const observedRevokedDelegatedKeyIds = rejectRevokedDelegation(
    rootKey,
    rootKeyId,
    delegation.delegatedKeyId,
    options.revocations ?? [],
    options.knownRevokedDelegatedKeyIds ?? [],
    now,
  );
  validateAuthorityWindow(signed, now);
  if (!verifyManifestSignature(signed)) throw new Error("The compatibility manifest signature is invalid.");

  const manifestDigest = signedManifestDigest(signed);
  validateSequence(signed.manifest, manifestDigest, options.state);
  validateTuple(signed.manifest);
  return { signed, manifest: signed.manifest, manifestDigest, observedRevokedDelegatedKeyIds };
}

function validateAuthorityWindow(signed: SignedCompatibilityManifest, now: number): void {
  const delegation = signed.delegation.delegation;
  const signedAt = Date.parse(signed.signedAt);
  const issuedAt = Date.parse(signed.manifest.issuedAt);
  const manifestExpires = Date.parse(signed.manifest.expiresAt);
  const notBefore = Date.parse(delegation.notBefore);
  const delegationExpires = Date.parse(delegation.expiresAt);
  if (signedAt > now + CLOCK_SKEW_MS || issuedAt > signedAt || manifestExpires <= now) {
    throw new Error("The compatibility manifest is stale or has an invalid signing time.");
  }
  if (signedAt < notBefore || now >= delegationExpires || manifestExpires > delegationExpires) {
    throw new Error("The delegated release authority is inactive or expired.");
  }
}

function validateSequence(
  manifest: CompatibilityManifest,
  manifestDigest: string,
  state: CompatibilityValidationState,
): void {
  if (manifest.sequence < state.installerFloorSequence) {
    throw new Error("The compatibility manifest is below the installer anti-downgrade floor.");
  }
  const isPendingReplay =
    state.pending?.sequence === manifest.sequence && state.pending.manifestDigest === manifestDigest;
  if (manifest.sequence <= state.highestAcceptedSequence && !isPendingReplay) {
    throw new Error("The compatibility manifest is replayed or attempts a downgrade.");
  }
  if (state.currentSequence !== null && manifest.sequence <= state.currentSequence && !isPendingReplay) {
    throw new Error("The compatibility manifest is not newer than the active compatibility set.");
  }
  const fromSequence = state.currentSequence ?? 0;
  if (!manifest.transition.fromSequences.includes(fromSequence)) {
    throw new Error("The compatibility manifest does not allow the current sequence to transition.");
  }
  const expectedRetained = state.currentSequence;
  if (manifest.transition.retainedSequence !== expectedRetained) {
    throw new Error("The compatibility manifest names the wrong retained rollback sequence.");
  }
  const unique = new Set(manifest.transition.fromSequences);
  if (unique.size !== manifest.transition.fromSequences.length) {
    throw new Error("The compatibility manifest contains duplicate transition sequences.");
  }
}

function validateTuple(manifest: CompatibilityManifest): void {
  const { relay, browser, controlContract, engine } = manifest.artifacts;
  const contract = controlContract.contractVersion;
  if (
    browser.contractVersion !== contract ||
    contract < relay.supportedBrowserContract.min ||
    contract > relay.supportedBrowserContract.max
  ) {
    throw new Error("The Relay, Browser, and control-contract tuple is incompatible.");
  }
  if (browser.engineKind !== engine.engineKind) {
    throw new Error("The Browser and engine tuple is incompatible.");
  }
}

function rejectRevokedDelegation(
  rootKey: ReturnType<typeof publicKeyFromHex>,
  rootKeyId: string,
  delegatedKeyId: string,
  inputs: unknown[],
  knownRevokedDelegatedKeyIds: string[],
  now: number,
): string[] {
  // Remembered revocations are checked first and cannot be argued away by the payload. Reaching
  // this line already proved the delegation chain, so without this check a valid-looking chain
  // signed by a key we know is dead would pass simply because nobody handed us the statement.
  if (knownRevokedDelegatedKeyIds.includes(delegatedKeyId)) {
    throw new Error("The delegated release key has been revoked.");
  }

  const observed: string[] = [];
  for (const input of inputs) {
    const revocation = signedDelegationRevocationSchema.parse(input);
    if (revocation.rootKeyId !== rootKeyId || !verifyRevocationSignature(rootKey, revocation)) {
      throw new Error("A release delegation revocation statement is invalid.");
    }
    // Only statements already in force are recorded. A future-dated revocation is a real signed
    // fact but not yet a reason to refuse, and remembering it early would revoke a key ahead of
    // the moment its owner chose.
    if (Date.parse(revocation.revokedAt) > now) continue;
    if (!observed.includes(revocation.delegatedKeyId)) observed.push(revocation.delegatedKeyId);
    if (revocation.delegatedKeyId === delegatedKeyId) {
      throw new Error("The delegated release key has been revoked.");
    }
  }
  return observed;
}

export type {
  CompatibilityManifest,
  SignedCompatibilityManifest,
  SignedDelegation,
  SignedDelegationRevocation,
} from "./compatibility-manifest-schema";
