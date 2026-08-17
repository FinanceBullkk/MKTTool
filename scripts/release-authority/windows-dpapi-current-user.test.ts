import { randomBytes } from "node:crypto";
import { describe, expect, it } from "vitest";
import {
  protectForCurrentWindowsUser,
  unprotectForCurrentWindowsUser,
} from "./windows-dpapi-current-user";

describe.runIf(process.platform === "win32")("release-authority DPAPI storage", () => {
  it("round-trips opaque key bytes without placing plaintext in the blob", () => {
    const secret = randomBytes(32);
    const protectedValue = protectForCurrentWindowsUser(secret);

    expect(Buffer.from(protectedValue, "base64")).not.toEqual(secret);
    expect(unprotectForCurrentWindowsUser(protectedValue)).toEqual(secret);
  }, 15_000);
});
