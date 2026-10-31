import { describe, expect, it } from "vitest";
import { TICKET_KINDS } from "../../src/lib/tickets/ticket-types";
import { TicketPayloadError, reviewTicketPayload } from "./ticket-payload-schema";

const LAUNCH = {
  kind: TICKET_KINDS.LAUNCH_PROFILE,
  accountId: "acc-1",
  antidetectProfileId: "profile-1",
  proxyLabel: "Webshare #3",
  proxy: { protocol: "http", host: "1.2.3.4", port: 8080, username: "u", password: "p" },
};

describe("reviewTicketPayload", () => {
  it("nhận ruột vé mở profile đầy đủ", () => {
    const payload = reviewTicketPayload(TICKET_KINDS.LAUNCH_PROFILE, LAUNCH);

    expect(payload.kind).toBe(TICKET_KINDS.LAUNCH_PROFILE);
    if (payload.kind !== TICKET_KINDS.LAUNCH_PROFILE) return;
    expect(payload.proxy.port).toBe(8080);
  });

  it("proxy không cần đăng nhập vẫn hợp lệ", () => {
    // Proxy công cộng hoặc proxy lọc theo IP thì không có user/pass — không phải lỗi.
    const payload = reviewTicketPayload(TICKET_KINDS.LAUNCH_PROFILE, {
      ...LAUNCH,
      proxy: { protocol: "socks5", host: "1.2.3.4", port: 1080 },
    });

    if (payload.kind !== TICKET_KINDS.LAUNCH_PROFILE) throw new Error("sai nhánh");
    expect(payload.proxy.username).toBeUndefined();
  });

  it("thiếu một trường thì nói TÊN trường đó, và đoán đúng nguyên nhân", () => {
    // Bản .exe cũ gặp định dạng mới là ca chính của cả file này (QĐ 11 — không tự cập nhật).
    expect(() =>
      reviewTicketPayload(TICKET_KINDS.LAUNCH_PROFILE, { ...LAUNCH, antidetectProfileId: "" }),
    ).toThrow(/antidetectProfileId/);

    expect(() =>
      reviewTicketPayload(TICKET_KINDS.LAUNCH_PROFILE, { ...LAUNCH, antidetectProfileId: "" }),
    ).toThrow(/lệch phiên bản/);
  });

  it("từ chối giao thức proxy lạ", () => {
    expect(() =>
      reviewTicketPayload(TICKET_KINDS.LAUNCH_PROFILE, {
        ...LAUNCH,
        proxy: { ...LAUNCH.proxy, protocol: "ftp" },
      }),
    ).toThrow(TicketPayloadError);
  });

  it.each([0, 65536, 8080.5, "8080"])("từ chối cổng proxy không hợp lệ: %s", (port) => {
    expect(() =>
      reviewTicketPayload(TICKET_KINDS.LAUNCH_PROFILE, {
        ...LAUNCH,
        proxy: { ...LAUNCH.proxy, port },
      }),
    ).toThrow(/cổng/);
  });

  it("nhận ruột vé bí mật và vé OTP", () => {
    expect(
      reviewTicketPayload(TICKET_KINDS.CREDENTIAL, {
        accountId: "acc-1",
        field: "emailPassword",
        credentialCiphertext: "v1.aa.bb.cc",
      }).kind,
    ).toBe(TICKET_KINDS.CREDENTIAL);

    expect(
      reviewTicketPayload(TICKET_KINDS.OTP, {
        accountId: "acc-1",
        totpSecretCiphertext: "v1.aa.bb.cc",
      }).kind,
    ).toBe(TICKET_KINDS.OTP);
  });

  it("từ chối loại bí mật lạ", () => {
    expect(() =>
      reviewTicketPayload(TICKET_KINDS.CREDENTIAL, {
        accountId: "acc-1",
        field: "totpSecret",
        credentialCiphertext: "v1.aa.bb.cc",
      }),
    ).toThrow(/loại bí mật lạ/);
  });

  it("loại vé bản này chưa biết thì bảo tải lại cầu nối", () => {
    expect(() => reviewTicketPayload("VIEC_MOI_CUA_NAM_SAU", {})).toThrow(/Tải lại cầu nối/);
  });

  it("ruột vé không phải object thì báo ngay, không đi tiếp", () => {
    expect(() => reviewTicketPayload(TICKET_KINDS.OTP, "một chuỗi")).toThrow(TicketPayloadError);
    expect(() => reviewTicketPayload(TICKET_KINDS.OTP, null)).toThrow(TicketPayloadError);
  });
});
