/**
 * Bộ cài phải giữ được chỗ để bộ build nung số bản vào.
 *
 * Chốt "không đè lên bản mới hơn" chỉ hoạt động khi `install-relay.ps1` biết mình là bản mấy, và
 * nó biết được là nhờ `build-relay-executable.ts` thay đúng một dòng lúc đóng gói. Mất dòng đó —
 * đổi tên biến, sửa thành một số cứng, gộp câu lệnh — thì chốt im lặng bỏ qua **mọi** lần cài, và
 * lỗi hạ cấp âm thầm ngày 18/08/2026 quay lại nguyên vẹn.
 *
 * Bộ build có kiểm chuyện này rồi và thoát 1 nếu thiếu. Phép kiểm ở đây tồn tại vì bộ build **chỉ
 * chạy lúc phát hành** — vài tuần một lần, sau khi mã đã nằm trên nhánh chính từ lâu. Bài này chạy
 * ở mọi PR. Đúng luật của phiên 18/08: một phép kiểm không chạy trong môi trường mà thứ nó bảo vệ
 * đang sống thì coi như không có.
 */
import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

const INSTALLER = readFileSync(
  path.join(process.cwd(), "relay", "install-relay.ps1"),
  "utf8",
);

describe("install-relay.ps1", () => {
  it("giữ nguyên chỗ để bộ build nung số bản vào", () => {
    expect(
      INSTALLER.includes("$incomingVersion = 0"),
      'Mất dòng "$incomingVersion = 0" — đó là chỗ build-relay-executable.ts thay số bản vào.\n' +
        "Thiếu nó thì chốt chặn hạ cấp bỏ qua mọi lần cài, im lặng.",
    ).toBe(true);
  });

  it("chốt hạ cấp bỏ qua chứ không dừng với lỗi", () => {
    // `installer.nsh` của MKT Browser huỷ cả lượt cài nếu script này thất bại. Bỏ qua phải là
    // `exit 0`, nếu không thì máy có cầu nối mới hơn sẽ không cài nổi trình duyệt.
    const khoiChot = INSTALLER.slice(INSTALLER.indexOf("$installedVersion -gt $incomingVersion"));
    expect(khoiChot.slice(0, 400)).toContain("exit 0");
  });

  it("ghi mốc phiên bản sau khi chép, để lần cài sau so được", () => {
    expect(INSTALLER).toContain("relay-installed-version.txt");
    expect(INSTALLER).toContain("Set-Content -LiteralPath $versionFile");
  });
});
