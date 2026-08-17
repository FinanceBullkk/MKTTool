import rootPublic from "./release-authority-public-evidence/root-public.json";

/**
 * This trust anchor is bundled directly from the verified physical-ceremony public evidence.
 *
 * The evidence lives beside this module rather than under `plans/`, where it originally sat next to
 * the ceremony write-up. Every operator device accepts engine and Relay updates on the strength of
 * this constant, and `plans/` is a records area — reorganised freely and reviewed as documentation.
 * A trust root should not be reachable by a path that a documentation cleanup can move.
 *
 * `release-root-trust.test.ts` binds this constant to the evidence and to the first delegation, so
 * an edit here that is not matched in both files fails the suite.
 */
export const WINDOWS_RELEASE_ROOT_TRUST = Object.freeze({
  rootKeyId: rootPublic.rootKeyId,
  publicKeyHex: rootPublic.publicKeyHex,
});

export type ReleaseRootTrust = typeof WINDOWS_RELEASE_ROOT_TRUST;
