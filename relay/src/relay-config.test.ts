import { describe, expect, it } from "vitest";
import { reviewRelayConfig } from "./relay-config";

const HEX_64 = "a".repeat(64);

/** Cấu hình đủ và đúng — mỗi test làm hỏng đúng một ô của nó. */
function validConfig(overrides: Record<string, unknown> = {}) {
  return {
    deviceId: "cm4xdevice0001",
    serverPublicKey: HEX_64,
    vaultKeyOperator: "b".repeat(64),
    webOrigin: "https://mkttool.example.com",
    ...overrides,
  };
}

/** Các trường đang có vấn đề, để so sánh gọn. */
function problemFields(parsed: unknown): string[] {
  const result = reviewRelayConfig(parsed);
  return result.ok ? [] : result.problems.map((problem) => problem.field);
}

describe("reviewRelayConfig", () => {
  it("nhận cấu hình đủ và chuẩn hóa nguồn web", () => {
    const result = reviewRelayConfig(validConfig({ webOrigin: "https://mkttool.example.com/" }));

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    // `Access-Control-Allow-Origin` so nguyên văn với header `Origin`, mà header đó không có
    // dấu `/` cuối. Không chuẩn hóa là mọi lời gọi hỏng theo kiểu CORS.
    expect(result.config.webOrigin).toBe("https://mkttool.example.com");
  });

  it("hạ chữ thường hai khóa hex — dán từ chỗ viết hoa vẫn phải dùng được", () => {
    const result = reviewRelayConfig(
      validConfig({ serverPublicKey: HEX_64.toUpperCase(), vaultKeyOperator: "B".repeat(64) }),
    );

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.config.serverPublicKey).toBe(HEX_64);
    expect(result.config.vaultKeyOperator).toBe("b".repeat(64));
  });

  it("gom HẾT vấn đề trong một lượt, không dừng ở cái đầu tiên", () => {
    // Dừng ở lỗi đầu thì người cài phải sửa-chạy-lại một vòng cho mỗi ô.
    //
    // `webOrigin` KHÔNG có trong danh sách này, và đó là chủ ý: nó lấy mặc định từ bản build
    // (`BUILT_IN_WEB_ORIGIN`), file cấu hình chỉ ghi đè. Bắt buộc nó thì một chiếc máy vừa cài
    // không bao giờ ra khỏi vạch xuất phát — web app cần CORS để cấu hình hộ, mà CORS cần nguồn
    // tin, mà nguồn tin lại chỉ có sau khi cấu hình đủ. Xem `resolveWebOrigin`.
    expect(problemFields({})).toEqual(["deviceId", "serverPublicKey", "vaultKeyOperator"]);
  });

  it("bắt khóa sai độ dài", () => {
    expect(problemFields(validConfig({ vaultKeyOperator: "abc" }))).toEqual(["vaultKeyOperator"]);
  });

  it("bắt khóa đúng độ dài nhưng không phải hex", () => {
    expect(problemFields(validConfig({ serverPublicKey: "z".repeat(64) }))).toEqual([
      "serverPublicKey",
    ]);
  });

  it("từ chối webOrigin kèm đường dẫn", () => {
    // Dán nguyên địa chỉ đang mở trên thanh địa chỉ là lỗi tự nhiên nhất của cả file này.
    expect(problemFields(validConfig({ webOrigin: "https://mkttool.example.com/accounts" }))).toEqual(
      ["webOrigin"],
    );
  });

  it("từ chối webOrigin không phải địa chỉ", () => {
    expect(problemFields(validConfig({ webOrigin: "mkttool.example.com" }))).toEqual(["webOrigin"]);
  });

  it("khoảng trắng thừa quanh giá trị không tính là đã điền", () => {
    expect(problemFields(validConfig({ deviceId: "   " }))).toEqual(["deviceId"]);
  });

  it("file không phải object thì báo ở mức file, không đổ lỗi cho từng trường", () => {
    const result = reviewRelayConfig("một chuỗi");

    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.problems).toHaveLength(1);
    expect(result.problems[0].field).toBe("file");
  });

  it("mọi câu báo đều nói được phải làm gì, không chỉ nói đang sai", () => {
    const result = reviewRelayConfig({});

    expect(result.ok).toBe(false);
    if (result.ok) return;
    for (const problem of result.problems) {
      expect(problem.message.length).toBeGreaterThan(40);
    }
  });
});
