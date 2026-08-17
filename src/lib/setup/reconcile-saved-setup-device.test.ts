import { describe, expect, it } from "vitest";
import { reconcileSavedSetupDevice } from "./reconcile-saved-setup-device";

const owner = "owner-user";

describe("reconcileSavedSetupDevice", () => {
  it("leaves missing local storage as a non-authoritative empty hint", () => {
    expect(
      reconcileSavedSetupDevice({ savedDeviceId: null, liveDeviceId: null, device: { status: "not-enrolled" }, viewerUserId: owner }),
    ).toEqual({ storage: "unchanged" });
  });

  it("clears a stale hint after a revoked Relay identity is reset", () => {
    expect(
      reconcileSavedSetupDevice({ savedDeviceId: "revoked-device", liveDeviceId: null, device: { status: "not-enrolled" }, viewerUserId: owner }),
    ).toEqual({ storage: "clear" });
  });

  it("clears the enrollment hint while local retirement confirmation is pending", () => {
    expect(
      reconcileSavedSetupDevice({
        savedDeviceId: "retired-device",
        liveDeviceId: "retired-device",
        device: { status: "retirement-pending" },
        viewerUserId: owner,
      }),
    ).toEqual({ storage: "clear" });
  });

  it("replaces a stale hint with the live same-owner device", () => {
    expect(
      reconcileSavedSetupDevice({
        savedDeviceId: "old-device",
        liveDeviceId: "new-device",
        device: { status: "enrolled", ownerUserId: owner, operatorKeyReady: true },
        viewerUserId: owner,
      }),
    ).toEqual({ storage: "replace", deviceId: "new-device" });
  });

  it("keeps a matching same-owner hint", () => {
    expect(
      reconcileSavedSetupDevice({
        savedDeviceId: "same-device",
        liveDeviceId: "same-device",
        device: { status: "enrolled", ownerUserId: owner, operatorKeyReady: true },
        viewerUserId: owner,
      }),
    ).toEqual({ storage: "unchanged" });
  });

  it("clears stale hints without adopting a different-owner or revoked device", () => {
    expect(
      reconcileSavedSetupDevice({
        savedDeviceId: "old-device",
        liveDeviceId: "other-device",
        device: { status: "enrolled", ownerUserId: "other-user", conflict: "wrong-signed-in-user" },
        viewerUserId: owner,
      }),
    ).toEqual({ storage: "clear" });
    expect(
      reconcileSavedSetupDevice({
        savedDeviceId: "revoked-device",
        liveDeviceId: "revoked-device",
        device: { status: "enrolled", revoked: true, conflict: "revoked-key" },
        viewerUserId: owner,
      }),
    ).toEqual({ storage: "clear" });
  });
});
