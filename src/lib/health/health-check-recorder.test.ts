import { describe, expect, it } from "vitest";
import { nextAccountStatus } from "./health-check-recorder";

/**
 * Quy tắc một chiều: bộ dò được phép cách ly nick, KHÔNG được phép gỡ cách ly.
 * Một lần dò khỏe sau khi dính shadowban chỉ chứng minh lần dò đó không thấy vấn đề.
 */
describe("nextAccountStatus", () => {
  it("nick khỏe bị phát hiện ẩn thì cách ly", () => {
    expect(nextAccountStatus("ALIVE", "SHADOWBANNED")).toBe("SHADOWBANNED");
  });

  it("nick khỏe dính checkpoint thì cách ly", () => {
    expect(nextAccountStatus("ALIVE", "CHECKPOINT")).toBe("CHECKPOINT");
  });

  it("nick đang cold-start vẫn cách ly được", () => {
    expect(nextAccountStatus("COLD_START", "SHADOWBANNED")).toBe("SHADOWBANNED");
  });

  it("dò khỏe KHÔNG tự gỡ cách ly — quyết định đó là của người", () => {
    expect(nextAccountStatus("SHADOWBANNED", "HEALTHY")).toBeNull();
    expect(nextAccountStatus("CHECKPOINT", "HEALTHY")).toBeNull();
  });

  it("WARN không đổi trạng thái — mod xóa bài cũng cho ra WARN", () => {
    expect(nextAccountStatus("ALIVE", "WARN")).toBeNull();
  });

  it("ERROR không đổi trạng thái — bộ dò đang mù thì không kết luận gì", () => {
    expect(nextAccountStatus("ALIVE", "ERROR")).toBeNull();
  });

  it("nick đã chết thì không leo ngược lên trạng thái nhẹ hơn", () => {
    expect(nextAccountStatus("DEAD", "SHADOWBANNED")).toBeNull();
    expect(nextAccountStatus("DEAD", "CHECKPOINT")).toBeNull();
  });

  it("checkpoint nặng hơn bị ẩn nên vẫn leo tiếp được", () => {
    expect(nextAccountStatus("SHADOWBANNED", "CHECKPOINT")).toBe("CHECKPOINT");
  });

  it("đang ở đúng trạng thái đó rồi thì không ghi lại", () => {
    expect(nextAccountStatus("SHADOWBANNED", "SHADOWBANNED")).toBeNull();
  });
});
