/**
 * Dải "cầu nối bản cũ" chỉ được kêu khi **biết chắc**.
 *
 * Hai kiểu sai đều tốn kém theo cách riêng: kêu nhầm thì dạy người ta phớt lờ chính cái dải sẽ
 * quan trọng vào ngày nâng `MIN_RELAY_VERSION`; im lặng nhầm thì cả team phát hiện cùng lúc,
 * đúng lúc vé bắt đầu bị từ chối.
 */
import { describe, expect, it } from "vitest";
import { outdatedRelayVersion, type RelayOutcome } from "./relay-browser-client";
import { RELAY_VERSION } from "./relay-endpoints";

const OLD = RELAY_VERSION - 1;

describe("outdatedRelayVersion", () => {
  it("trả số bản khi cầu nối trả lời và bản đó cũ hơn", () => {
    const outcome: RelayOutcome<unknown> = { status: "ok", data: {}, relayVersion: OLD };
    expect(outdatedRelayVersion(outcome)).toBe(OLD);
  });

  it("kêu cả khi cầu nối TỪ CHỐI — đó mới là máy cần nhắc nhất", () => {
    // Bản quá cũ tới mức vé bị chặn (`RELAY_TOO_OLD`) đi ra bằng đúng nhánh này.
    const outcome: RelayOutcome<unknown> = {
      status: "rejected",
      message: "Bản cầu nối này quá cũ",
      relayVersion: OLD,
    };
    expect(outdatedRelayVersion(outcome)).toBe(OLD);
  });

  it("im khi bản đang chạy đã đúng bản phát hành", () => {
    const outcome: RelayOutcome<unknown> = { status: "ok", data: {}, relayVersion: RELAY_VERSION };
    expect(outdatedRelayVersion(outcome)).toBeNull();
  });

  it("im khi cầu nối chạy bản MỚI hơn máy chủ", () => {
    // Xảy ra thật lúc một máy cài bản vừa build còn máy chủ chưa deploy. Không phải lỗi, và
    // càng không phải lý do bảo người ta "tải bản mới".
    const outcome: RelayOutcome<unknown> = {
      status: "ok",
      data: {},
      relayVersion: RELAY_VERSION + 1,
    };
    expect(outdatedRelayVersion(outcome)).toBeNull();
  });

  it("im khi cầu nối không trả lời — không có số nào để so", () => {
    const down: RelayOutcome<unknown> = { status: "unreachable", message: "chưa chạy" };
    const blocked: RelayOutcome<unknown> = { status: "no-permission", message: "chưa cấp quyền" };

    expect(outdatedRelayVersion(down)).toBeNull();
    expect(outdatedRelayVersion(blocked)).toBeNull();
  });

  it("im khi phản hồi thiếu hẳn số phiên bản", () => {
    // Thứ đang nghe ở cổng đó có thể không phải cầu nối. Suy ra "bản cũ" từ một trường vắng mặt
    // là gửi người ta đi cài lại một chương trình vốn không phải nguyên nhân.
    const outcome: RelayOutcome<unknown> = { status: "ok", data: {} };
    expect(outdatedRelayVersion(outcome)).toBeNull();
  });
});
