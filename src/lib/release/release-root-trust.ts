import rootPublic from "../../../plans/260812-1301-mkb-03-windows-onboarding-and-installer/release-authority-public-evidence/root-public.json";

/** This trust anchor is bundled directly from the verified physical-ceremony public evidence. */
export const WINDOWS_RELEASE_ROOT_TRUST = Object.freeze({
  rootKeyId: rootPublic.rootKeyId,
  publicKeyHex: rootPublic.publicKeyHex,
});

export type ReleaseRootTrust = typeof WINDOWS_RELEASE_ROOT_TRUST;
