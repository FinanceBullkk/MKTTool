/**
 * Bảng chuyển trạng thái của cụm: hai ô, mỗi ô bốn lối đi.
 *
 * Kiểm ở đây chứ không kiểm qua server action vì đây là phần duy nhất có nhánh — và một phép
 * kiểm không cần database thì không ai ngại chạy.
 */
import { describe, expect, it } from "vitest";
import { AUDIT_ACTIONS } from "@/lib/audit/audit-log-actions";
import { DEVICE_MOVE_WARNING, describeClusterChange } from "./account-cluster-change";

const NOBODY = { ownerId: null, deviceId: null };

/** Gọn hóa lời gọi — phần lớn bài chỉ quan tâm hai trạng thái và tên. */
function change(
  before: { ownerId: string | null; deviceId: string | null },
  after: { ownerId: string | null; deviceId: string | null },
  names: { ownerEmail?: string | null; deviceName?: string | null; previousDeviceName?: string | null } = {},
) {
  return describeClusterChange({
    before,
    after,
    ownerEmail: names.ownerEmail ?? null,
    deviceName: names.deviceName ?? null,
    previousDeviceName: names.previousDeviceName ?? null,
  });
}

const actionsOf = (result: ReturnType<typeof change>) =>
  result.auditActions.map((entry) => entry.action);

describe("chủ nick", () => {
  it("gán lần đầu ghi ACCOUNT_OWNER_ASSIGNED kèm email", () => {
    const result = change(NOBODY, { ownerId: "u1", deviceId: null }, { ownerEmail: "ha@x.test" });

    expect(actionsOf(result)).toEqual([AUDIT_ACTIONS.ACCOUNT_OWNER_ASSIGNED]);
    expect(result.auditActions[0].detail).toContain("ha@x.test");
    expect(result.message).toContain("ha@x.test");
  });

  it("gỡ chủ ghi ACCOUNT_OWNER_CLEARED và nói rõ hệ quả", () => {
    const result = change({ ownerId: "u1", deviceId: null }, NOBODY);

    expect(actionsOf(result)).toEqual([AUDIT_ACTIONS.ACCOUNT_OWNER_CLEARED]);
    // Câu báo phải nói ra thứ người bấm chưa nghĩ tới: nick mất chủ là OPERATOR nào cũng bị từ chối.
    expect(result.message).toContain("chỉ quản trị viên");
  });

  it("đổi chủ vẫn là ASSIGNED, không phải một loại riêng", () => {
    const result = change(
      { ownerId: "u1", deviceId: null },
      { ownerId: "u2", deviceId: null },
      { ownerEmail: "nam@x.test" },
    );

    expect(actionsOf(result)).toEqual([AUDIT_ACTIONS.ACCOUNT_OWNER_ASSIGNED]);
  });
});

describe("máy giữ nick", () => {
  it("ghim lần đầu là PINNED", () => {
    const result = change(
      { ownerId: "u1", deviceId: null },
      { ownerId: "u1", deviceId: "d1" },
      { deviceName: "Laptop Dell" },
    );

    expect(actionsOf(result)).toEqual([AUDIT_ACTIONS.ACCOUNT_DEVICE_PINNED]);
    expect(result.message).toContain("Laptop Dell");
  });

  it("gỡ ghim là UNPINNED và nêu tên máy cũ", () => {
    const result = change(
      { ownerId: "u1", deviceId: "d1" },
      { ownerId: "u1", deviceId: null },
      { previousDeviceName: "Laptop Dell" },
    );

    expect(actionsOf(result)).toEqual([AUDIT_ACTIONS.ACCOUNT_DEVICE_UNPINNED]);
    expect(result.auditActions[0].detail).toContain("Laptop Dell");
  });

  /**
   * Ca đáng soi nhất, nên nó có loại riêng: chuyển máy mà quên xóa profile ở máy cũ là nick
   * sống ở hai nơi cùng lúc. Một loại chung với PINNED thì câu hỏi "nick này từng ở máy nào"
   * phải đi đọc `detail`, mà `detail` là chuỗi tự do.
   */
  it("đổi máy là MOVED, và câu báo kèm cảnh báo xóa bản cũ", () => {
    const result = change(
      { ownerId: "u1", deviceId: "d1" },
      { ownerId: "u1", deviceId: "d2" },
      { deviceName: "VPS US", previousDeviceName: "Laptop Dell" },
    );

    expect(actionsOf(result)).toEqual([AUDIT_ACTIONS.ACCOUNT_DEVICE_MOVED]);
    expect(result.auditActions[0].detail).toContain("Laptop Dell");
    expect(result.auditActions[0].detail).toContain("VPS US");
    expect(result.message).toContain(DEVICE_MOVE_WARNING);
  });
});

describe("hai ô cùng đổi", () => {
  it("ghi hai hàng, mỗi thứ một hàng", () => {
    const result = change(NOBODY, { ownerId: "u1", deviceId: "d1" }, {
      ownerEmail: "ha@x.test",
      deviceName: "Laptop Dell",
    });

    expect(actionsOf(result)).toEqual([
      AUDIT_ACTIONS.ACCOUNT_OWNER_ASSIGNED,
      AUDIT_ACTIONS.ACCOUNT_DEVICE_PINNED,
    ]);
  });

  /**
   * Bấm lưu mà không đổi gì thì KHÔNG được ghi hàng nào. Nhật ký phình ra vì những lượt bấm
   * vô hại là nhật ký không ai đọc — và nó chỉ có một công dụng duy nhất, vào đúng ngày phải
   * dựng lại chuyện đã xảy ra.
   */
  it("không đổi gì thì không ghi hàng nào", () => {
    const result = change({ ownerId: "u1", deviceId: "d1" }, { ownerId: "u1", deviceId: "d1" });

    expect(result.auditActions).toEqual([]);
    expect(result.message).toBe("");
  });
});
