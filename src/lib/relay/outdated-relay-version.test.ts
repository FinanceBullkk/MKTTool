/**
 * Dải "cầu nối bản cũ" chỉ được kêu khi **biết chắc**.
 *
 * Hai kiểu sai đều tốn kém theo cách riêng: kêu nhầm thì dạy người ta phớt lờ chính cái dải sẽ
 * quan trọng vào ngày nâng `MIN_RELAY_VERSION`; im lặng nhầm thì cả team phát hiện cùng lúc,
 * đúng lúc vé bắt đầu bị từ chối.
 */
import { describe, expect, it } from "vitest";
import {
  outdatedRelayVersion,
  relaySupportsDeviceRetirement,
  type RelayOutcome,
} from "./relay-browser-client";
import { RELAY_DEVICE_RETIREMENT_MIN_VERSION, RELAY_VERSION } from "./relay-endpoints";

const OLD = RELAY_VERSION - 1;

describe("outdatedRelayVersion", () => {
  it("returns the version when Relay responds with an outdated version", () => {
    const outcome: RelayOutcome<unknown> = { status: "ok", data: {}, relayVersion: OLD };
    expect(outdatedRelayVersion(outcome)).toBe(OLD);
  });

  it("warns even when Relay rejects the request", () => {
    // Bản quá cũ tới mức vé bị chặn (`RELAY_TOO_OLD`) đi ra bằng đúng nhánh này.
    const outcome: RelayOutcome<unknown> = {
      status: "rejected",
      message: "This Relay version is too old",
      relayVersion: OLD,
    };
    expect(outdatedRelayVersion(outcome)).toBe(OLD);
  });

  it("stays silent when the running version matches the release", () => {
    const outcome: RelayOutcome<unknown> = { status: "ok", data: {}, relayVersion: RELAY_VERSION };
    expect(outdatedRelayVersion(outcome)).toBeNull();
  });

  it("stays silent when Relay runs a newer version than the server", () => {
    // Xảy ra thật lúc một máy cài bản vừa build còn máy chủ chưa deploy. Không phải lỗi, và
    // càng không phải lý do bảo người ta "tải bản mới".
    const outcome: RelayOutcome<unknown> = {
      status: "ok",
      data: {},
      relayVersion: RELAY_VERSION + 1,
    };
    expect(outdatedRelayVersion(outcome)).toBeNull();
  });

  it("stays silent when Relay does not respond because no version is available", () => {
    const down: RelayOutcome<unknown> = { status: "unreachable", message: "not running" };
    const blocked: RelayOutcome<unknown> = { status: "no-permission", message: "permission not granted" };

    expect(outdatedRelayVersion(down)).toBeNull();
    expect(outdatedRelayVersion(blocked)).toBeNull();
  });

  it("stays silent when the response has no version", () => {
    // Thứ đang nghe ở cổng đó có thể không phải cầu nối. Suy ra "bản cũ" từ một trường vắng mặt
    // là gửi người ta đi cài lại một chương trình vốn không phải nguyên nhân.
    const outcome: RelayOutcome<unknown> = { status: "ok", data: {} };
    expect(outdatedRelayVersion(outcome)).toBeNull();
  });
});

describe("relaySupportsDeviceRetirement", () => {
  it("blocks the pre-retirement v10 artifact before server revocation", () => {
    expect(relaySupportsDeviceRetirement(RELAY_DEVICE_RETIREMENT_MIN_VERSION - 1)).toBe(false);
    expect(relaySupportsDeviceRetirement(undefined)).toBe(false);
  });

  it("accepts the first retirement-capable Relay and later versions", () => {
    expect(relaySupportsDeviceRetirement(RELAY_DEVICE_RETIREMENT_MIN_VERSION)).toBe(true);
    expect(relaySupportsDeviceRetirement(RELAY_DEVICE_RETIREMENT_MIN_VERSION + 1)).toBe(true);
  });
});
