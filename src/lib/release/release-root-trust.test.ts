import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { publicKeyFromHex, releaseKeyId } from "../../../scripts/release-authority/release-authority-key-primitives.mjs";
import { verifySignedDelegation } from "../../../scripts/release-authority/release-authority-format.mjs";
import { WINDOWS_RELEASE_ROOT_TRUST } from "./release-root-trust";

const EVIDENCE_DIR = path.join(
  process.cwd(),
  "plans",
  "260812-1301-mkb-03-windows-onboarding-and-installer",
  "release-authority-public-evidence",
);

describe("production Windows release trust", () => {
  it("is sourced from the verified public evidence and verifies the first delegation", () => {
    const root = JSON.parse(readFileSync(path.join(EVIDENCE_DIR, "root-public.json"), "utf8"));
    const delegation = JSON.parse(
      readFileSync(path.join(EVIDENCE_DIR, "signed-delegation.json"), "utf8"),
    );
    expect(WINDOWS_RELEASE_ROOT_TRUST).toEqual({
      rootKeyId: root.rootKeyId,
      publicKeyHex: root.publicKeyHex,
    });
    expect(releaseKeyId(root.publicKeyHex)).toBe(root.rootKeyId);
    expect(
      verifySignedDelegation(publicKeyFromHex(root.publicKeyHex), delegation).delegation.delegatedKeyId,
    ).toBe("6e5d47d894206e69e6464748333eb76c99b18da1f1b42ddafb2e3f265a7b786e");
  });
});
